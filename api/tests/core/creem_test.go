// Package core_test tests src/core's clients against fake servers. It needs
// no database.
package core_test

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"steadylearn-api/src/core"
	"steadylearn-api/tests/testutil"
)

// creemRequest is what the fake Creem received.
type creemRequest struct {
	Method string
	Path   string
	Query  string
	APIKey string
	Body   map[string]any
}

// useFakeCreem points core.Creem at a fake Creem that records each request
// and answers it with status and response.
func useFakeCreem(t *testing.T, status int, response string) *[]creemRequest {
	t.Helper()
	testutil.UseCreem(t) // turns billing on, and restores core.Creem after
	requests := &[]creemRequest{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		recorded := creemRequest{Method: r.Method, Path: r.URL.Path, Query: r.URL.RawQuery, APIKey: r.Header.Get("x-api-key")}
		if data, _ := io.ReadAll(r.Body); len(data) > 0 {
			require.NoError(t, json.Unmarshal(data, &recorded.Body))
		}
		*requests = append(*requests, recorded)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_, _ = io.WriteString(w, response)
	}))
	t.Cleanup(server.Close)

	previous := core.Config.CreemAPIURL
	core.Config.CreemAPIURL = server.URL + "/v1/"
	t.Cleanup(func() { core.Config.CreemAPIURL = previous })
	core.InitCreem()
	return requests
}

func TestCreemGetSubscription(t *testing.T) {
	requests := useFakeCreem(t, http.StatusOK, `{
		"id": "sub_1", "status": "scheduled_cancel",
		"product": {"id": "prod_1", "name": "Monthly"},
		"customer": "cust_1",
		"current_period_start_date": "2026-10-03T14:12:24.000Z",
		"current_period_end_date": "2026-11-03T14:12:24.000Z",
		"next_transaction_date": "2026-11-03T14:12:24.000Z",
		"canceled_at": null,
		"created_at": "2026-03-14T09:30:00.000Z",
		"updated_at": "2026-10-03T14:12:24.000Z",
		"metadata": {"user_id": "u1"}
	}`)

	subscription, err := core.Creem.GetSubscription(context.Background(), "sub_1")
	require.NoError(t, err)
	assert.Equal(t, "sub_1", subscription.Id)
	assert.Equal(t, "prod_1", subscription.Product.Id, "an object")
	assert.Equal(t, "cust_1", subscription.Customer.Id, "a bare id")
	assert.Equal(t, time.Date(2026, 11, 3, 14, 12, 24, 0, time.UTC), subscription.CurrentPeriodEndDate.UTC())
	assert.Equal(t, time.Date(2026, 10, 3, 14, 12, 24, 0, time.UTC), subscription.CurrentPeriodStartDate.UTC())
	assert.Equal(t, time.Date(2026, 11, 3, 14, 12, 24, 0, time.UTC), subscription.NextTransactionDate.UTC())
	assert.Equal(t, time.Date(2026, 3, 14, 9, 30, 0, 0, time.UTC), subscription.CreatedAt.UTC())
	assert.Nil(t, subscription.CanceledAt)
	assert.Equal(t, "u1", subscription.Metadata["user_id"])

	require.Len(t, *requests, 1)
	assert.Equal(t, creemRequest{Method: "GET", Path: "/v1/subscriptions", Query: "subscription_id=sub_1", APIKey: "creem_test_key"}, (*requests)[0])
}

func TestCreemListTransactions(t *testing.T) {
	testutil.UseCreem(t)
	// Two pages: the second is asked for because the first names it.
	var queries []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		queries = append(queries, r.URL.Path+"?"+r.URL.RawQuery)
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Query().Get("page_number") == "1" {
			_, _ = io.WriteString(w, `{"items":[{
				"id":"tran_1","amount":2400,"currency":"USD","type":"invoice","status":"paid",
				"subscription":"sub_1","customer":"cust_1",
				"period_start":1759500744000,"period_end":1762179144000,"created_at":1759500744000
			}],"pagination":{"total_records":2,"total_pages":2,"current_page":1,"next_page":2,"prev_page":null}}`)
			return
		}
		_, _ = io.WriteString(w, `{"items":[{"id":"tran_2","amount":2400,"currency":"USD","status":"declined",
			"subscription":{"id":"sub_1"},"created_at":1762179144000}],
			"pagination":{"total_records":2,"total_pages":2,"current_page":2,"next_page":null,"prev_page":1}}`)
	}))
	t.Cleanup(server.Close)
	previous := core.Config.CreemAPIURL
	core.Config.CreemAPIURL = server.URL + "/v1"
	t.Cleanup(func() { core.Config.CreemAPIURL = previous })
	core.InitCreem()

	transactions, err := core.Creem.ListTransactions(context.Background(), "cust_1")
	require.NoError(t, err)
	assert.Equal(t, []string{
		"/v1/transactions/search?customer_id=cust_1&page_number=1&page_size=50",
		"/v1/transactions/search?customer_id=cust_1&page_number=2&page_size=50",
	}, queries)
	require.Len(t, transactions, 2)
	first := transactions[0]
	assert.Equal(t, "tran_1", first.Id)
	assert.Equal(t, int64(2400), first.Amount)
	assert.Equal(t, "sub_1", first.Subscription.Id, "a bare id")
	assert.Equal(t, time.Date(2025, 10, 3, 14, 12, 24, 0, time.UTC), first.CreatedAt.Time, "epoch milliseconds")
	require.NotNil(t, first.PeriodEnd)
	assert.Equal(t, time.Date(2025, 11, 3, 14, 12, 24, 0, time.UTC), first.PeriodEnd.Time)
	assert.Equal(t, "sub_1", transactions[1].Subscription.Id, "an object")
	assert.Nil(t, transactions[1].PeriodStart)
}

func TestCreemRequests(t *testing.T) {
	ctx := context.Background()
	cases := []struct {
		name     string
		call     func() error
		response string
		want     creemRequest
	}{
		{
			name: "checkout",
			call: func() error {
				checkout, err := core.Creem.CreateCheckout(ctx, core.CreemCheckoutRequest{
					ProductId: "prod_1", RequestId: "req_1", SuccessURL: "https://app.test/subscription",
					Customer: &core.CreemCustomerRef{Email: "ada@example.com"}, Metadata: map[string]string{"user_id": "u1"},
				})
				assert.Equal(t, "https://checkout.creem.io/ch_1", checkout.CheckoutURL)
				return err
			},
			response: `{"id":"ch_1","checkout_url":"https://checkout.creem.io/ch_1","status":"pending"}`,
			want: creemRequest{Method: "POST", Path: "/v1/checkouts", Body: map[string]any{
				"product_id": "prod_1", "request_id": "req_1", "success_url": "https://app.test/subscription",
				"customer": map[string]any{"email": "ada@example.com"}, "metadata": map[string]any{"user_id": "u1"},
			}},
		},
		{
			name: "cancel",
			call: func() error {
				_, err := core.Creem.CancelSubscription(ctx, "sub_1")
				return err
			},
			response: `{"id":"sub_1","status":"scheduled_cancel"}`,
			want:     creemRequest{Method: "POST", Path: "/v1/subscriptions/sub_1/cancel", Body: map[string]any{"mode": "scheduled", "onExecute": "cancel"}},
		},
		{
			name: "resume",
			call: func() error {
				_, err := core.Creem.ResumeSubscription(ctx, "sub_1")
				return err
			},
			response: `{"id":"sub_1","status":"active"}`,
			want:     creemRequest{Method: "POST", Path: "/v1/subscriptions/sub_1/resume"},
		},
		{
			name: "portal",
			call: func() error {
				link, err := core.Creem.CreateBillingPortalLink(ctx, "cust_1")
				assert.Equal(t, "https://creem.io/portal/1", link)
				return err
			},
			response: `{"customer_portal_link":"https://creem.io/portal/1"}`,
			want:     creemRequest{Method: "POST", Path: "/v1/customers/billing", Body: map[string]any{"customer_id": "cust_1"}},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			requests := useFakeCreem(t, http.StatusOK, tc.response)
			require.NoError(t, tc.call())
			require.Len(t, *requests, 1)
			tc.want.APIKey = "creem_test_key"
			assert.Equal(t, tc.want, (*requests)[0])
		})
	}
}

func TestCreemErrors(t *testing.T) {
	useFakeCreem(t, http.StatusNotFound, `{"message":"not found"}`)
	_, err := core.Creem.GetSubscription(context.Background(), "sub_missing")
	assert.ErrorIs(t, err, core.ErrCreemNotFound)

	useFakeCreem(t, http.StatusBadRequest, `{"message":"bad product"}`)
	_, err = core.Creem.CreateCheckout(context.Background(), core.CreemCheckoutRequest{ProductId: "prod_1"})
	require.Error(t, err)
	assert.NotErrorIs(t, err, core.ErrCreemNotFound)
	assert.Contains(t, err.Error(), "status 400")
	assert.NotContains(t, err.Error(), "creem_test_key")
}

func TestVerifyCreemSignature(t *testing.T) {
	testutil.UseCreem(t)
	body := []byte(`{"id":"evt_1"}`)

	assert.True(t, core.VerifyCreemSignature(body, testutil.SignCreem(body)))
	assert.False(t, core.VerifyCreemSignature(body, testutil.SignCreem([]byte(`{"id":"evt_2"}`))))
	assert.False(t, core.VerifyCreemSignature(body, ""))
	assert.False(t, core.VerifyCreemSignature(body, "zz"))
}

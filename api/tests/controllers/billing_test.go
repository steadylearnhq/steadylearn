package controllers_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"steadylearn-api/src/api/v1/controllers"
	"steadylearn-api/src/core"
	"steadylearn-api/src/schemas"
	"steadylearn-api/tests/testutil"
)

// billingRouter serves the billing routes for one signed-in caller, and the
// webhook route, which takes no caller.
func billingRouter(userId uuid.UUID) *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/webhooks/creem", controllers.CreemWebhook)

	member := router.Group("/billing", func(c *gin.Context) { c.Set("user_id", userId) })
	member.GET("/subscription", controllers.GetBilling)
	member.GET("/payments", controllers.ListPayments)
	member.POST("/checkout", controllers.StartCheckout)
	member.POST("/sync", controllers.SyncSubscription)
	member.POST("/cancel", controllers.CancelSubscription)
	member.POST("/resume", controllers.ResumeSubscription)
	member.POST("/portal", controllers.OpenBillingPortal)
	return router
}

func serve(router *gin.Engine, method, path, body string, header map[string]string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	req := httptest.NewRequestWithContext(context.Background(), method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	for name, value := range header {
		req.Header.Set(name, value)
	}
	router.ServeHTTP(rec, req)
	return rec
}

func TestBillingRoutesWhileBillingIsOff(t *testing.T) {
	testutil.UseDB(t)
	router := billingRouter(uuid.New())

	rec := serve(router, http.MethodGet, "/billing/subscription", "", nil)
	require.Equal(t, http.StatusOK, rec.Code)
	assert.JSONEq(t, `{"subscription":null}`, rec.Body.String())

	for _, path := range []string{"/billing/checkout", "/billing/cancel", "/billing/resume", "/billing/portal", "/webhooks/creem"} {
		assert.Equal(t, http.StatusServiceUnavailable, serve(router, http.MethodPost, path, "{}", nil).Code, path)
	}
	assert.Equal(t, http.StatusServiceUnavailable,
		serve(router, http.MethodPost, "/billing/sync", `{"subscriptionId":"sub_1"}`, nil).Code)
	assert.Equal(t, http.StatusServiceUnavailable, serve(router, http.MethodGet, "/billing/payments", "", nil).Code)
}

func TestBillingRoutes(t *testing.T) {
	testutil.UseDB(t)
	creem := testutil.UseCreem(t)
	userId := uuid.New()
	router := billingRouter(userId)
	subscription := core.CreemSubscription{
		Id:       "sub_1",
		Status:   "active",
		Product:  core.CreemRef{Id: testutil.CreemProductId},
		Customer: core.CreemRef{Id: "cust_1"},
		Metadata: map[string]any{"user_id": userId.String()},
	}

	assert.Equal(t, http.StatusNotFound, serve(router, http.MethodPost, "/billing/portal", "", nil).Code, "never subscribed")
	assert.Equal(t, http.StatusNotFound, serve(router, http.MethodPost, "/billing/cancel", "", nil).Code, "nothing to cancel")
	assert.Equal(t, http.StatusBadRequest, serve(router, http.MethodPost, "/billing/sync", `{}`, nil).Code, "no subscription id")

	creem.On("GetSubscription", mock.Anything, "sub_1").Return(subscription, nil).Once()
	rec := serve(router, http.MethodPost, "/billing/sync", `{"subscriptionId":"sub_1"}`, nil)
	require.Equal(t, http.StatusOK, rec.Code)
	var billing schemas.BillingSchema
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &billing))
	require.NotNil(t, billing.Subscription)
	assert.True(t, billing.Subscription.Entitled)

	assert.Equal(t, http.StatusConflict, serve(router, http.MethodPost, "/billing/checkout", "", nil).Code, "already subscribed")
	assert.Equal(t, http.StatusConflict, serve(router, http.MethodPost, "/billing/resume", "", nil).Code, "nothing to resume")

	creem.On("CreateBillingPortalLink", mock.Anything, "cust_1").Return("", errors.New("status 500")).Once()
	assert.Equal(t, http.StatusBadGateway, serve(router, http.MethodPost, "/billing/portal", "", nil).Code)

	creem.On("CreateBillingPortalLink", mock.Anything, "cust_1").Return("https://creem.io/portal/1", nil).Once()
	rec = serve(router, http.MethodPost, "/billing/portal", "", nil)
	require.Equal(t, http.StatusOK, rec.Code)
	assert.JSONEq(t, `{"url":"https://creem.io/portal/1"}`, rec.Body.String())

	creem.On("ListTransactions", mock.Anything, "cust_1").Return(nil, errors.New("status 500")).Once()
	assert.Equal(t, http.StatusBadGateway, serve(router, http.MethodGet, "/billing/payments", "", nil).Code)

	paidAt := time.Date(2026, 10, 3, 14, 12, 24, 0, time.UTC)
	creem.On("ListTransactions", mock.Anything, "cust_1").Return([]core.CreemTransaction{{
		Id: "tran_1", Amount: 2400, Currency: "USD", Status: "paid",
		Subscription: core.CreemRef{Id: "sub_1"}, CreatedAt: core.CreemTime{Time: paidAt},
	}}, nil).Once()
	rec = serve(router, http.MethodGet, "/billing/payments", "", nil)
	require.Equal(t, http.StatusOK, rec.Code)
	assert.JSONEq(t, `{"payments":[{"id":"tran_1","date":"2026-10-03T14:12:24Z","amount":2400,"currency":"USD","status":"paid","periodStart":null,"periodEnd":null}]}`,
		rec.Body.String())
}

func TestCreemWebhookRoute(t *testing.T) {
	testutil.UseDB(t)
	testutil.UseCreem(t)
	router := billingRouter(uuid.New())
	body := `{"id":"evt_1","eventType":"refund.created","created_at":1728734325927,"object":{"id":"ref_1"}}`
	signed := map[string]string{"creem-signature": testutil.SignCreem([]byte(body))}

	assert.Equal(t, http.StatusUnauthorized, serve(router, http.MethodPost, "/webhooks/creem", body, nil).Code, "unsigned")
	assert.Equal(t, http.StatusUnauthorized,
		serve(router, http.MethodPost, "/webhooks/creem", body+" ", signed).Code, "signed over different bytes")

	rec := serve(router, http.MethodPost, "/webhooks/creem", body, signed)
	require.Equal(t, http.StatusOK, rec.Code)
	assert.JSONEq(t, `{"received":true}`, rec.Body.String())
	assert.Equal(t, http.StatusOK, serve(router, http.MethodPost, "/webhooks/creem", body, signed).Code, "a repeated delivery")

	malformed := `{"eventType":"refund.created"}`
	assert.Equal(t, http.StatusBadRequest, serve(router, http.MethodPost, "/webhooks/creem", malformed,
		map[string]string{"creem-signature": testutil.SignCreem([]byte(malformed))}).Code)
}

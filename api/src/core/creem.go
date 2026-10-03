package core

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// CreemAPI is the part of Creem's API the API calls, so a test can stand in
// for Creem.
type CreemAPI interface {
	CreateCheckout(ctx context.Context, request CreemCheckoutRequest) (CreemCheckout, error)
	GetSubscription(ctx context.Context, subscriptionId string) (CreemSubscription, error)
	CancelSubscription(ctx context.Context, subscriptionId string) (CreemSubscription, error)
	ResumeSubscription(ctx context.Context, subscriptionId string) (CreemSubscription, error)
	CreateBillingPortalLink(ctx context.Context, customerId string) (string, error)
}

// Creem takes payments. InitCreem sets it when billing is configured, and it
// stays nil when billing is off.
var Creem CreemAPI

// ErrCreemNotFound is a 404 from Creem: an id it does not know.
var ErrCreemNotFound = errors.New("not found at creem")

// creemCallTimeout bounds each call, so a stalled Creem does not hold the
// request open.
const creemCallTimeout = 10 * time.Second

// creemMaxResponse caps how much of a response is read.
const creemMaxResponse = 1 << 20

// CreemCheckoutRequest starts a hosted checkout. Customer names an existing
// Creem customer by id or prefills a new one's email, never both.
type CreemCheckoutRequest struct {
	ProductId  string            `json:"product_id"`
	RequestId  string            `json:"request_id,omitempty"`
	SuccessURL string            `json:"success_url,omitempty"`
	Customer   *CreemCustomerRef `json:"customer,omitempty"`
	Metadata   map[string]string `json:"metadata,omitempty"`
}

type CreemCustomerRef struct {
	Id    string `json:"id,omitempty"`
	Email string `json:"email,omitempty"`
}

// CreemCheckout is a started checkout, and the page to send the buyer to.
type CreemCheckout struct {
	Id          string `json:"id"`
	CheckoutURL string `json:"checkout_url"`
}

// CreemSubscription is Creem's view of a subscription.
type CreemSubscription struct {
	Id                   string         `json:"id"`
	Status               string         `json:"status"`
	Product              CreemRef       `json:"product"`
	Customer             CreemRef       `json:"customer"`
	CurrentPeriodEndDate *time.Time     `json:"current_period_end_date"`
	CanceledAt           *time.Time     `json:"canceled_at"`
	UpdatedAt            *time.Time     `json:"updated_at"`
	Metadata             map[string]any `json:"metadata"`
}

// CreemRef is a Creem object Creem sends either whole or as its bare id,
// depending on the payload. Only the id is kept.
type CreemRef struct {
	Id string
}

func (r *CreemRef) UnmarshalJSON(data []byte) error {
	if string(data) == "null" {
		return nil
	}
	if len(data) > 0 && data[0] == '"' {
		return json.Unmarshal(data, &r.Id)
	}
	var object struct {
		Id string `json:"id"`
	}
	if err := json.Unmarshal(data, &object); err != nil {
		return err
	}
	r.Id = object.Id
	return nil
}

// InitCreem sets the Creem client when billing is configured, and leaves it
// nil otherwise.
func InitCreem() {
	if !Config.BillingEnabled() {
		return
	}
	Creem = &creemClient{
		baseURL: strings.TrimRight(Config.CreemAPIURL, "/"),
		apiKey:  Config.CreemAPIKey,
		http:    &http.Client{Timeout: creemCallTimeout},
	}
}

type creemClient struct {
	baseURL string
	apiKey  string
	http    *http.Client
}

func (c *creemClient) CreateCheckout(ctx context.Context, request CreemCheckoutRequest) (CreemCheckout, error) {
	var checkout CreemCheckout
	err := c.do(ctx, http.MethodPost, "/checkouts", nil, request, &checkout)
	return checkout, err
}

func (c *creemClient) GetSubscription(ctx context.Context, subscriptionId string) (CreemSubscription, error) {
	var subscription CreemSubscription
	err := c.do(ctx, http.MethodGet, "/subscriptions", url.Values{"subscription_id": {subscriptionId}}, nil, &subscription)
	return subscription, err
}

// CancelSubscription cancels at the end of the paid period, so the member
// keeps what they paid for.
func (c *creemClient) CancelSubscription(ctx context.Context, subscriptionId string) (CreemSubscription, error) {
	var subscription CreemSubscription
	body := map[string]string{"mode": "scheduled", "onExecute": "cancel"}
	err := c.do(ctx, http.MethodPost, "/subscriptions/"+url.PathEscape(subscriptionId)+"/cancel", nil, body, &subscription)
	return subscription, err
}

func (c *creemClient) ResumeSubscription(ctx context.Context, subscriptionId string) (CreemSubscription, error) {
	var subscription CreemSubscription
	err := c.do(ctx, http.MethodPost, "/subscriptions/"+url.PathEscape(subscriptionId)+"/resume", nil, nil, &subscription)
	return subscription, err
}

func (c *creemClient) CreateBillingPortalLink(ctx context.Context, customerId string) (string, error) {
	var link struct {
		CustomerPortalLink string `json:"customer_portal_link"`
	}
	err := c.do(ctx, http.MethodPost, "/customers/billing", nil, map[string]string{"customer_id": customerId}, &link)
	return link.CustomerPortalLink, err
}

// do sends one request and decodes the response into out. A response other
// than a 2xx is an error carrying Creem's status and message; the API key
// never appears in one.
func (c *creemClient) do(ctx context.Context, method, path string, query url.Values, body any, out any) error {
	var reader io.Reader
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("failed to encode creem request: %w", err)
		}
		reader = bytes.NewReader(encoded)
	}

	request, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, reader)
	if err != nil {
		return fmt.Errorf("failed to build creem request: %w", err)
	}
	if query != nil {
		request.URL.RawQuery = query.Encode()
	}
	request.Header.Set("x-api-key", c.apiKey)
	request.Header.Set("Accept", "application/json")
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}

	response, err := c.http.Do(request)
	if err != nil {
		return fmt.Errorf("creem %s %s failed: %w", method, path, err)
	}
	defer func() { _ = response.Body.Close() }()

	data, err := io.ReadAll(io.LimitReader(response.Body, creemMaxResponse))
	if err != nil {
		return fmt.Errorf("failed to read creem response: %w", err)
	}
	if response.StatusCode == http.StatusNotFound {
		return fmt.Errorf("creem %s %s: %w", method, path, ErrCreemNotFound)
	}
	if response.StatusCode < 200 || response.StatusCode > 299 {
		return fmt.Errorf("creem %s %s: status %d: %s", method, path, response.StatusCode, truncate(string(data), 500))
	}

	if err := json.Unmarshal(data, out); err != nil {
		return fmt.Errorf("failed to decode creem response: %w", err)
	}
	return nil
}

func truncate(value string, limit int) string {
	if len(value) <= limit {
		return value
	}
	return value[:limit] + "…"
}

// VerifyCreemSignature reports whether a webhook's creem-signature header is
// the hex HMAC-SHA256 of its raw body under the webhook secret. Creem signs no
// timestamp, so a replayed delivery passes; the handler is idempotent instead.
func VerifyCreemSignature(body []byte, signature string) bool {
	if Config.CreemWebhookSecret == "" || signature == "" {
		return false
	}
	given, err := hex.DecodeString(strings.TrimSpace(signature))
	if err != nil {
		return false
	}
	mac := hmac.New(sha256.New, []byte(Config.CreemWebhookSecret))
	mac.Write(body)
	return hmac.Equal(given, mac.Sum(nil))
}

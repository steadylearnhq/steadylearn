package controllers

import (
	"errors"
	"io"
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"steadylearn-api/src/schemas"
	"steadylearn-api/src/services"
)

// maxWebhookBody caps a webhook's body. Creem's events are a few kilobytes.
const maxWebhookBody = 1 << 20

// GetBilling handles reading the caller's billing state
// @Summary Get the caller's subscription
// @Description The caller's current subscription, or null when they have never subscribed. Read from the database, never cached, so it reflects a checkout, cancel or resume at once. Answers even while billing is off.
// @Tags billing
// @Produce json
// @Security BearerAuth
// @Success 200 {object} schemas.BillingSchema
// @Failure 401 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /v1/billing/subscription [get]
func GetBilling(c *gin.Context) {
	userId := c.MustGet("user_id").(uuid.UUID)

	billing, err := services.GetBilling(c.Request.Context(), userId)
	respondBilling(c, "GetBilling", billing, err)
}

// StartCheckout handles starting a checkout
// @Summary Start a checkout
// @Description Start a Creem checkout for the monthly subscription, and return the hosted page to send the caller to. Creem sends them back to the app's /subscription?checkout=success. A 409 means the caller already has access.
// @Tags billing
// @Produce json
// @Security BearerAuth
// @Success 200 {object} schemas.CheckoutSchema
// @Failure 401 {object} map[string]string
// @Failure 409 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Failure 502 {object} map[string]string
// @Failure 503 {object} map[string]string
// @Router /v1/billing/checkout [post]
func StartCheckout(c *gin.Context) {
	userId := c.MustGet("user_id").(uuid.UUID)

	checkout, err := services.StartCheckout(c.Request.Context(), userId)
	respondBilling(c, "StartCheckout", checkout, err)
}

// SyncSubscription handles storing a subscription right after checkout
// @Summary Sync a subscription after checkout
// @Description Read the subscription Creem returned the caller with after checkout, store it if it is theirs, and return their billing state. Lets the app confirm a payment without waiting for its webhook. A 404 means Creem has no such subscription for the caller.
// @Tags billing
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param sync body schemas.SyncRequest true "The subscription_id Creem appended to the success URL"
// @Success 200 {object} schemas.BillingSchema
// @Failure 400 {object} map[string]string
// @Failure 401 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Failure 502 {object} map[string]string
// @Failure 503 {object} map[string]string
// @Router /v1/billing/sync [post]
func SyncSubscription(c *gin.Context) {
	userId := c.MustGet("user_id").(uuid.UUID)

	var request schemas.SyncRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "A subscriptionId is required"})
		return
	}

	billing, err := services.SyncSubscription(c.Request.Context(), userId, request.SubscriptionId)
	respondBilling(c, "SyncSubscription", billing, err)
}

// CancelSubscription handles cancelling the caller's subscription
// @Summary Cancel the subscription
// @Description Cancel the caller's subscription at the end of the period they paid for, and return their billing state. They keep access until then, and can resume before it. A 409 means the subscription is not one that can be cancelled.
// @Tags billing
// @Produce json
// @Security BearerAuth
// @Success 200 {object} schemas.BillingSchema
// @Failure 401 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Failure 409 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Failure 502 {object} map[string]string
// @Failure 503 {object} map[string]string
// @Router /v1/billing/cancel [post]
func CancelSubscription(c *gin.Context) {
	userId := c.MustGet("user_id").(uuid.UUID)

	billing, err := services.CancelSubscription(c.Request.Context(), userId)
	respondBilling(c, "CancelSubscription", billing, err)
}

// ResumeSubscription handles undoing a cancellation
// @Summary Resume the subscription
// @Description Undo a cancellation that has not taken effect yet, or a pause, and return the caller's billing state. A 409 means the subscription is not cancelled or paused.
// @Tags billing
// @Produce json
// @Security BearerAuth
// @Success 200 {object} schemas.BillingSchema
// @Failure 401 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Failure 409 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Failure 502 {object} map[string]string
// @Failure 503 {object} map[string]string
// @Router /v1/billing/resume [post]
func ResumeSubscription(c *gin.Context) {
	userId := c.MustGet("user_id").(uuid.UUID)

	billing, err := services.ResumeSubscription(c.Request.Context(), userId)
	respondBilling(c, "ResumeSubscription", billing, err)
}

// OpenBillingPortal handles linking to Creem's customer portal
// @Summary Open the billing portal
// @Description A link to Creem's customer portal, where the caller changes their card and downloads invoices. A 404 means the caller has never subscribed.
// @Tags billing
// @Produce json
// @Security BearerAuth
// @Success 200 {object} schemas.PortalSchema
// @Failure 401 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Failure 502 {object} map[string]string
// @Failure 503 {object} map[string]string
// @Router /v1/billing/portal [post]
func OpenBillingPortal(c *gin.Context) {
	userId := c.MustGet("user_id").(uuid.UUID)

	portal, err := services.BillingPortalLink(c.Request.Context(), userId)
	respondBilling(c, "OpenBillingPortal", portal, err)
}

// ListPayments handles reading the caller's billing history
// @Summary List the caller's payments
// @Description Every charge of the caller's subscriptions, newest first, as Creem reports them. Cached for up to 10 minutes; a webhook or sync for the caller refreshes it. Amounts include VAT. Card details and invoice PDFs are in Creem's portal (POST /v1/billing/portal).
// @Tags billing
// @Produce json
// @Security BearerAuth
// @Success 200 {object} schemas.PaymentsSchema
// @Failure 401 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Failure 502 {object} map[string]string
// @Failure 503 {object} map[string]string
// @Router /v1/billing/payments [get]
func ListPayments(c *gin.Context) {
	userId := c.MustGet("user_id").(uuid.UUID)

	payments, err := services.ListPayments(c.Request.Context(), userId)
	respondBilling(c, "ListPayments", payments, err)
}

// respondBilling writes the response to a billing call.
func respondBilling(c *gin.Context, op string, body any, err error) {
	switch {
	case errors.Is(err, services.ErrBillingDisabled):
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Billing is unavailable"})
	case errors.Is(err, services.ErrAlreadySubscribed):
		c.JSON(http.StatusConflict, gin.H{"error": "Already subscribed"})
	case errors.Is(err, services.ErrNoSubscription):
		c.JSON(http.StatusNotFound, gin.H{"error": "Subscription not found"})
	case errors.Is(err, services.ErrSubscriptionState):
		c.JSON(http.StatusConflict, gin.H{"error": "The subscription cannot change that way"})
	// A failure at Creem or the user pool is the provider's, so it is a 502
	// with a generic message; what went wrong is only logged.
	case errors.Is(err, services.ErrPaymentProvider), errors.Is(err, services.ErrIdentityProvider):
		slog.ErrorContext(c.Request.Context(), op+" failed at a provider", "user_id", c.MustGet("user_id"), "error", err)
		c.JSON(http.StatusBadGateway, gin.H{"error": "The payment provider could not be reached"})
	case err != nil:
		slog.ErrorContext(c.Request.Context(), op+" failed", "user_id", c.MustGet("user_id"), "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update billing"})
	default:
		c.JSON(http.StatusOK, body)
	}
}

// CreemWebhook handles webhook deliveries from Creem
// @Summary Receive a Creem webhook
// @Description Creem's webhook endpoint. It takes no token: the creem-signature header, an HMAC of the raw body, authenticates it. Answers 200 once the event is handled or was already; any other status makes Creem retry.
// @Tags billing
// @Accept json
// @Produce json
// @Param creem-signature header string true "Hex HMAC-SHA256 of the body under the webhook secret"
// @Success 200 {object} map[string]bool
// @Failure 400 {object} map[string]string
// @Failure 401 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Failure 502 {object} map[string]string
// @Failure 503 {object} map[string]string
// @Router /v1/webhooks/creem [post]
func CreemWebhook(c *gin.Context) {
	// The signature covers the exact bytes Creem sent, so the body is read raw
	// rather than bound.
	body, err := io.ReadAll(http.MaxBytesReader(c.Writer, c.Request.Body, maxWebhookBody))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Unreadable body"})
		return
	}

	err = services.HandleCreemWebhook(c.Request.Context(), body, c.GetHeader("creem-signature"))
	switch {
	case errors.Is(err, services.ErrBillingDisabled):
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Billing is unavailable"})
	case errors.Is(err, services.ErrInvalidSignature):
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid signature"})
	case errors.Is(err, services.ErrMalformedEvent):
		c.JSON(http.StatusBadRequest, gin.H{"error": "Malformed event"})
	case errors.Is(err, services.ErrPaymentProvider):
		slog.ErrorContext(c.Request.Context(), "CreemWebhook failed at Creem", "error", err)
		c.JSON(http.StatusBadGateway, gin.H{"error": "The payment provider could not be reached"})
	case err != nil:
		slog.ErrorContext(c.Request.Context(), "CreemWebhook failed", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to handle the event"})
	default:
		c.JSON(http.StatusOK, gin.H{"received": true})
	}
}

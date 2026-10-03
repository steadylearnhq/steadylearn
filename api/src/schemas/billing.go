package schemas

import "time"

// BillingSchema is the caller's billing state.
type BillingSchema struct {
	// Subscription is the caller's current subscription, or null when they
	// have never subscribed.
	Subscription *SubscriptionSchema `json:"subscription"`
}

// SubscriptionSchema is a subscription as the member sees it.
type SubscriptionSchema struct {
	// Status is Creem's: active, trialing, past_due, unpaid, scheduled_cancel,
	// paused or canceled. Treat any other value as no access.
	Status string `json:"status" example:"active"`
	// Entitled is whether the subscription gives access now.
	Entitled bool `json:"entitled" example:"true"`
	// CancelAtPeriodEnd is a cancelled subscription that runs until
	// CurrentPeriodEnd.
	CancelAtPeriodEnd bool       `json:"cancelAtPeriodEnd" example:"false"`
	CurrentPeriodEnd  *time.Time `json:"currentPeriodEnd" example:"2026-11-03T14:12:24Z"`
	CanceledAt        *time.Time `json:"canceledAt"`
}

// CheckoutSchema is a started checkout: the Creem page to send the member to.
type CheckoutSchema struct {
	CheckoutURL string `json:"checkoutUrl" example:"https://checkout.creem.io/ch_1QyIQDw9cbFWdA1ry5Qc6I"`
}

// SyncRequest names the subscription Creem returned the member with after
// checkout.
type SyncRequest struct {
	SubscriptionId string `json:"subscriptionId" binding:"required,max=100" example:"sub_6pC2lNB6joCRQIZ1aMrTpi"`
}

// PortalSchema is a link to Creem's customer portal, for card changes and
// invoices.
type PortalSchema struct {
	URL string `json:"url" example:"https://creem.io/my-orders/login/xxxxxxxxxx"`
}

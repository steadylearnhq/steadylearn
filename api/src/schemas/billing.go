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
	CancelAtPeriodEnd  bool       `json:"cancelAtPeriodEnd" example:"false"`
	CurrentPeriodStart *time.Time `json:"currentPeriodStart" example:"2026-10-03T14:12:24Z"`
	CurrentPeriodEnd   *time.Time `json:"currentPeriodEnd" example:"2026-11-03T14:12:24Z"`
	// NextChargeAt is when the member is next charged: the renewal, or the
	// next retry of a failed payment. It is null for a subscription that
	// won't renew.
	NextChargeAt *time.Time `json:"nextChargeAt" example:"2026-11-03T14:12:24Z"`
	CanceledAt   *time.Time `json:"canceledAt"`
	// MemberSince is when the member first subscribed, across every
	// subscription they have had.
	MemberSince time.Time `json:"memberSince" example:"2026-03-14T09:30:00Z"`
}

// PaymentsSchema is the member's billing history, newest first.
type PaymentsSchema struct {
	Payments []PaymentSchema `json:"payments"`
}

// PaymentSchema is one charge of the member's subscription, or one Creem
// tried to make.
type PaymentSchema struct {
	Id   string    `json:"id" example:"tran_3e6Z6TzRHzUhLVaYzVQJn0"`
	Date time.Time `json:"date" example:"2026-10-03T14:12:24Z"`
	// Amount is in the currency's smallest unit, VAT included.
	Amount   int64  `json:"amount" example:"2400"`
	Currency string `json:"currency" example:"USD"`
	// Status is paid, failed, refunded or pending. Treat any other value as
	// pending.
	Status      string     `json:"status" example:"paid"`
	PeriodStart *time.Time `json:"periodStart" example:"2026-10-03T14:12:24Z"`
	PeriodEnd   *time.Time `json:"periodEnd" example:"2026-11-03T14:12:24Z"`
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

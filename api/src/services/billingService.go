package services

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"slices"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"steadylearn-api/src/core"
	"steadylearn-api/src/models"
	"steadylearn-api/src/schemas"
)

var (
	// ErrBillingDisabled is billing called while it is not configured.
	ErrBillingDisabled = errors.New("billing is not configured")
	// ErrAlreadySubscribed is a checkout started by a member who already has
	// access.
	ErrAlreadySubscribed = errors.New("already subscribed")
	// ErrNoSubscription is a member with no subscription to act on, or a
	// subscription that is not theirs.
	ErrNoSubscription = errors.New("no subscription")
	// ErrSubscriptionState is a cancel or resume the subscription's status
	// does not allow.
	ErrSubscriptionState = errors.New("subscription cannot change that way")
	// ErrPaymentProvider wraps a failed call to Creem, so a caller can tell it
	// apart from a failure of the API's own database.
	ErrPaymentProvider = errors.New("payment provider request failed")
	// ErrInvalidSignature is a webhook whose signature does not match its body.
	ErrInvalidSignature = errors.New("invalid webhook signature")
	// ErrMalformedEvent is a signed webhook the API cannot read.
	ErrMalformedEvent = errors.New("malformed webhook event")
)

// Creem's subscription statuses. Creem may add others; those give no access.
const (
	statusActive          = "active"
	statusTrialing        = "trialing"
	statusPastDue         = "past_due"
	statusUnpaid          = "unpaid"
	statusScheduledCancel = "scheduled_cancel"
	statusPaused          = "paused"
)

// Subscriptions are read straight from the database, never cached: the
// subscription page reads one right after checkout, cancel and resume.
// Payments come from Creem, so they are cached per member, and dropped when a
// webhook or sync stores one of the member's subscriptions.

// paymentsCacheTTL is the longest a charge made without a webhook, such as a
// refund, takes to show in the billing history.
const paymentsCacheTTL = 10 * time.Minute

// PaymentsCacheKey is where the member's payments are cached. The version
// segment is bumped whenever PaymentsSchema changes shape.
func PaymentsCacheKey(userId uuid.UUID) string {
	return core.CacheKey("payments", "v1", userId.String())
}

// billingEnabled reports whether billing is configured and Creem reachable.
func billingEnabled() bool {
	return core.Creem != nil && core.Config.BillingEnabled()
}

// isEntitled reports whether a subscription in the given status gives access
// at now. A failed payment keeps access while Creem retries it; a cancelled
// subscription keeps it until the period paid for ends.
func isEntitled(status string, periodEnd *time.Time, now time.Time) bool {
	switch status {
	case statusActive, statusTrialing, statusPastDue, statusUnpaid:
		return true
	case statusScheduledCancel:
		return periodEnd == nil || now.Before(*periodEnd)
	default:
		return false
	}
}

// renews reports whether a subscription in the given status is charged
// again: one that is cancelled or paused is not.
func renews(status string) bool {
	switch status {
	case statusActive, statusTrialing, statusPastDue, statusUnpaid:
		return true
	default:
		return false
	}
}

// subscribedAt is when the member took out a subscription: Creem's date, or
// the row's for one stored before Creem's was kept.
func subscribedAt(subscription models.Subscription) time.Time {
	if subscription.CreemCreatedAt != nil {
		return *subscription.CreemCreatedAt
	}
	return subscription.CreatedAt
}

// toSubscriptionSchema converts the subscription, given all of the member's
// subscriptions for when they first subscribed.
func toSubscriptionSchema(subscription models.Subscription, all []models.Subscription, now time.Time) schemas.SubscriptionSchema {
	var nextCharge *time.Time
	if renews(subscription.Status) {
		nextCharge = subscription.NextTransactionAt
		if nextCharge == nil {
			nextCharge = subscription.CurrentPeriodEnd
		}
	}

	memberSince := subscribedAt(subscription)
	for _, row := range all {
		if at := subscribedAt(row); at.Before(memberSince) {
			memberSince = at
		}
	}

	return schemas.SubscriptionSchema{
		Status:             subscription.Status,
		Entitled:           isEntitled(subscription.Status, subscription.CurrentPeriodEnd, now),
		CancelAtPeriodEnd:  subscription.Status == statusScheduledCancel,
		CurrentPeriodStart: subscription.CurrentPeriodStart,
		CurrentPeriodEnd:   subscription.CurrentPeriodEnd,
		NextChargeAt:       nextCharge,
		CanceledAt:         subscription.CanceledAt,
		MemberSince:        memberSince,
	}
}

// memberSubscriptions is every subscription the member has had, the one Creem
// changed last first.
func memberSubscriptions(db *gorm.DB, userId uuid.UUID) ([]models.Subscription, error) {
	var rows []models.Subscription
	err := db.Where("user_id = ? AND deleted_at IS NULL", userId).
		Order("creem_updated_at DESC, created_at DESC").Find(&rows).Error
	if err != nil {
		return nil, fmt.Errorf("failed to load subscriptions: %w", err)
	}
	return rows, nil
}

// pickCurrent is the subscription that matters now: one that gives access if
// any does, otherwise the one Creem changed last. rows must not be empty.
func pickCurrent(rows []models.Subscription, now time.Time) models.Subscription {
	for _, row := range rows {
		if isEntitled(row.Status, row.CurrentPeriodEnd, now) {
			return row
		}
	}
	return rows[0]
}

// currentSubscription is the member's subscription that matters now (see
// pickCurrent). found is false for a member who never subscribed.
func currentSubscription(db *gorm.DB, userId uuid.UUID, now time.Time) (subscription models.Subscription, found bool, err error) {
	rows, err := memberSubscriptions(db, userId)
	if err != nil || len(rows) == 0 {
		return models.Subscription{}, false, err
	}
	return pickCurrent(rows, now), true, nil
}

// GetBilling is the member's billing state. It reads only the database, so it
// answers even while billing is off.
func GetBilling(ctx context.Context, userId uuid.UUID) (schemas.BillingSchema, error) {
	now := time.Now()
	rows, err := memberSubscriptions(core.DB.WithContext(ctx), userId)
	if err != nil || len(rows) == 0 {
		return schemas.BillingSchema{}, err
	}
	schema := toSubscriptionSchema(pickCurrent(rows, now), rows, now)
	return schemas.BillingSchema{Subscription: &schema}, nil
}

// Creem's transaction statuses, as the billing history groups them. A
// cancelled or void transaction was never a charge, so it is left out.
var paymentStatuses = map[string]string{
	"paid":          "paid",
	"partialRefund": "paid",
	"refunded":      "refunded",
	"chargedBack":   "refunded",
	"declined":      "failed",
	"uncollectible": "failed",
	"pending":       "pending",
	"canceled":      "",
	"void":          "",
}

// ListPayments is the member's billing history: every charge of their
// subscriptions, newest first, read from Creem through the cache. A member
// who never subscribed has none, and Creem is not asked.
func ListPayments(ctx context.Context, userId uuid.UUID) (schemas.PaymentsSchema, error) {
	if !billingEnabled() {
		return schemas.PaymentsSchema{}, ErrBillingDisabled
	}

	rows, err := memberSubscriptions(core.DB.WithContext(ctx), userId)
	if err != nil {
		return schemas.PaymentsSchema{}, err
	}
	if len(rows) == 0 {
		return schemas.PaymentsSchema{Payments: []schemas.PaymentSchema{}}, nil
	}

	return cached(ctx, PaymentsCacheKey(userId), paymentsCacheTTL, func() (schemas.PaymentsSchema, error) {
		// Only charges of this product's subscriptions are the member's
		// history; a customer is shared across their subscriptions.
		subscriptionIds := map[string]bool{}
		customerIds := []string{}
		for _, row := range rows {
			if row.CreemProductId != core.Config.CreemProductId {
				continue
			}
			subscriptionIds[row.CreemSubscriptionId] = true
			if row.CreemCustomerId != "" && !slices.Contains(customerIds, row.CreemCustomerId) {
				customerIds = append(customerIds, row.CreemCustomerId)
			}
		}

		payments := []schemas.PaymentSchema{}
		for _, customerId := range customerIds {
			transactions, err := core.Creem.ListTransactions(ctx, customerId)
			if err != nil {
				return schemas.PaymentsSchema{}, fmt.Errorf("%w: %w", ErrPaymentProvider, err)
			}
			for _, transaction := range transactions {
				if !subscriptionIds[transaction.Subscription.Id] {
					continue
				}
				status, known := paymentStatuses[transaction.Status]
				if !known {
					status = transaction.Status
				}
				if status == "" {
					continue
				}
				payments = append(payments, toPaymentSchema(transaction, status))
			}
		}
		slices.SortStableFunc(payments, func(a, b schemas.PaymentSchema) int { return b.Date.Compare(a.Date) })
		return schemas.PaymentsSchema{Payments: payments}, nil
	})
}

func toPaymentSchema(transaction core.CreemTransaction, status string) schemas.PaymentSchema {
	payment := schemas.PaymentSchema{
		Id:       transaction.Id,
		Date:     transaction.CreatedAt.Time,
		Amount:   transaction.Amount,
		Currency: transaction.Currency,
		Status:   status,
	}
	if transaction.PeriodStart != nil {
		payment.PeriodStart = &transaction.PeriodStart.Time
	}
	if transaction.PeriodEnd != nil {
		payment.PeriodEnd = &transaction.PeriodEnd.Time
	}
	return payment
}

// dropPayments forgets the member's cached payments, so the next read asks
// Creem.
func dropPayments(ctx context.Context, userId uuid.UUID) {
	dropCached(ctx, PaymentsCacheKey(userId))
}

// StartCheckout starts a Creem checkout for the monthly subscription, tagged
// with the member's id so the subscription it creates can be traced back to
// them. A member who subscribed before checks out as the same Creem customer.
func StartCheckout(ctx context.Context, userId uuid.UUID) (schemas.CheckoutSchema, error) {
	if !billingEnabled() {
		return schemas.CheckoutSchema{}, ErrBillingDisabled
	}

	// The app never calls setup, so a member may not have a row yet.
	if _, err := SetupUser(ctx, userId); err != nil {
		return schemas.CheckoutSchema{}, fmt.Errorf("failed to set up user: %w", err)
	}

	now := time.Now()
	current, found, err := currentSubscription(core.DB.WithContext(ctx), userId, now)
	if err != nil {
		return schemas.CheckoutSchema{}, err
	}
	if found && isEntitled(current.Status, current.CurrentPeriodEnd, now) {
		return schemas.CheckoutSchema{}, ErrAlreadySubscribed
	}

	var customer *core.CreemCustomerRef
	if found && current.CreemCustomerId != "" {
		customer = &core.CreemCustomerRef{Id: current.CreemCustomerId}
	} else {
		profile, err := GetUserProfile(userId)
		if err != nil {
			return schemas.CheckoutSchema{}, err
		}
		if profile.Email != "" {
			customer = &core.CreemCustomerRef{Email: profile.Email}
		}
	}

	checkout, err := core.Creem.CreateCheckout(ctx, core.CreemCheckoutRequest{
		ProductId:  core.Config.CreemProductId,
		RequestId:  uuid.NewString(),
		SuccessURL: core.Config.AppURL + "/subscription?checkout=success",
		Customer:   customer,
		Metadata:   map[string]string{"user_id": userId.String()},
	})
	if err != nil {
		return schemas.CheckoutSchema{}, fmt.Errorf("%w: %w", ErrPaymentProvider, err)
	}
	return schemas.CheckoutSchema{CheckoutURL: checkout.CheckoutURL}, nil
}

// SyncSubscription stores a subscription the member just checked out, without
// waiting for its webhook, and returns their billing state. The subscription
// is read from Creem, so it is stored only if Creem says it is the member's.
func SyncSubscription(ctx context.Context, userId uuid.UUID, subscriptionId string) (schemas.BillingSchema, error) {
	if !billingEnabled() {
		return schemas.BillingSchema{}, ErrBillingDisabled
	}

	subscription, err := core.Creem.GetSubscription(ctx, subscriptionId)
	if errors.Is(err, core.ErrCreemNotFound) {
		return schemas.BillingSchema{}, ErrNoSubscription
	}
	if err != nil {
		return schemas.BillingSchema{}, fmt.Errorf("%w: %w", ErrPaymentProvider, err)
	}
	if subscription.Product.Id != core.Config.CreemProductId || metadataUserId(subscription) != userId {
		return schemas.BillingSchema{}, ErrNoSubscription
	}

	err = core.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		return storeSubscription(tx, userId, subscription)
	})
	if err != nil {
		return schemas.BillingSchema{}, err
	}
	dropPayments(ctx, userId)
	return GetBilling(ctx, userId)
}

// CancelSubscription cancels the member's subscription at the end of the
// period they paid for, and returns their billing state.
func CancelSubscription(ctx context.Context, userId uuid.UUID) (schemas.BillingSchema, error) {
	return changeSubscription(ctx, userId,
		[]string{statusActive, statusTrialing, statusPastDue, statusUnpaid}, core.CreemAPI.CancelSubscription)
}

// ResumeSubscription undoes a cancellation that has not taken effect yet, or
// a pause, and returns the member's billing state.
func ResumeSubscription(ctx context.Context, userId uuid.UUID) (schemas.BillingSchema, error) {
	return changeSubscription(ctx, userId,
		[]string{statusScheduledCancel, statusPaused}, core.CreemAPI.ResumeSubscription)
}

// changeSubscription asks Creem to change the member's current subscription,
// if its status is one of from, and stores what Creem answers with.
func changeSubscription(
	ctx context.Context,
	userId uuid.UUID,
	from []string,
	change func(core.CreemAPI, context.Context, string) (core.CreemSubscription, error),
) (schemas.BillingSchema, error) {
	if !billingEnabled() {
		return schemas.BillingSchema{}, ErrBillingDisabled
	}

	current, found, err := currentSubscription(core.DB.WithContext(ctx), userId, time.Now())
	if err != nil {
		return schemas.BillingSchema{}, err
	}
	if !found {
		return schemas.BillingSchema{}, ErrNoSubscription
	}
	allowed := false
	for _, status := range from {
		allowed = allowed || current.Status == status
	}
	if !allowed {
		return schemas.BillingSchema{}, ErrSubscriptionState
	}

	subscription, err := change(core.Creem, ctx, current.CreemSubscriptionId)
	if err != nil {
		return schemas.BillingSchema{}, fmt.Errorf("%w: %w", ErrPaymentProvider, err)
	}

	err = core.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		return storeSubscription(tx, userId, subscription)
	})
	if err != nil {
		return schemas.BillingSchema{}, err
	}
	return GetBilling(ctx, userId)
}

// BillingPortalLink is a link to Creem's customer portal for the member, where
// they change their card and download invoices.
func BillingPortalLink(ctx context.Context, userId uuid.UUID) (schemas.PortalSchema, error) {
	if !billingEnabled() {
		return schemas.PortalSchema{}, ErrBillingDisabled
	}

	current, found, err := currentSubscription(core.DB.WithContext(ctx), userId, time.Now())
	if err != nil {
		return schemas.PortalSchema{}, err
	}
	if !found || current.CreemCustomerId == "" {
		return schemas.PortalSchema{}, ErrNoSubscription
	}

	link, err := core.Creem.CreateBillingPortalLink(ctx, current.CreemCustomerId)
	if err != nil {
		return schemas.PortalSchema{}, fmt.Errorf("%w: %w", ErrPaymentProvider, err)
	}
	return schemas.PortalSchema{URL: link}, nil
}

// creemEvent is the envelope of a Creem webhook.
type creemEvent struct {
	Id        string          `json:"id"`
	EventType string          `json:"eventType"`
	CreatedAt int64           `json:"created_at"` // epoch milliseconds
	Object    json.RawMessage `json:"object"`
}

// subscriptionId is the subscription an event is about, or "" for an event
// about something else, such as a refund.
func (e creemEvent) subscriptionId() (string, error) {
	switch {
	case e.EventType == "checkout.completed":
		var checkout struct {
			Subscription *core.CreemRef `json:"subscription"`
		}
		if err := json.Unmarshal(e.Object, &checkout); err != nil {
			return "", err
		}
		if checkout.Subscription == nil {
			return "", nil
		}
		return checkout.Subscription.Id, nil
	case strings.HasPrefix(e.EventType, "subscription."):
		var subscription struct {
			Id string `json:"id"`
		}
		if err := json.Unmarshal(e.Object, &subscription); err != nil {
			return "", err
		}
		return subscription.Id, nil
	default:
		return "", nil
	}
}

// HandleCreemWebhook handles one webhook delivery from Creem. The event only
// says which subscription changed: its state is read back from Creem, so an
// event that arrives late or twice cannot store a stale one. Each event is
// handled once; a repeated delivery is acknowledged and dropped.
//
// An ErrPaymentProvider means Creem could not be read, and the event is not
// recorded, so Creem's retry handles it again.
func HandleCreemWebhook(ctx context.Context, body []byte, signature string) error {
	if !billingEnabled() {
		return ErrBillingDisabled
	}
	if !core.VerifyCreemSignature(body, signature) {
		return ErrInvalidSignature
	}

	var event creemEvent
	if err := json.Unmarshal(body, &event); err != nil || event.Id == "" || event.EventType == "" {
		return ErrMalformedEvent
	}
	subscriptionId, err := event.subscriptionId()
	if err != nil {
		return ErrMalformedEvent
	}

	db := core.DB.WithContext(ctx)
	var seen int64
	if err := db.Model(&models.CreemWebhookEvent{}).Where("id = ?", event.Id).Count(&seen).Error; err != nil {
		return fmt.Errorf("failed to look up webhook event: %w", err)
	}
	if seen > 0 {
		return nil
	}

	var subscription *core.CreemSubscription
	if subscriptionId != "" {
		fetched, err := core.Creem.GetSubscription(ctx, subscriptionId)
		if err != nil {
			return fmt.Errorf("%w: %w", ErrPaymentProvider, err)
		}
		subscription = &fetched
	}

	occurredAt := time.Now()
	if event.CreatedAt > 0 {
		occurredAt = time.UnixMilli(event.CreatedAt)
	}

	// The member whose subscription the event stored, if any: their cached
	// payments are dropped once it is committed, since a charge usually comes
	// with it.
	var stored uuid.UUID
	err = db.Transaction(func(tx *gorm.DB) error {
		record := models.CreemWebhookEvent{Id: event.Id, EventType: event.EventType, OccurredAt: occurredAt, Payload: string(body)}
		result := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&record)
		if result.Error != nil {
			return fmt.Errorf("failed to record webhook event: %w", result.Error)
		}
		if result.RowsAffected == 0 {
			return nil // another delivery of the event got here first
		}

		if subscription == nil {
			slog.InfoContext(ctx, "Creem event recorded", "event", event.Id, "type", event.EventType)
			return nil
		}
		if subscription.Product.Id != core.Config.CreemProductId {
			slog.InfoContext(ctx, "Creem event for another product ignored",
				"event", event.Id, "subscription", subscription.Id, "product", subscription.Product.Id)
			return nil
		}

		userId, err := subscriber(tx, *subscription)
		if err != nil {
			return err
		}
		if userId == uuid.Nil {
			slog.WarnContext(ctx, "Creem subscription has no member",
				"event", event.Id, "subscription", subscription.Id, "customer", subscription.Customer.Id)
			return nil
		}
		stored = userId
		return storeSubscription(tx, userId, *subscription)
	})
	if err == nil && stored != uuid.Nil {
		dropPayments(ctx, stored)
	}
	return err
}

// metadataUserId is the member a subscription was checked out for, which
// Creem carries from the checkout's metadata onto the subscription, or
// uuid.Nil when it has none.
func metadataUserId(subscription core.CreemSubscription) uuid.UUID {
	value, _ := subscription.Metadata["user_id"].(string)
	userId, err := uuid.Parse(value)
	if err != nil {
		return uuid.Nil
	}
	return userId
}

// subscriber is the member a subscription belongs to: the one its metadata
// names, or else the one already holding it. It is uuid.Nil when neither is
// known.
func subscriber(tx *gorm.DB, subscription core.CreemSubscription) (uuid.UUID, error) {
	if userId := metadataUserId(subscription); userId != uuid.Nil {
		return userId, nil
	}

	var rows []struct{ UserId uuid.UUID }
	err := tx.Raw(`SELECT user_id FROM subscriptions WHERE creem_subscription_id = ? AND deleted_at IS NULL`,
		subscription.Id).Scan(&rows).Error
	if err != nil {
		return uuid.Nil, fmt.Errorf("failed to find subscriber: %w", err)
	}
	if len(rows) == 0 {
		return uuid.Nil, nil
	}
	return rows[0].UserId, nil
}

// storeSubscription saves Creem's view of a subscription for the member,
// creating their row if it is missing. A snapshot older than the stored one
// is left unsaved.
func storeSubscription(tx *gorm.DB, userId uuid.UUID, subscription core.CreemSubscription) error {
	user := models.User{BaseModel: models.BaseModel{Id: userId}}
	if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&user).Error; err != nil {
		return fmt.Errorf("failed to set up user: %w", err)
	}

	updatedAt := time.Now()
	if subscription.UpdatedAt != nil {
		updatedAt = *subscription.UpdatedAt
	}

	row := models.Subscription{
		BaseModel:           models.BaseModel{Id: uuid.New()},
		UserId:              userId,
		CreemSubscriptionId: subscription.Id,
		CreemCustomerId:     subscription.Customer.Id,
		CreemProductId:      subscription.Product.Id,
		Status:              subscription.Status,
		CurrentPeriodStart:  subscription.CurrentPeriodStartDate,
		CurrentPeriodEnd:    subscription.CurrentPeriodEndDate,
		NextTransactionAt:   subscription.NextTransactionDate,
		CanceledAt:          subscription.CanceledAt,
		CreemCreatedAt:      subscription.CreatedAt,
		CreemUpdatedAt:      updatedAt,
	}
	err := tx.Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "creem_subscription_id"}},
		DoUpdates: clause.Assignments(map[string]any{
			"creem_customer_id":    row.CreemCustomerId,
			"creem_product_id":     row.CreemProductId,
			"status":               row.Status,
			"current_period_start": row.CurrentPeriodStart,
			"current_period_end":   row.CurrentPeriodEnd,
			"next_transaction_at":  row.NextTransactionAt,
			"canceled_at":          row.CanceledAt,
			"creem_created_at":     row.CreemCreatedAt,
			"creem_updated_at":     row.CreemUpdatedAt,
			"updated_at":           gorm.Expr("now()"),
		}),
		Where: clause.Where{Exprs: []clause.Expression{
			clause.Expr{SQL: "subscriptions.creem_updated_at <= excluded.creem_updated_at"},
		}},
	}).Omit(clause.Associations).Create(&row).Error
	if err != nil {
		return fmt.Errorf("failed to store subscription: %w", err)
	}
	return nil
}

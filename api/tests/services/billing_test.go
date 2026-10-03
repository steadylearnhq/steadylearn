package services_test

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"steadylearn-api/src/core"
	"steadylearn-api/src/models"
	"steadylearn-api/src/services"
	"steadylearn-api/tests/testutil"
)

// at is a moment relative to now, to the second, as Postgres stores it.
func at(d time.Duration) *time.Time {
	t := time.Now().Add(d).Truncate(time.Second).UTC()
	return &t
}

// creemSubscription is what Creem returns for a monthly subscription that was
// checked out by userId, last changed at updatedAt.
func creemSubscription(id string, userId uuid.UUID, status string, updatedAt *time.Time) core.CreemSubscription {
	return core.CreemSubscription{
		Id:                   id,
		Status:               status,
		Product:              core.CreemRef{Id: testutil.CreemProductId},
		Customer:             core.CreemRef{Id: "cust_" + id},
		CurrentPeriodEndDate: at(30 * 24 * time.Hour),
		UpdatedAt:            updatedAt,
		Metadata:             map[string]any{"user_id": userId.String()},
	}
}

// addSubscription stores a subscription for the member, setting them up first.
func addSubscription(t *testing.T, userId uuid.UUID, subscription models.Subscription) {
	t.Helper()
	_, err := services.SetupUser(context.Background(), userId)
	require.NoError(t, err)
	subscription.BaseModel = base()
	subscription.UserId = userId
	if subscription.CreemCustomerId == "" {
		subscription.CreemCustomerId = "cust_" + subscription.CreemSubscriptionId
	}
	if subscription.CreemProductId == "" {
		subscription.CreemProductId = testutil.CreemProductId
	}
	if subscription.CreemUpdatedAt.IsZero() {
		subscription.CreemUpdatedAt = *at(-time.Hour)
	}
	require.NoError(t, core.DB.Omit("User").Create(&subscription).Error)
}

// storedSubscription is the row stored for a Creem subscription, or nil.
func storedSubscription(t *testing.T, id string) *models.Subscription {
	t.Helper()
	var rows []models.Subscription
	require.NoError(t, core.DB.Where("creem_subscription_id = ?", id).Find(&rows).Error)
	if len(rows) == 0 {
		return nil
	}
	return &rows[0]
}

func TestGetBillingNeverSubscribed(t *testing.T) {
	testutil.UseDB(t)

	billing, err := services.GetBilling(context.Background(), uuid.New())
	require.NoError(t, err)
	assert.Nil(t, billing.Subscription)
}

func TestEntitlement(t *testing.T) {
	cases := []struct {
		status    string
		periodEnd *time.Time
		entitled  bool
	}{
		{"active", at(time.Hour), true},
		{"trialing", at(time.Hour), true},
		{"past_due", at(-time.Hour), true},
		{"unpaid", at(-time.Hour), true},
		{"scheduled_cancel", at(time.Hour), true},
		{"scheduled_cancel", at(-time.Hour), false},
		{"paused", at(time.Hour), false},
		{"canceled", at(time.Hour), false},
		{"expired", at(time.Hour), false},
		{"some_new_status", at(time.Hour), false},
	}
	for _, tc := range cases {
		when := "within the period"
		if tc.periodEnd.Before(time.Now()) {
			when = "after the period"
		}
		t.Run(tc.status+" "+when, func(t *testing.T) {
			testutil.UseDB(t)
			userId := uuid.New()
			addSubscription(t, userId, models.Subscription{CreemSubscriptionId: "sub_1", Status: tc.status, CurrentPeriodEnd: tc.periodEnd})

			billing, err := services.GetBilling(context.Background(), userId)
			require.NoError(t, err)
			require.NotNil(t, billing.Subscription)
			assert.Equal(t, tc.status, billing.Subscription.Status)
			assert.Equal(t, tc.entitled, billing.Subscription.Entitled)
			assert.Equal(t, tc.status == "scheduled_cancel", billing.Subscription.CancelAtPeriodEnd)
		})
	}
}

func TestGetBillingPrefersTheSubscriptionWithAccess(t *testing.T) {
	testutil.UseDB(t)
	userId := uuid.New()
	addSubscription(t, userId, models.Subscription{CreemSubscriptionId: "sub_old", Status: "active", CreemUpdatedAt: *at(-48 * time.Hour)})
	addSubscription(t, userId, models.Subscription{CreemSubscriptionId: "sub_new", Status: "canceled", CreemUpdatedAt: *at(-time.Hour)})

	billing, err := services.GetBilling(context.Background(), userId)
	require.NoError(t, err)
	assert.Equal(t, "active", billing.Subscription.Status, "access wins over the newer cancelled one")
}

func TestBillingOff(t *testing.T) {
	testutil.UseDB(t)
	ctx := context.Background()
	userId := uuid.New()

	_, err := services.StartCheckout(ctx, userId)
	assert.ErrorIs(t, err, services.ErrBillingDisabled)
	_, err = services.SyncSubscription(ctx, userId, "sub_1")
	assert.ErrorIs(t, err, services.ErrBillingDisabled)
	_, err = services.CancelSubscription(ctx, userId)
	assert.ErrorIs(t, err, services.ErrBillingDisabled)
	_, err = services.BillingPortalLink(ctx, userId)
	assert.ErrorIs(t, err, services.ErrBillingDisabled)
	_, err = services.ListPayments(ctx, userId)
	assert.ErrorIs(t, err, services.ErrBillingDisabled)
	assert.ErrorIs(t, services.HandleCreemWebhook(ctx, []byte(`{}`), "sig"), services.ErrBillingDisabled)

	_, err = services.GetBilling(ctx, userId)
	assert.NoError(t, err, "reading billing works while it is off")
}

func TestStartCheckout(t *testing.T) {
	testutil.UseDB(t)
	creem := testutil.UseCreem(t)
	cognito := testutil.UseCognito(t)
	ctx := context.Background()
	// The app never sets the user up, so checkout has to create their row.
	userId := uuid.New()

	cognito.On("ListUsers", mock.Anything, forSub(userId)).Return(poolUser(map[string]string{"email": "ada@example.com"}), nil)
	creem.On("CreateCheckout", mock.Anything, mock.MatchedBy(func(r core.CreemCheckoutRequest) bool {
		return r.ProductId == testutil.CreemProductId &&
			r.RequestId != "" &&
			r.SuccessURL == testutil.AppURL+"/subscription?checkout=success" &&
			r.Customer != nil && r.Customer.Email == "ada@example.com" && r.Customer.Id == "" &&
			r.Metadata["user_id"] == userId.String()
	})).Return(core.CreemCheckout{Id: "ch_1", CheckoutURL: "https://checkout.creem.io/ch_1"}, nil).Once()

	checkout, err := services.StartCheckout(ctx, userId)
	require.NoError(t, err)
	assert.Equal(t, "https://checkout.creem.io/ch_1", checkout.CheckoutURL)

	_, err = services.GetUserById(ctx, userId)
	assert.NoError(t, err, "checkout sets up the user")
}

func TestStartCheckoutReusesTheCustomer(t *testing.T) {
	testutil.UseDB(t)
	creem := testutil.UseCreem(t)
	// No Cognito expectation: the customer is known, so the email is not asked for.
	testutil.UseCognito(t)
	userId := uuid.New()
	addSubscription(t, userId, models.Subscription{CreemSubscriptionId: "sub_1", CreemCustomerId: "cust_ada", Status: "canceled"})

	creem.On("CreateCheckout", mock.Anything, mock.MatchedBy(func(r core.CreemCheckoutRequest) bool {
		return r.Customer != nil && r.Customer.Id == "cust_ada" && r.Customer.Email == ""
	})).Return(core.CreemCheckout{CheckoutURL: "https://checkout.creem.io/ch_2"}, nil).Once()

	_, err := services.StartCheckout(context.Background(), userId)
	assert.NoError(t, err)
}

func TestStartCheckoutRejects(t *testing.T) {
	t.Run("already subscribed", func(t *testing.T) {
		testutil.UseDB(t)
		testutil.UseCreem(t)
		userId := uuid.New()
		addSubscription(t, userId, models.Subscription{CreemSubscriptionId: "sub_1", Status: "active", CurrentPeriodEnd: at(time.Hour)})

		_, err := services.StartCheckout(context.Background(), userId)
		assert.ErrorIs(t, err, services.ErrAlreadySubscribed)
	})

	t.Run("creem fails", func(t *testing.T) {
		testutil.UseDB(t)
		creem := testutil.UseCreem(t)
		userId := uuid.New()
		addSubscription(t, userId, models.Subscription{CreemSubscriptionId: "sub_1", Status: "canceled"})
		creem.On("CreateCheckout", mock.Anything, mock.Anything).Return(core.CreemCheckout{}, errors.New("status 500")).Once()

		_, err := services.StartCheckout(context.Background(), userId)
		assert.ErrorIs(t, err, services.ErrPaymentProvider)
	})
}

func TestSyncSubscription(t *testing.T) {
	testutil.UseDB(t)
	creem := testutil.UseCreem(t)
	ctx := context.Background()
	userId := uuid.New()
	creem.On("GetSubscription", mock.Anything, "sub_1").Return(creemSubscription("sub_1", userId, "active", at(0)), nil).Once()

	billing, err := services.SyncSubscription(ctx, userId, "sub_1")
	require.NoError(t, err)
	require.NotNil(t, billing.Subscription)
	assert.Equal(t, "active", billing.Subscription.Status)
	assert.True(t, billing.Subscription.Entitled)

	stored := storedSubscription(t, "sub_1")
	require.NotNil(t, stored)
	assert.Equal(t, userId, stored.UserId)
	assert.Equal(t, "cust_sub_1", stored.CreemCustomerId)
}

func TestSubscriptionDates(t *testing.T) {
	testutil.UseDB(t)
	creem := testutil.UseCreem(t)
	ctx := context.Background()
	userId := uuid.New()
	subscription := creemSubscription("sub_1", userId, "past_due", at(0))
	subscription.CurrentPeriodStartDate = at(-2 * 24 * time.Hour)
	subscription.NextTransactionDate = at(3 * 24 * time.Hour)
	subscription.CreatedAt = at(-90 * 24 * time.Hour)
	creem.On("GetSubscription", mock.Anything, "sub_1").Return(subscription, nil).Once()

	billing, err := services.SyncSubscription(ctx, userId, "sub_1")
	require.NoError(t, err)
	got := billing.Subscription
	require.NotNil(t, got)
	assert.Equal(t, subscription.CurrentPeriodStartDate.Unix(), got.CurrentPeriodStart.Unix())
	assert.Equal(t, subscription.NextTransactionDate.Unix(), got.NextChargeAt.Unix(), "the next retry")
	assert.Equal(t, subscription.CreatedAt.Unix(), got.MemberSince.Unix())

	t.Run("the renewal when Creem names no next charge", func(t *testing.T) {
		userId := uuid.New()
		addSubscription(t, userId, models.Subscription{CreemSubscriptionId: "sub_2", Status: "active", CurrentPeriodEnd: at(time.Hour)})

		billing, err := services.GetBilling(ctx, userId)
		require.NoError(t, err)
		require.NotNil(t, billing.Subscription.NextChargeAt)
		assert.Equal(t, at(time.Hour).Unix(), billing.Subscription.NextChargeAt.Unix())
	})

	t.Run("none for a subscription that won't renew", func(t *testing.T) {
		userId := uuid.New()
		addSubscription(t, userId, models.Subscription{
			CreemSubscriptionId: "sub_3", Status: "scheduled_cancel", CurrentPeriodEnd: at(time.Hour), NextTransactionAt: at(time.Hour),
		})

		billing, err := services.GetBilling(ctx, userId)
		require.NoError(t, err)
		assert.Nil(t, billing.Subscription.NextChargeAt)
	})
}

func TestMemberSinceSpansEverySubscription(t *testing.T) {
	testutil.UseDB(t)
	userId := uuid.New()
	first := at(-200 * 24 * time.Hour)
	addSubscription(t, userId, models.Subscription{CreemSubscriptionId: "sub_old", Status: "canceled", CreemCreatedAt: first, CreemUpdatedAt: *at(-100 * 24 * time.Hour)})
	// Stored before Creem's date was kept: its row's date stands in.
	addSubscription(t, userId, models.Subscription{CreemSubscriptionId: "sub_new", Status: "active", CurrentPeriodEnd: at(time.Hour)})

	billing, err := services.GetBilling(context.Background(), userId)
	require.NoError(t, err)
	assert.Equal(t, "active", billing.Subscription.Status)
	assert.Equal(t, first.Unix(), billing.Subscription.MemberSince.Unix(), "resubscribing keeps the first date")
}

// transaction is a Creem charge of a subscription, made daysAgo.
func transaction(id, subscriptionId, status string, daysAgo int) core.CreemTransaction {
	created := time.Now().Add(-time.Duration(daysAgo) * 24 * time.Hour).Truncate(time.Second).UTC()
	end := created.AddDate(0, 1, 0)
	return core.CreemTransaction{
		Id:           id,
		Amount:       2400,
		Currency:     "USD",
		Type:         "invoice",
		Status:       status,
		Subscription: core.CreemRef{Id: subscriptionId},
		PeriodStart:  &core.CreemTime{Time: created},
		PeriodEnd:    &core.CreemTime{Time: end},
		CreatedAt:    core.CreemTime{Time: created},
	}
}

func TestListPayments(t *testing.T) {
	testutil.UseDB(t)
	creem := testutil.UseCreem(t)
	ctx := context.Background()
	userId := uuid.New()
	addSubscription(t, userId, models.Subscription{CreemSubscriptionId: "sub_1", CreemCustomerId: "cust_ada", Status: "past_due"})

	// Once: the second read is answered from the cache.
	creem.On("ListTransactions", mock.Anything, "cust_ada").Return([]core.CreemTransaction{
		transaction("tran_old", "sub_1", "paid", 60),
		transaction("tran_new", "sub_1", "declined", 1),
		transaction("tran_mid", "sub_1", "chargedBack", 30),
		transaction("tran_void", "sub_1", "void", 2),
		transaction("tran_other", "sub_someone_elses", "paid", 3),
	}, nil).Once()

	payments, err := services.ListPayments(ctx, userId)
	require.NoError(t, err)
	ids, statuses := []string{}, []string{}
	for _, payment := range payments.Payments {
		ids = append(ids, payment.Id)
		statuses = append(statuses, payment.Status)
	}
	assert.Equal(t, []string{"tran_new", "tran_mid", "tran_old"}, ids, "newest first, only this subscription's charges")
	assert.Equal(t, []string{"failed", "refunded", "paid"}, statuses)
	first := payments.Payments[0]
	assert.Equal(t, int64(2400), first.Amount)
	assert.Equal(t, "USD", first.Currency)
	require.NotNil(t, first.PeriodEnd)
	assert.True(t, first.PeriodEnd.After(*first.PeriodStart))

	again, err := services.ListPayments(ctx, userId)
	require.NoError(t, err)
	assert.Equal(t, payments, again, "served from the cache")
}

func TestListPaymentsNeverSubscribed(t *testing.T) {
	testutil.UseDB(t)
	testutil.UseCreem(t) // no expectations: Creem is not asked

	payments, err := services.ListPayments(context.Background(), uuid.New())
	require.NoError(t, err)
	assert.NotNil(t, payments.Payments)
	assert.Empty(t, payments.Payments)
}

func TestListPaymentsRefreshesAfterAWebhook(t *testing.T) {
	testutil.UseDB(t)
	creem := testutil.UseCreem(t)
	ctx := context.Background()
	userId := uuid.New()
	addSubscription(t, userId, models.Subscription{CreemSubscriptionId: "sub_1", CreemCustomerId: "cust_sub_1", Status: "active"})

	creem.On("ListTransactions", mock.Anything, "cust_sub_1").
		Return([]core.CreemTransaction{transaction("tran_1", "sub_1", "paid", 30)}, nil).Once()
	payments, err := services.ListPayments(ctx, userId)
	require.NoError(t, err)
	assert.Len(t, payments.Payments, 1)

	creem.On("GetSubscription", mock.Anything, "sub_1").Return(creemSubscription("sub_1", userId, "active", at(0)), nil).Once()
	require.NoError(t, deliver(creemEvent(t, "evt_1", "subscription.paid", map[string]any{"id": "sub_1"})))

	creem.On("ListTransactions", mock.Anything, "cust_sub_1").Return([]core.CreemTransaction{
		transaction("tran_2", "sub_1", "paid", 0),
		transaction("tran_1", "sub_1", "paid", 30),
	}, nil).Once()
	payments, err = services.ListPayments(ctx, userId)
	require.NoError(t, err)
	assert.Len(t, payments.Payments, 2, "the renewal shows at once")
}

func TestListPaymentsWhenCreemFails(t *testing.T) {
	testutil.UseDB(t)
	creem := testutil.UseCreem(t)
	ctx := context.Background()
	userId := uuid.New()
	addSubscription(t, userId, models.Subscription{CreemSubscriptionId: "sub_1", Status: "active"})

	creem.On("ListTransactions", mock.Anything, "cust_sub_1").Return(nil, errors.New("status 503")).Once()
	_, err := services.ListPayments(ctx, userId)
	assert.ErrorIs(t, err, services.ErrPaymentProvider)

	creem.On("ListTransactions", mock.Anything, "cust_sub_1").Return([]core.CreemTransaction{}, nil).Once()
	_, err = services.ListPayments(ctx, userId)
	assert.NoError(t, err, "a failure is not cached")
}

func TestSyncSubscriptionRejects(t *testing.T) {
	userId := uuid.New()
	someoneElse := creemSubscription("sub_1", uuid.New(), "active", at(0))
	otherProduct := creemSubscription("sub_1", userId, "active", at(0))
	otherProduct.Product.Id = "prod_other"

	cases := []struct {
		name         string
		subscription core.CreemSubscription
		err          error
	}{
		{"someone else's", someoneElse, nil},
		{"another product", otherProduct, nil},
		{"unknown to creem", core.CreemSubscription{}, fmt.Errorf("creem GET /subscriptions: %w", core.ErrCreemNotFound)},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			testutil.UseDB(t)
			creem := testutil.UseCreem(t)
			creem.On("GetSubscription", mock.Anything, "sub_1").Return(tc.subscription, tc.err).Once()

			_, err := services.SyncSubscription(context.Background(), userId, "sub_1")
			assert.ErrorIs(t, err, services.ErrNoSubscription)
			assert.Nil(t, storedSubscription(t, "sub_1"))
		})
	}

	t.Run("creem fails", func(t *testing.T) {
		testutil.UseDB(t)
		creem := testutil.UseCreem(t)
		creem.On("GetSubscription", mock.Anything, "sub_1").Return(core.CreemSubscription{}, errors.New("timeout")).Once()

		_, err := services.SyncSubscription(context.Background(), userId, "sub_1")
		assert.ErrorIs(t, err, services.ErrPaymentProvider)
	})
}

func TestCancelAndResume(t *testing.T) {
	testutil.UseDB(t)
	creem := testutil.UseCreem(t)
	ctx := context.Background()
	userId := uuid.New()
	addSubscription(t, userId, models.Subscription{CreemSubscriptionId: "sub_1", Status: "active", CurrentPeriodEnd: at(time.Hour)})

	creem.On("CancelSubscription", mock.Anything, "sub_1").
		Return(creemSubscription("sub_1", userId, "scheduled_cancel", at(-time.Minute)), nil).Once()
	billing, err := services.CancelSubscription(ctx, userId)
	require.NoError(t, err)
	assert.Equal(t, "scheduled_cancel", billing.Subscription.Status)
	assert.True(t, billing.Subscription.CancelAtPeriodEnd)
	assert.True(t, billing.Subscription.Entitled, "access runs to the end of the period")

	_, err = services.CancelSubscription(ctx, userId)
	assert.ErrorIs(t, err, services.ErrSubscriptionState, "cancelling twice")

	creem.On("ResumeSubscription", mock.Anything, "sub_1").
		Return(creemSubscription("sub_1", userId, "active", at(0)), nil).Once()
	billing, err = services.ResumeSubscription(ctx, userId)
	require.NoError(t, err)
	assert.Equal(t, "active", billing.Subscription.Status)
	assert.False(t, billing.Subscription.CancelAtPeriodEnd)

	_, err = services.ResumeSubscription(ctx, userId)
	assert.ErrorIs(t, err, services.ErrSubscriptionState, "resuming an active subscription")
}

func TestCancelWithoutASubscription(t *testing.T) {
	testutil.UseDB(t)
	testutil.UseCreem(t)

	_, err := services.CancelSubscription(context.Background(), uuid.New())
	assert.ErrorIs(t, err, services.ErrNoSubscription)
	_, err = services.ResumeSubscription(context.Background(), uuid.New())
	assert.ErrorIs(t, err, services.ErrNoSubscription)
}

func TestBillingPortalLink(t *testing.T) {
	testutil.UseDB(t)
	creem := testutil.UseCreem(t)
	ctx := context.Background()
	userId := uuid.New()

	_, err := services.BillingPortalLink(ctx, userId)
	assert.ErrorIs(t, err, services.ErrNoSubscription, "never subscribed")

	addSubscription(t, userId, models.Subscription{CreemSubscriptionId: "sub_1", CreemCustomerId: "cust_ada", Status: "canceled"})
	creem.On("CreateBillingPortalLink", mock.Anything, "cust_ada").Return("https://creem.io/portal/ada", nil).Once()

	portal, err := services.BillingPortalLink(ctx, userId)
	require.NoError(t, err)
	assert.Equal(t, "https://creem.io/portal/ada", portal.URL)
}

// creemEvent is a webhook body as Creem sends it.
func creemEvent(t *testing.T, id, eventType string, object any) []byte {
	t.Helper()
	body, err := json.Marshal(map[string]any{
		"id":         id,
		"eventType":  eventType,
		"created_at": time.Now().UnixMilli(),
		"object":     object,
	})
	require.NoError(t, err)
	return body
}

// deliver hands a signed event to the webhook handler.
func deliver(body []byte) error {
	return services.HandleCreemWebhook(context.Background(), body, testutil.SignCreem(body))
}

// checkoutCompleted is a checkout.completed object, where Creem nests the
// subscription with its product and customer as bare ids.
func checkoutCompleted(subscriptionId string, userId uuid.UUID) map[string]any {
	return map[string]any{
		"id":       "ch_1",
		"object":   "checkout",
		"metadata": map[string]any{"user_id": userId.String()},
		"subscription": map[string]any{
			"id":       subscriptionId,
			"product":  testutil.CreemProductId,
			"customer": "cust_1",
			"status":   "active",
		},
	}
}

// recordedEvents counts the webhook events recorded with the id.
func recordedEvents(t *testing.T, id string) int64 {
	t.Helper()
	var count int64
	require.NoError(t, core.DB.Model(&models.CreemWebhookEvent{}).Where("id = ?", id).Count(&count).Error)
	return count
}

func TestWebhookRejects(t *testing.T) {
	testutil.UseDB(t)
	testutil.UseCreem(t)
	body := creemEvent(t, "evt_1", "subscription.active", map[string]any{"id": "sub_1"})

	err := services.HandleCreemWebhook(context.Background(), body, testutil.SignCreem([]byte("something else")))
	assert.ErrorIs(t, err, services.ErrInvalidSignature)
	assert.ErrorIs(t, services.HandleCreemWebhook(context.Background(), body, ""), services.ErrInvalidSignature)
	assert.ErrorIs(t, services.HandleCreemWebhook(context.Background(), body, "not hex"), services.ErrInvalidSignature)

	assert.ErrorIs(t, deliver([]byte(`not json`)), services.ErrMalformedEvent)
	assert.ErrorIs(t, deliver([]byte(`{"eventType":"subscription.active"}`)), services.ErrMalformedEvent, "no id")
	assert.Zero(t, recordedEvents(t, "evt_1"))
}

func TestWebhookCheckoutCompleted(t *testing.T) {
	testutil.UseDB(t)
	creem := testutil.UseCreem(t)
	userId := uuid.New()
	// Once: the repeated delivery below must not read Creem again.
	creem.On("GetSubscription", mock.Anything, "sub_1").Return(creemSubscription("sub_1", userId, "active", at(0)), nil).Once()
	body := creemEvent(t, "evt_1", "checkout.completed", checkoutCompleted("sub_1", userId))

	require.NoError(t, deliver(body))
	stored := storedSubscription(t, "sub_1")
	require.NotNil(t, stored)
	assert.Equal(t, userId, stored.UserId)
	assert.Equal(t, "active", stored.Status)
	assert.Equal(t, int64(1), recordedEvents(t, "evt_1"))

	require.NoError(t, deliver(body), "a repeated delivery is acknowledged")
	assert.Equal(t, int64(1), recordedEvents(t, "evt_1"))
}

func TestWebhookFollowsTheSubscription(t *testing.T) {
	testutil.UseDB(t)
	creem := testutil.UseCreem(t)
	ctx := context.Background()
	userId := uuid.New()

	steps := []struct {
		event     string
		status    string
		updatedAt *time.Time
		stored    string
		entitled  bool
	}{
		{"subscription.active", "active", at(-3 * time.Hour), "active", true},
		{"subscription.past_due", "past_due", at(-2 * time.Hour), "past_due", true},
		{"subscription.unpaid", "unpaid", at(-90 * time.Minute), "unpaid", true},
		{"subscription.paid", "active", at(-time.Hour), "active", true},
		{"subscription.scheduled_cancel", "scheduled_cancel", at(-30 * time.Minute), "scheduled_cancel", true},
		// A snapshot older than the stored one arrives late and is not stored.
		{"subscription.update", "active", at(-2 * time.Hour), "scheduled_cancel", true},
		{"subscription.canceled", "canceled", at(0), "canceled", false},
	}
	for i, step := range steps {
		creem.On("GetSubscription", mock.Anything, "sub_1").
			Return(creemSubscription("sub_1", userId, step.status, step.updatedAt), nil).Once()
		require.NoError(t, deliver(creemEvent(t, fmt.Sprintf("evt_%d", i), step.event, map[string]any{"id": "sub_1"})), step.event)

		billing, err := services.GetBilling(ctx, userId)
		require.NoError(t, err)
		assert.Equal(t, step.stored, billing.Subscription.Status, step.event)
		assert.Equal(t, step.entitled, billing.Subscription.Entitled, step.event)
	}
}

func TestWebhookMatchesAnExistingSubscription(t *testing.T) {
	testutil.UseDB(t)
	creem := testutil.UseCreem(t)
	userId := uuid.New()
	addSubscription(t, userId, models.Subscription{CreemSubscriptionId: "sub_1", Status: "active"})

	// A subscription without metadata is matched by its id instead.
	subscription := creemSubscription("sub_1", userId, "past_due", at(0))
	subscription.Metadata = nil
	creem.On("GetSubscription", mock.Anything, "sub_1").Return(subscription, nil).Once()

	require.NoError(t, deliver(creemEvent(t, "evt_1", "subscription.past_due", map[string]any{"id": "sub_1"})))
	assert.Equal(t, "past_due", storedSubscription(t, "sub_1").Status)
}

func TestWebhookIgnores(t *testing.T) {
	otherProduct := creemSubscription("sub_1", uuid.New(), "active", at(0))
	otherProduct.Product.Id = "prod_other"
	nobody := creemSubscription("sub_1", uuid.New(), "active", at(0))
	nobody.Metadata = nil

	for name, subscription := range map[string]core.CreemSubscription{"another product": otherProduct, "no member": nobody} {
		t.Run(name, func(t *testing.T) {
			testutil.UseDB(t)
			creem := testutil.UseCreem(t)
			creem.On("GetSubscription", mock.Anything, "sub_1").Return(subscription, nil).Once()
			body := creemEvent(t, "evt_1", "subscription.active", map[string]any{"id": "sub_1"})

			require.NoError(t, deliver(body))
			assert.Nil(t, storedSubscription(t, "sub_1"))
			require.NoError(t, deliver(body), "recorded, so not read from Creem again")
		})
	}

	t.Run("a refund", func(t *testing.T) {
		testutil.UseDB(t)
		testutil.UseCreem(t) // no expectations: Creem is not read
		require.NoError(t, deliver(creemEvent(t, "evt_1", "refund.created", map[string]any{"id": "ref_1"})))
		assert.Equal(t, int64(1), recordedEvents(t, "evt_1"))
	})
}

func TestWebhookRetriesWhenCreemFails(t *testing.T) {
	testutil.UseDB(t)
	creem := testutil.UseCreem(t)
	userId := uuid.New()
	body := creemEvent(t, "evt_1", "subscription.paid", map[string]any{"id": "sub_1"})

	creem.On("GetSubscription", mock.Anything, "sub_1").Return(core.CreemSubscription{}, errors.New("status 503")).Once()
	assert.ErrorIs(t, deliver(body), services.ErrPaymentProvider)
	assert.Zero(t, recordedEvents(t, "evt_1"), "not recorded, so the retry handles it")

	creem.On("GetSubscription", mock.Anything, "sub_1").Return(creemSubscription("sub_1", userId, "active", at(0)), nil).Once()
	require.NoError(t, deliver(body))
	assert.Equal(t, "active", storedSubscription(t, "sub_1").Status)
}

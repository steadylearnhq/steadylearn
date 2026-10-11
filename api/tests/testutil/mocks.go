package testutil

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"testing"

	"github.com/alicebob/miniredis/v2"
	"github.com/aws/aws-sdk-go-v2/service/cognitoidentityprovider"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/mock"

	"steadylearn-api/src/core"
)

// Every third-party service the API calls sits behind an interface global in
// core. Each Use… helper below swaps one for a testify mock for the length of
// the test, and checks on cleanup that every expectation set with On was met.
// A service the test did not mock stays nil, so an unexpected call fails the
// test rather than reaching the real thing.

// MockCognito stands in for the Cognito user pool.
type MockCognito struct{ mock.Mock }

func (m *MockCognito) ListUsers(ctx context.Context, params *cognitoidentityprovider.ListUsersInput, _ ...func(*cognitoidentityprovider.Options)) (*cognitoidentityprovider.ListUsersOutput, error) {
	args := m.Called(ctx, params)
	out, _ := args.Get(0).(*cognitoidentityprovider.ListUsersOutput)
	return out, args.Error(1)
}

// UseCognito points core.Cognito at a mock for the length of the test.
func UseCognito(t *testing.T) *MockCognito {
	t.Helper()
	m := &MockCognito{}
	swap(t, &core.Cognito, core.CognitoUsers(m))
	t.Cleanup(func() { m.AssertExpectations(t) })
	return m
}

// MockCreem stands in for Creem.
type MockCreem struct{ mock.Mock }

func (m *MockCreem) CreateCheckout(ctx context.Context, request core.CreemCheckoutRequest) (core.CreemCheckout, error) {
	args := m.Called(ctx, request)
	out, _ := args.Get(0).(core.CreemCheckout)
	return out, args.Error(1)
}

func (m *MockCreem) GetSubscription(ctx context.Context, subscriptionId string) (core.CreemSubscription, error) {
	args := m.Called(ctx, subscriptionId)
	out, _ := args.Get(0).(core.CreemSubscription)
	return out, args.Error(1)
}

func (m *MockCreem) CancelSubscription(ctx context.Context, subscriptionId string) (core.CreemSubscription, error) {
	args := m.Called(ctx, subscriptionId)
	out, _ := args.Get(0).(core.CreemSubscription)
	return out, args.Error(1)
}

func (m *MockCreem) ResumeSubscription(ctx context.Context, subscriptionId string) (core.CreemSubscription, error) {
	args := m.Called(ctx, subscriptionId)
	out, _ := args.Get(0).(core.CreemSubscription)
	return out, args.Error(1)
}

func (m *MockCreem) CreateBillingPortalLink(ctx context.Context, customerId string) (string, error) {
	args := m.Called(ctx, customerId)
	return args.String(0), args.Error(1)
}

func (m *MockCreem) ListTransactions(ctx context.Context, customerId string) ([]core.CreemTransaction, error) {
	args := m.Called(ctx, customerId)
	out, _ := args.Get(0).([]core.CreemTransaction)
	return out, args.Error(1)
}

// The billing settings UseCreem configures.
const (
	CreemProductId     = "prod_test"
	CreemWebhookSecret = "whsec_test"
	AppURL             = "https://app.test"
)

// UseCreem turns billing on for the length of the test, with core.Creem
// pointed at a mock. Billing caches the member's payments, so it also points
// core.Cache at an in-memory Redis; a test that inspects it calls UseCache
// after.
func UseCreem(t *testing.T) *MockCreem {
	t.Helper()
	UseCache(t)
	swap(t, &core.Config.CreemAPIKey, "creem_test_key")
	swap(t, &core.Config.CreemWebhookSecret, CreemWebhookSecret)
	swap(t, &core.Config.CreemProductId, CreemProductId)
	swap(t, &core.Config.AppURL, AppURL)
	m := &MockCreem{}
	swap(t, &core.Creem, core.CreemAPI(m))
	t.Cleanup(func() { m.AssertExpectations(t) })
	return m
}

// SignCreem is the creem-signature header Creem would send with body.
func SignCreem(body []byte) string {
	mac := hmac.New(sha256.New, []byte(CreemWebhookSecret))
	mac.Write(body)
	return hex.EncodeToString(mac.Sum(nil))
}

// MockStatsig stands in for Statsig.
type MockStatsig struct{ mock.Mock }

func (m *MockStatsig) CheckGate(ctx context.Context, user core.FlagUser, name string) bool {
	args := m.Called(ctx, user, name)
	return args.Bool(0)
}

func (m *MockStatsig) GetDynamicConfig(ctx context.Context, user core.FlagUser, name string) map[string]any {
	args := m.Called(ctx, user, name)
	out, _ := args.Get(0).(map[string]any)
	return out
}

func (m *MockStatsig) GetExperiment(ctx context.Context, user core.FlagUser, name string) core.FlagExperiment {
	args := m.Called(ctx, user, name)
	out, _ := args.Get(0).(core.FlagExperiment)
	return out
}

func (m *MockStatsig) LogExperimentExposure(ctx context.Context, user core.FlagUser, name string) {
	m.Called(ctx, user, name)
}

func (m *MockStatsig) Shutdown(ctx context.Context) error {
	args := m.Called(ctx)
	return args.Error(0)
}

// UseStatsig turns Statsig on for the length of the test, with core.Statsig
// pointed at a mock.
func UseStatsig(t *testing.T) *MockStatsig {
	t.Helper()
	swap(t, &core.Config.StatsigServerSecret, "secret-test")
	m := &MockStatsig{}
	swap(t, &core.Statsig, core.FeatureFlags(m))
	t.Cleanup(func() { m.AssertExpectations(t) })
	return m
}

// UseCache points core.Cache at an in-memory Redis for the length of the test.
// The returned server lets the test inspect keys, fast-forward TTLs, or Close it
// to play an unreachable cache.
func UseCache(t *testing.T) *miniredis.Miniredis {
	t.Helper()
	server := miniredis.RunT(t)
	client := redis.NewClient(&redis.Options{Addr: server.Addr()})
	t.Cleanup(func() { _ = client.Close() })
	swap(t, &core.Cache, client)
	return server
}

// swap sets a global for the length of the test and restores it after.
func swap[T any](t *testing.T, global *T, value T) {
	t.Helper()
	previous := *global
	*global = value
	t.Cleanup(func() { *global = previous })
}

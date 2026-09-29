package testutil

import (
	"context"
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

package testutil

import (
	"context"
	"testing"

	"github.com/aws/aws-sdk-go-v2/service/cognitoidentityprovider"
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

// swap sets a global for the length of the test and restores it after.
func swap[T any](t *testing.T, global *T, value T) {
	t.Helper()
	previous := *global
	*global = value
	t.Cleanup(func() { *global = previous })
}

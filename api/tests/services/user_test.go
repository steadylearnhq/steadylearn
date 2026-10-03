package services_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/cognitoidentityprovider"
	"github.com/aws/aws-sdk-go-v2/service/cognitoidentityprovider/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"steadylearn-api/src/models"
	"steadylearn-api/src/schemas"
	"steadylearn-api/src/services"
	"steadylearn-api/tests/testutil"
)

// poolUser is what the user pool's ListUsers returns for one user.
func poolUser(attributes map[string]string) *cognitoidentityprovider.ListUsersOutput {
	user := types.UserType{}
	for name, value := range attributes {
		user.Attributes = append(user.Attributes, types.AttributeType{Name: aws.String(name), Value: aws.String(value)})
	}
	return &cognitoidentityprovider.ListUsersOutput{Users: []types.UserType{user}}
}

// forSub matches the ListUsers call that looks up the given user.
func forSub(userID uuid.UUID) any {
	return mock.MatchedBy(func(in *cognitoidentityprovider.ListUsersInput) bool {
		return aws.ToString(in.Filter) == `sub = "`+userID.String()+`"`
	})
}

func TestSetupUser(t *testing.T) {
	testutil.UseDB(t)
	ctx := context.Background()
	userID := uuid.New()

	user, err := services.SetupUser(ctx, userID)
	require.NoError(t, err)
	assert.Equal(t, userID, user.Id)

	stored, err := services.GetUserById(ctx, userID)
	require.NoError(t, err)
	assert.Equal(t, user, stored)

	// Setting up again is a no-op rather than a duplicate key error.
	again, err := services.SetupUser(ctx, userID)
	require.NoError(t, err)
	assert.Equal(t, user, again)
}

func TestGetUserByIdNotSetUp(t *testing.T) {
	testutil.UseDB(t)

	_, err := services.GetUserById(context.Background(), uuid.New())
	assert.ErrorIs(t, err, services.ErrUserNotFound)
}

func TestGetUserProfile(t *testing.T) {
	cognito := testutil.UseCognito(t)
	userID := uuid.New()

	cognito.On("ListUsers", mock.Anything, forSub(userID)).Return(poolUser(map[string]string{
		"email":      "olena@example.com",
		"given_name": "Olena",
		"identities": `[{"providerName":"Google"}]`,
	}), nil).Once()

	profile, err := services.GetUserProfile(userID)
	require.NoError(t, err)

	assert.Equal(t, schemas.UserProfileSchema{
		Email:            "olena@example.com",
		Name:             aws.String("Olena"),
		Picture:          nil,
		ExternalProvider: aws.String("Google"),
	}, profile, "name falls back to given_name, and a missing picture is null")
}

func TestGetUserProfileReportsPoolFailure(t *testing.T) {
	cognito := testutil.UseCognito(t)
	userID := uuid.New()

	cognito.On("ListUsers", mock.Anything, forSub(userID)).
		Return(nil, errors.New("throttled")).Once()

	_, err := services.GetUserProfile(userID)
	assert.ErrorIs(t, err, services.ErrIdentityProvider)
}

// setUpUser gives the test a user who has a local row, and a user pool that
// answers for them once.
func setUpUser(t *testing.T, cognito *testutil.MockCognito) uuid.UUID {
	t.Helper()
	userID := uuid.New()

	_, err := services.SetupUser(context.Background(), userID)
	require.NoError(t, err)

	cognito.On("ListUsers", mock.Anything, forSub(userID)).Return(poolUser(map[string]string{
		"email": "olena@example.com",
		"name":  "Olena",
	}), nil).Once()

	return userID
}

func TestGetCurrentUserReadsThroughTheCache(t *testing.T) {
	testutil.UseDB(t)
	cognito := testutil.UseCognito(t)
	cache := testutil.UseCache(t)
	ctx := context.Background()
	userID := setUpUser(t, cognito)

	first, err := services.GetCurrentUser(ctx, userID)
	require.NoError(t, err)
	assert.Equal(t, userID, first.Id)
	require.NotNil(t, first.Profile)
	assert.Equal(t, "olena@example.com", first.Profile.Email)
	assert.True(t, cache.Exists(services.CurrentUserCacheKey(userID)), "a miss stores the user")

	// The user pool was told to answer once, so a second trip there fails the
	// test: this one has to come from the cache.
	second, err := services.GetCurrentUser(ctx, userID)
	require.NoError(t, err)
	assert.Equal(t, first, second)
}

func TestGetCurrentUserRefetchesAfterExpiry(t *testing.T) {
	testutil.UseDB(t)
	cognito := testutil.UseCognito(t)
	cache := testutil.UseCache(t)
	ctx := context.Background()
	userID := setUpUser(t, cognito)

	_, err := services.GetCurrentUser(ctx, userID)
	require.NoError(t, err)

	cache.FastForward(10 * time.Minute)
	cognito.On("ListUsers", mock.Anything, forSub(userID)).Return(poolUser(map[string]string{
		"email": "olena@example.com",
		"name":  "Olena K.",
	}), nil).Once()

	user, err := services.GetCurrentUser(ctx, userID)
	require.NoError(t, err)
	assert.Equal(t, aws.String("Olena K."), user.Profile.Name, "an expired entry is fetched again")
}

func TestGetCurrentUserServesWithoutTheCache(t *testing.T) {
	testutil.UseDB(t)
	cognito := testutil.UseCognito(t)
	cache := testutil.UseCache(t)
	userID := setUpUser(t, cognito)

	cache.Close()

	user, err := services.GetCurrentUser(context.Background(), userID)
	require.NoError(t, err, "an unreachable cache falls back to the source")
	assert.Equal(t, userID, user.Id)
	require.NotNil(t, user.Profile)
}

func TestGetCurrentUserDoesNotCacheFailures(t *testing.T) {
	testutil.UseDB(t)
	cognito := testutil.UseCognito(t)
	cache := testutil.UseCache(t)
	ctx := context.Background()

	notSetUp := uuid.New()
	_, err := services.GetCurrentUser(ctx, notSetUp)
	assert.ErrorIs(t, err, services.ErrUserNotFound)
	assert.False(t, cache.Exists(services.CurrentUserCacheKey(notSetUp)))

	throttled := uuid.New()
	_, err = services.SetupUser(ctx, throttled)
	require.NoError(t, err)
	cognito.On("ListUsers", mock.Anything, forSub(throttled)).
		Return(nil, errors.New("throttled")).Once()

	_, err = services.GetCurrentUser(ctx, throttled)
	assert.ErrorIs(t, err, services.ErrIdentityProvider)
	assert.False(t, cache.Exists(services.CurrentUserCacheKey(throttled)))
}

func TestGetCurrentUserCarriesAFreshSubscription(t *testing.T) {
	testutil.UseDB(t)
	cognito := testutil.UseCognito(t)
	testutil.UseCache(t)
	ctx := context.Background()
	userID := setUpUser(t, cognito)

	user, err := services.GetCurrentUser(ctx, userID)
	require.NoError(t, err)
	assert.Nil(t, user.Subscription, "never subscribed")

	addSubscription(t, userID, models.Subscription{CreemSubscriptionId: "sub_1", Status: "active", CurrentPeriodEnd: at(time.Hour)})

	// The user pool answers once, so this comes from the cache, and the
	// subscription still shows: it is not part of what is cached.
	user, err = services.GetCurrentUser(ctx, userID)
	require.NoError(t, err)
	require.NotNil(t, user.Subscription)
	assert.Equal(t, "active", user.Subscription.Status)
	assert.True(t, user.Subscription.Entitled)
}

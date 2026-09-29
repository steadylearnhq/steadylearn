package services_test

import (
	"context"
	"errors"
	"testing"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/cognitoidentityprovider"
	"github.com/aws/aws-sdk-go-v2/service/cognitoidentityprovider/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

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
	// A fresh id per test also keeps core's Cognito details cache from
	// answering for a user another test looked up.
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

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

// setUpUser creates a user whose pool entry carries the given name.
func setUpUser(t *testing.T, cognito *testutil.MockCognito, name string) uuid.UUID {
	t.Helper()
	userID := uuid.New()
	cognito.On("ListUsers", mock.Anything, forSub(userID)).
		Return(poolUser(map[string]string{"name": name}), nil).Once()

	_, err := services.SetupUser(context.Background(), userID)
	require.NoError(t, err)
	return userID
}

func TestSetupUser(t *testing.T) {
	testutil.UseDB(t)
	cognito := testutil.UseCognito(t)
	ctx := context.Background()
	// A fresh id per test also keeps core's Cognito details cache from
	// answering for a user another test looked up.
	userID := uuid.New()

	cognito.On("ListUsers", mock.Anything, forSub(userID)).Return(poolUser(map[string]string{
		"given_name": "Olena",
		"picture":    "https://example.com/olena.png",
	}), nil).Once()

	user, err := services.SetupUser(ctx, userID)
	require.NoError(t, err)

	assert.Equal(t, userID, user.Id)
	assert.Equal(t, "Olena", user.Name, "falls back to given_name")
	require.NotNil(t, user.PictureUrl)
	assert.Equal(t, "https://example.com/olena.png", *user.PictureUrl)

	stored, err := services.GetUserById(ctx, userID)
	require.NoError(t, err)
	assert.Equal(t, user, stored)

	// Setting up again returns the stored user without asking Cognito, which
	// the mock's Once enforces.
	again, err := services.SetupUser(ctx, userID)
	require.NoError(t, err)
	assert.Equal(t, user, again)
}

func TestSetupUserReportsPoolFailure(t *testing.T) {
	testutil.UseDB(t)
	cognito := testutil.UseCognito(t)
	ctx := context.Background()
	userID := uuid.New()

	cognito.On("ListUsers", mock.Anything, forSub(userID)).
		Return(nil, errors.New("throttled")).Once()

	_, err := services.SetupUser(ctx, userID)
	require.ErrorIs(t, err, services.ErrIdentityProvider)

	_, err = services.GetUserById(ctx, userID)
	assert.ErrorIs(t, err, services.ErrUserNotFound, "no row is written")
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
		"identities": `[{"providerName":"Google"}]`,
	}), nil).Once()

	profile, err := services.GetUserProfile(userID)
	require.NoError(t, err)

	assert.Equal(t, schemas.UserProfileSchema{
		Email:            "olena@example.com",
		Name:             nil,
		Picture:          nil,
		ExternalProvider: aws.String("Google"),
	}, profile, "values the pool does not hold are null")
}

func TestUpdateUser(t *testing.T) {
	testutil.UseDB(t)
	cognito := testutil.UseCognito(t)
	ctx := context.Background()
	userID := setUpUser(t, cognito, "Olena")

	updated, err := services.UpdateUser(ctx, userID, schemas.UpdateUserSchema{Name: aws.String("  Olena K.  ")})
	require.NoError(t, err)
	assert.Equal(t, "Olena K.", updated.Name, "is trimmed")

	stored, err := services.GetUserById(ctx, userID)
	require.NoError(t, err)
	assert.Equal(t, updated, stored)

	// An empty payload changes nothing.
	unchanged, err := services.UpdateUser(ctx, userID, schemas.UpdateUserSchema{})
	require.NoError(t, err)
	assert.Equal(t, stored, unchanged)
}

func TestUpdateUserRejectsBlankName(t *testing.T) {
	testutil.UseDB(t)
	cognito := testutil.UseCognito(t)
	ctx := context.Background()
	userID := setUpUser(t, cognito, "Olena")

	_, err := services.UpdateUser(ctx, userID, schemas.UpdateUserSchema{Name: aws.String("   ")})
	require.ErrorIs(t, err, services.ErrInvalidName)

	stored, err := services.GetUserById(ctx, userID)
	require.NoError(t, err)
	assert.Equal(t, "Olena", stored.Name)
}

func TestUpdateUserNotSetUp(t *testing.T) {
	testutil.UseDB(t)

	_, err := services.UpdateUser(context.Background(), uuid.New(), schemas.UpdateUserSchema{Name: aws.String("Olena")})
	assert.ErrorIs(t, err, services.ErrUserNotFound)
}

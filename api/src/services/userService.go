package services

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"steadylearn-api/src/core"
	"steadylearn-api/src/models"
	"steadylearn-api/src/schemas"
)

var (
	// ErrUserNotFound is a caller with a valid token but no local row, which
	// setup has not run for yet.
	ErrUserNotFound = errors.New("user not found")
	// ErrIdentityProvider wraps a failed call to the user pool, so a caller can
	// tell it apart from a failure of the API's own database.
	ErrIdentityProvider = errors.New("identity provider request failed")
	// ErrInvalidName is a name that is blank once trimmed.
	ErrInvalidName = errors.New("name must not be blank")
)

func toUserSchema(user models.User) schemas.UserSchema {
	return schemas.UserSchema{
		Id:         user.Id,
		Name:       user.Name,
		PictureUrl: user.PictureUrl,
	}
}

func findUser(ctx context.Context, id uuid.UUID) (models.User, error) {
	var user models.User
	err := core.DB.WithContext(ctx).First(&user, "id = ? AND deleted_at IS NULL", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return models.User{}, ErrUserNotFound
	}
	return user, err
}

func GetUserById(ctx context.Context, id uuid.UUID) (schemas.UserSchema, error) {
	user, err := findUser(ctx, id)
	if err != nil {
		return schemas.UserSchema{}, err
	}

	return toUserSchema(user), nil
}

// SetupUser creates the local user row for an authenticated Cognito user,
// seeding name and picture from the user pool. It is idempotent: a user who
// already exists is returned as they are.
func SetupUser(ctx context.Context, userId uuid.UUID) (schemas.UserSchema, error) {
	user, err := findUser(ctx, userId)
	if err == nil {
		return toUserSchema(user), nil
	}
	if !errors.Is(err, ErrUserNotFound) {
		return schemas.UserSchema{}, err
	}

	cognitoDetails, err := core.GetCognitoUserDetails(userId)
	if err != nil {
		return schemas.UserSchema{}, fmt.Errorf("%w: %w", ErrIdentityProvider, err)
	}

	user = models.User{
		BaseModel: models.BaseModel{
			Id: userId,
		},
		Name:       cognitoDetails.Name,
		PictureUrl: cognitoDetails.PictureURL,
	}
	// Two setup calls racing past the lookup above would both insert. The
	// loser's insert is skipped rather than failed: the winner wrote the same
	// user pool details, so either one's view of the row is correct.
	if err := core.DB.WithContext(ctx).Clauses(clause.OnConflict{DoNothing: true}).Create(&user).Error; err != nil {
		return schemas.UserSchema{}, err
	}
	return toUserSchema(user), nil
}

// optionalString reports an absent value as null rather than as an empty string.
func optionalString(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

// GetUserProfile is the identity provider's view of the user. It is a separate
// call from GetUserById because it costs a round trip to the user pool, and the
// plain read is on the path of every page load.
func GetUserProfile(userId uuid.UUID) (schemas.UserProfileSchema, error) {
	details, err := core.GetCognitoUserDetails(userId)
	if err != nil {
		return schemas.UserProfileSchema{}, fmt.Errorf("%w: %w", ErrIdentityProvider, err)
	}

	return schemas.UserProfileSchema{
		Email:            details.Email,
		Name:             optionalString(details.Name),
		Picture:          details.PictureURL,
		ExternalProvider: optionalString(details.ExternalProvider),
	}, nil
}

func UpdateUser(ctx context.Context, userId uuid.UUID, schema schemas.UpdateUserSchema) (schemas.UserSchema, error) {
	user, err := findUser(ctx, userId)
	if err != nil {
		return schemas.UserSchema{}, err
	}

	updates := map[string]any{}
	if schema.Name != nil {
		name := strings.TrimSpace(*schema.Name)
		if name == "" {
			return schemas.UserSchema{}, ErrInvalidName
		}
		updates["name"] = name
	}

	if len(updates) > 0 {
		if err := core.DB.WithContext(ctx).Model(&user).Updates(updates).Error; err != nil {
			return schemas.UserSchema{}, err
		}
	}

	return toUserSchema(user), nil
}

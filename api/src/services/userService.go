package services

import (
	"context"
	"errors"
	"fmt"
	"time"

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
)

func toUserSchema(user models.User) schemas.UserSchema {
	return schemas.UserSchema{
		Id: user.Id,
	}
}

func GetUserById(ctx context.Context, id uuid.UUID) (schemas.UserSchema, error) {
	var user models.User
	err := core.DB.WithContext(ctx).First(&user, "id = ? AND deleted_at IS NULL", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return schemas.UserSchema{}, ErrUserNotFound
	}
	if err != nil {
		return schemas.UserSchema{}, err
	}

	return toUserSchema(user), nil
}

// SetupUser creates the local user row for an authenticated Cognito user. It is
// idempotent: a user who already exists is returned as they are, and two calls
// racing to create the row leave exactly one.
func SetupUser(ctx context.Context, userId uuid.UUID) (schemas.UserSchema, error) {
	user := models.User{
		BaseModel: models.BaseModel{
			Id: userId,
		},
	}
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
// call from GetUserById because it costs a round trip to the user pool;
// GetCurrentUser combines the two behind the cache.
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

// currentUserCacheTTL is how long a cached current user is served before the
// database and the user pool are asked again. It is also the longest a change
// made in the user pool (a new name or picture) takes to show.
const currentUserCacheTTL = 5 * time.Minute

// CurrentUserCacheKey is where the current user is cached. The version segment
// is bumped whenever UserSchema changes shape, so an entry written by an older
// build is never decoded into the new one.
func CurrentUserCacheKey(userId uuid.UUID) string {
	return core.CacheKey("user", "v1", userId.String())
}

// GetCurrentUser is the user together with their profile, as the /me endpoint
// serves it. It reads through the cache: a hit answers without touching the
// database or the user pool, and a miss asks both and stores the result. A
// user who has not been set up yet, or a throttled user pool, is not cached,
// so they are asked again on the next request.
func GetCurrentUser(ctx context.Context, userId uuid.UUID) (schemas.UserSchema, error) {
	return cached(ctx, CurrentUserCacheKey(userId), currentUserCacheTTL, func() (schemas.UserSchema, error) {
		user, err := GetUserById(ctx, userId)
		if err != nil {
			return schemas.UserSchema{}, err
		}

		profile, err := GetUserProfile(userId)
		if err != nil {
			return schemas.UserSchema{}, err
		}
		user.Profile = &profile

		return user, nil
	})
}

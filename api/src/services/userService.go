package services

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
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
// database or the user pool, and a miss asks both and stores the result.
//
// The cache is an optimisation, never a dependency. When Redis cannot be read
// or written the error is logged and the user is served from the source.
// Failures are not cached, so a user who has not been set up yet, or a
// throttled user pool, is asked again on the next request.
func GetCurrentUser(ctx context.Context, userId uuid.UUID) (schemas.UserSchema, error) {
	key := CurrentUserCacheKey(userId)

	if user, ok := readCachedUser(ctx, key); ok {
		return user, nil
	}

	user, err := GetUserById(ctx, userId)
	if err != nil {
		return schemas.UserSchema{}, err
	}

	profile, err := GetUserProfile(userId)
	if err != nil {
		return schemas.UserSchema{}, err
	}
	user.Profile = &profile

	writeCachedUser(ctx, key, user)

	return user, nil
}

// readCachedUser reports a miss for an absent key, an unreachable cache and an
// entry that does not decode alike: each is answered from the source.
func readCachedUser(ctx context.Context, key string) (schemas.UserSchema, bool) {
	raw, err := core.Cache.Get(ctx, key).Bytes()
	if errors.Is(err, redis.Nil) {
		return schemas.UserSchema{}, false
	}
	if err != nil {
		slog.WarnContext(ctx, "cache read failed", "key", key, "error", err)
		return schemas.UserSchema{}, false
	}

	var user schemas.UserSchema
	if err := json.Unmarshal(raw, &user); err != nil {
		slog.WarnContext(ctx, "cached user did not decode", "key", key, "error", err)
		return schemas.UserSchema{}, false
	}

	return user, true
}

func writeCachedUser(ctx context.Context, key string, user schemas.UserSchema) {
	raw, err := json.Marshal(user)
	if err != nil {
		slog.WarnContext(ctx, "failed to encode user for the cache", "key", key, "error", err)
		return
	}

	if err := core.Cache.Set(ctx, key, raw, currentUserCacheTTL).Err(); err != nil {
		slog.WarnContext(ctx, "cache write failed", "key", key, "error", err)
	}
}

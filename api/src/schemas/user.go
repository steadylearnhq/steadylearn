package schemas

import (
	"github.com/google/uuid"
)

// UserProfileSchema is the identity provider's view of the user. It is not
// stored: the user pool owns these fields and the API only relays them, so a
// value the pool does not hold is reported as null rather than as an empty
// string.
type UserProfileSchema struct {
	Email   string  `json:"email" example:"john@example.com"`
	Name    *string `json:"name" example:"John Doe"`
	Picture *string `json:"picture" example:"https://example.com/picture.png"`
	// ExternalProvider is the federated identity the user signed in through, and
	// is null for a user who signed up with a password.
	ExternalProvider *string `json:"externalProvider" example:"Google"`
}

type UserSchema struct {
	Id uuid.UUID `json:"id" example:"123e4567-e89b-12d3-a456-426614174000"`
	// Profile is filled in only when the request asks for it, because filling it
	// in costs a call to the user pool.
	Profile *UserProfileSchema `json:"profile,omitempty"`
}

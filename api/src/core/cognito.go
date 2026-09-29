package core

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/MicahParks/keyfunc/v3"
	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/cognitoidentityprovider"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

var jwks keyfunc.Keyfunc

// CognitoUsers is the part of the Cognito user pool API the API calls, so a
// test can stand in for AWS.
type CognitoUsers interface {
	ListUsers(ctx context.Context, params *cognitoidentityprovider.ListUsersInput, optFns ...func(*cognitoidentityprovider.Options)) (*cognitoidentityprovider.ListUsersOutput, error)
}

// Cognito reads the user pool. InitCognito sets it to the AWS SDK client.
var Cognito CognitoUsers

// InitCognito initializes the JWKS for Cognito token validation and the Cognito SDK client
func InitCognito() error {
	jwksURL := fmt.Sprintf(
		"https://cognito-idp.%s.amazonaws.com/%s/.well-known/jwks.json",
		Config.CognitoRegion,
		Config.CognitoUserPoolID,
	)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	k, err := keyfunc.NewDefaultCtx(ctx, []string{jwksURL})
	if err != nil {
		return fmt.Errorf("failed to create JWKS keyfunc: %w", err)
	}
	jwks = k

	cfg, err := awsconfig.LoadDefaultConfig(ctx, awsconfig.WithRegion(Config.CognitoRegion))
	if err != nil {
		return fmt.Errorf("failed to load AWS config: %w", err)
	}
	Cognito = cognitoidentityprovider.NewFromConfig(cfg)

	return nil
}

// CognitoUserDetails is what the user pool holds about a user, beyond the id
// the token already carries.
type CognitoUserDetails struct {
	Email      string
	Name       string
	PictureURL *string
	// ExternalProvider is the federated identity the user signed in through --
	// "Google", "Apple" -- and is empty for a user who signed up with a password.
	ExternalProvider string
}

// cognitoDetailsTTL is how long a user pool lookup is reused. Names, pictures
// and providers change approximately never, and the alternative is an AWS round
// trip on every read of the profile.
const cognitoDetailsTTL = 5 * time.Minute

// cognitoCallTimeout bounds the lookup. Without it a stalled AWS call holds the
// request goroutine open indefinitely.
const cognitoCallTimeout = 5 * time.Second

type cachedCognitoDetails struct {
	details   CognitoUserDetails
	expiresAt time.Time
}

// cognitoDetailsCache is process-local, so it is a per-instance saving rather
// than a shared one. That is enough: it exists to collapse the repeated reads of
// a single session, not to be a system of record.
var cognitoDetailsCache sync.Map

// cognitoIdentity is one entry of the identities attribute, which Cognito stores
// as a JSON string rather than as structured data.
type cognitoIdentity struct {
	ProviderName string `json:"providerName"`
}

// externalProvider reads the federated provider out of the identities attribute.
// Cognito spells the Apple provider "SignInWithApple" while Google and Facebook
// are named plainly, so the prefix is stripped to leave the brand on its own.
//
// An attribute that is absent or unparseable is a user who signed up with a
// password, and yields "" rather than an error: a profile is worth answering
// with even when the provider cannot be named.
func externalProvider(identities string) string {
	if identities == "" {
		return ""
	}

	var parsed []cognitoIdentity
	if err := json.Unmarshal([]byte(identities), &parsed); err != nil || len(parsed) == 0 {
		return ""
	}

	return strings.TrimPrefix(parsed[0].ProviderName, "SignInWith")
}

// firstNonEmpty returns the first value that is set, so an attribute can fall
// back to its alternate spelling in the pool.
func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}

// GetCognitoUserDetails fetches the user pool's view of the given sub. Results
// are cached for cognitoDetailsTTL.
//
// The lookup is a ListUsers filtered on sub rather than an AdminGetUser: a
// federated user's pool username is their provider id ("google_1234..."), not
// their sub, so addressing them by sub directly would fail for exactly the users
// whose provider this is trying to report.
func GetCognitoUserDetails(userID uuid.UUID) (CognitoUserDetails, error) {
	if Cognito == nil {
		return CognitoUserDetails{}, errors.New("cognito client not initialized")
	}

	if cached, ok := cognitoDetailsCache.Load(userID); ok {
		entry := cached.(cachedCognitoDetails)
		if time.Now().Before(entry.expiresAt) {
			return entry.details, nil
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), cognitoCallTimeout)
	defer cancel()

	out, err := Cognito.ListUsers(ctx, &cognitoidentityprovider.ListUsersInput{
		UserPoolId: aws.String(Config.CognitoUserPoolID),
		Filter:     aws.String(fmt.Sprintf(`sub = "%s"`, userID.String())),
		Limit:      aws.Int32(1),
	})
	if err != nil {
		return CognitoUserDetails{}, fmt.Errorf("failed to list cognito users: %w", err)
	}
	if len(out.Users) == 0 {
		return CognitoUserDetails{}, fmt.Errorf("cognito user not found for sub %s", userID)
	}

	attributes := make(map[string]string, len(out.Users[0].Attributes))
	for _, attr := range out.Users[0].Attributes {
		attributes[aws.ToString(attr.Name)] = aws.ToString(attr.Value)
	}

	// A pool may spell either of these two ways depending on how the user was
	// created, so each falls back to its alternate.
	details := CognitoUserDetails{
		Email:            attributes["email"],
		Name:             firstNonEmpty(attributes["name"], attributes["given_name"]),
		ExternalProvider: externalProvider(attributes["identities"]),
	}
	if picture := firstNonEmpty(attributes["picture"], attributes["picture_url"]); picture != "" {
		details.PictureURL = &picture
	}

	cognitoDetailsCache.Store(userID, cachedCognitoDetails{
		details:   details,
		expiresAt: time.Now().Add(cognitoDetailsTTL),
	})

	return details, nil
}

// CognitoClaims represents the claims in a Cognito JWT token
type CognitoClaims struct {
	jwt.RegisteredClaims
	TokenUse string `json:"token_use"`
	Username string `json:"username"`
	Email    string `json:"email"`
}

// ValidateCognitoToken validates a Cognito JWT token and returns the user ID
func ValidateCognitoToken(tokenString string) (uuid.UUID, error) {
	if jwks == nil {
		return uuid.Nil, errors.New("JWKS not initialized")
	}

	token, err := jwt.ParseWithClaims(tokenString, &CognitoClaims{}, jwks.KeyfuncCtx(context.Background()))
	if err != nil {
		return uuid.Nil, fmt.Errorf("failed to parse token: %w", err)
	}

	if !token.Valid {
		return uuid.Nil, errors.New("invalid token")
	}

	claims, ok := token.Claims.(*CognitoClaims)
	if !ok {
		return uuid.Nil, errors.New("invalid token claims")
	}

	if claims.TokenUse != "id" && claims.TokenUse != "access" {
		return uuid.Nil, errors.New("invalid token_use claim")
	}

	expectedIssuer := fmt.Sprintf(
		"https://cognito-idp.%s.amazonaws.com/%s",
		Config.CognitoRegion,
		Config.CognitoUserPoolID,
	)
	if claims.Issuer != expectedIssuer {
		return uuid.Nil, errors.New("invalid token issuer")
	}

	userID, err := uuid.Parse(claims.Subject)
	if err != nil {
		return uuid.Nil, fmt.Errorf("invalid user ID in token: %w", err)
	}

	return userID, nil
}

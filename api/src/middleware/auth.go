package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"steadylearn-api/src/core"
)

// RequireAuth rejects the request unless it carries a valid Cognito bearer token.
// On success the user id (the token's sub claim) is stored under "user_id".
func RequireAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Authorization header is required"})
			c.Abort()
			return
		}

		if !strings.HasPrefix(authHeader, "Bearer ") {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid authorization header format"})
			c.Abort()
			return
		}

		token := strings.TrimPrefix(authHeader, "Bearer ")
		if token == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Token is required"})
			c.Abort()
			return
		}

		userID, err := core.ValidateCognitoToken(token)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid or expired token"})
			c.Abort()
			return
		}

		c.Set("user_id", userID)
		c.Next()
	}
}

// OptionalAuth lets a request without an Authorization header through as a
// visitor's. One that carries a header is checked as RequireAuth checks it, so
// a bad or expired token is rejected rather than quietly treated as a visitor.
func OptionalAuth() gin.HandlerFunc {
	requireAuth := RequireAuth()
	return func(c *gin.Context) {
		if c.GetHeader("Authorization") == "" {
			c.Next()
			return
		}
		requireAuth(c)
	}
}

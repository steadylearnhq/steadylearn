package middleware_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"

	"steadylearn-api/src/middleware"
)

// serve runs one request through OptionalAuth and reports the status and
// whether the handler behind it ran with a user id.
func serve(header string) (status int, reached bool, userID string) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/", middleware.OptionalAuth(), func(c *gin.Context) {
		reached = true
		userID = c.GetString("user_id")
		c.Status(http.StatusOK)
	})

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/", nil)
	if header != "" {
		req.Header.Set("Authorization", header)
	}
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec.Code, reached, userID
}

func TestOptionalAuth(t *testing.T) {
	t.Run("without a header the request goes through as a visitor's", func(t *testing.T) {
		status, reached, userID := serve("")
		assert.Equal(t, http.StatusOK, status)
		assert.True(t, reached)
		assert.Empty(t, userID)
	})

	// A token that does not validate is rejected, not downgraded to a visitor.
	for _, header := range []string{"Token abc", "Bearer ", "Bearer not-a-jwt"} {
		t.Run("rejects "+header, func(t *testing.T) {
			status, reached, _ := serve(header)
			assert.Equal(t, http.StatusUnauthorized, status)
			assert.False(t, reached)
		})
	}
}

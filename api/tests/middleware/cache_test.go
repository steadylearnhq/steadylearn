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

// cacheControl runs one request through NoStore and the given handlers and
// returns the response's Cache-Control.
func cacheControl(handlers ...gin.HandlerFunc) string {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(middleware.NoStore())
	router.GET("/", handlers...)

	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/", nil))
	return rec.Header().Get("Cache-Control")
}

func TestNoStore(t *testing.T) {
	t.Run("a response that says nothing is not stored", func(t *testing.T) {
		assert.Equal(t, "no-store", cacheControl(func(c *gin.Context) {
			c.Status(http.StatusOK)
		}))
	})

	t.Run("nor is a rejected request", func(t *testing.T) {
		assert.Equal(t, "no-store", cacheControl(middleware.RequireAuth(), func(c *gin.Context) {
			c.Status(http.StatusOK)
		}))
	})

	t.Run("a handler's own Cache-Control replaces it", func(t *testing.T) {
		assert.Equal(t, "public, max-age=60", cacheControl(func(c *gin.Context) {
			c.Header("Cache-Control", "public, max-age=60")
			c.Status(http.StatusOK)
		}))
	})
}

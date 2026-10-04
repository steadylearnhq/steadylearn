package middleware

import "github.com/gin-gonic/gin"

// NoStore marks every response as not to be stored by any cache. Render's edge
// caches every response that does not say otherwise, keyed on the URL alone,
// so without it a health check or a 404 is served stale from the edge. A
// handler whose response may be shared sets its own Cache-Control, which
// replaces this one.
func NoStore() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Cache-Control", "no-store")
		c.Next()
	}
}

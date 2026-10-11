package controllers

import (
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"steadylearn-api/src/core"
)

// StableIDHeader carries the app's Statsig stableID. The app sends it only
// with analytics consent, so it also says the caller may be counted in an
// experiment.
const StableIDHeader = "X-Statsig-Stable-ID"

// FlagUser is the caller as feature flags and experiments see them: the
// signed-in user when auth ran, and the stableID the app sent, if any.
// Handlers pass it to services, which never read the request.
func FlagUser(c *gin.Context) core.FlagUser {
	u := core.FlagUser{
		StableID:  strings.TrimSpace(c.GetHeader(StableIDHeader)),
		IP:        c.ClientIP(),
		UserAgent: c.Request.UserAgent(),
	}
	if userId, ok := c.Get("user_id"); ok {
		if id, ok := userId.(uuid.UUID); ok {
			u.UserID = id.String()
		}
	}
	return u
}

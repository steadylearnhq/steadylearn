package controllers

import (
	"errors"
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"steadylearn-api/src/services"
)

// GetCurrentUser handles retrieving the current user
// @Summary Get current user
// @Description Get the currently authenticated user, optionally with the identity provider's profile attached. A 404 means the user has not been set up yet.
// @Tags users
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param profile query bool false "Attach the identity provider's profile block. Costs one call to the user pool"
// @Success 200 {object} schemas.UserSchema
// @Failure 401 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Failure 502 {object} map[string]string
// @Router /v1/users/me [get]
func GetCurrentUser(c *gin.Context) {
	userId := c.MustGet("user_id").(uuid.UUID)

	user, err := services.GetUserById(c.Request.Context(), userId)
	if errors.Is(err, services.ErrUserNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}
	if err != nil {
		slog.ErrorContext(c.Request.Context(), "GetUserById failed", "user_id", userId, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load user"})
		return
	}

	// The profile is opt-in because it is a call out to the identity provider,
	// and this endpoint is read on every page load. A failure there is the
	// provider's, not the caller's, so it is reported as a 502.
	if c.Query("profile") == "true" {
		profile, err := services.GetUserProfile(userId)
		if err != nil {
			// The client only gets a generic 502; the underlying AWS/Cognito error
			// (credentials, IAM, pool id, timeout) is only visible here.
			slog.ErrorContext(c.Request.Context(), "GetUserProfile failed", "user_id", userId, "error", err)
			c.JSON(http.StatusBadGateway, gin.H{"error": "Failed to fetch the user profile from the identity provider"})
			return
		}
		user.Profile = &profile
	}

	c.JSON(http.StatusOK, user)
}

// SetupUser handles creating the local user record
// @Summary Setup user
// @Description Create the local record for the authenticated Cognito user. Idempotent.
// @Tags users
// @Accept json
// @Produce json
// @Security BearerAuth
// @Success 200 {object} schemas.UserSchema
// @Failure 401 {object} map[string]string
// @Router /v1/users [post]
func SetupUser(c *gin.Context) {
	userId := c.MustGet("user_id").(uuid.UUID)

	user, err := services.SetupUser(c.Request.Context(), userId)
	if err != nil {
		slog.ErrorContext(c.Request.Context(), "SetupUser failed", "user_id", userId, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create user"})
		return
	}

	c.JSON(http.StatusOK, user)
}

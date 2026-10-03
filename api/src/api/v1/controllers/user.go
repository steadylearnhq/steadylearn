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
// @Description Get the currently authenticated user with the identity provider's profile and their subscription attached. The profile is served from a cache for up to five minutes, so a change made in the user pool can take that long to show; the subscription is read fresh on every call, and is left out for a user who has never subscribed. A 404 means the user has not been set up yet.
// @Tags users
// @Accept json
// @Produce json
// @Security BearerAuth
// @Success 200 {object} schemas.UserSchema
// @Failure 401 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Failure 502 {object} map[string]string
// @Router /v1/users/me [get]
func GetCurrentUser(c *gin.Context) {
	userId := c.MustGet("user_id").(uuid.UUID)

	user, err := services.GetCurrentUser(c.Request.Context(), userId)
	if errors.Is(err, services.ErrUserNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}
	// A failure in the user pool is the provider's, not the caller's, so it is
	// reported as a 502. The client only gets a generic message; the underlying
	// AWS/Cognito error (credentials, IAM, pool id, timeout) is only logged.
	if errors.Is(err, services.ErrIdentityProvider) {
		slog.ErrorContext(c.Request.Context(), "GetCurrentUser failed at the identity provider", "user_id", userId, "error", err)
		c.JSON(http.StatusBadGateway, gin.H{"error": "Failed to fetch the user profile from the identity provider"})
		return
	}
	if err != nil {
		slog.ErrorContext(c.Request.Context(), "GetCurrentUser failed", "user_id", userId, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load user"})
		return
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

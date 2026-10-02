package controllers

import (
	"errors"
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"steadylearn-api/src/schemas"
	"steadylearn-api/src/services"
)

// publicCacheControl lets browsers and any CDN in front reuse a catalog
// response for a minute. The catalog is the same for every visitor, so the
// response is safe to share.
const publicCacheControl = "public, max-age=60"

// GetCatalog handles listing the catalog
// @Summary Get the catalog
// @Description Every published course with the domains they belong to, in display order. Public, and the same for every caller. Served from a cache for up to ten minutes.
// @Tags catalog
// @Produce json
// @Success 200 {object} schemas.CatalogSchema
// @Failure 500 {object} map[string]string
// @Router /v1/catalog [get]
func GetCatalog(c *gin.Context) {
	catalog, err := services.GetCatalog(c.Request.Context())
	if err != nil {
		slog.ErrorContext(c.Request.Context(), "GetCatalog failed", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load the catalog"})
		return
	}

	c.Header("Cache-Control", publicCacheControl)
	c.JSON(http.StatusOK, catalog)
}

// GetCourse handles retrieving one course
// @Summary Get a course
// @Description A published course with its syllabus and the copy its page shows. The token is optional: without one, a course that keeps its syllabus private lists each module's lesson count and null for its lessons; a signed-in caller gets every lesson, and their enrollment in the course when they have one. Prerequisites name only courses in the catalog. The course is served from a cache for up to ten minutes; the enrollment never is.
// @Tags catalog
// @Produce json
// @Security BearerAuth
// @Param id path string true "Course slug" example(replication-consensus)
// @Success 200 {object} schemas.CourseSchema
// @Failure 401 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /v1/courses/{id} [get]
func GetCourse(c *gin.Context) {
	slug := c.Param("id")
	// OptionalAuth sets the user id only for a caller with a valid token.
	userId, member := c.Get("user_id")

	var course schemas.CourseSchema
	var err error
	if member {
		course, err = services.GetMemberCourse(c.Request.Context(), slug, userId.(uuid.UUID))
	} else {
		course, err = services.GetCourse(c.Request.Context(), slug, false)
	}
	if errors.Is(err, services.ErrCourseNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Course not found"})
		return
	}
	if err != nil {
		slog.ErrorContext(c.Request.Context(), "GetCourse failed", "course", slug, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load the course"})
		return
	}

	// The response depends on the token, so a shared cache keys on it and
	// never hands one caller's view to another. A member's carries their
	// enrollment, so their browser asks again each time.
	c.Header("Vary", "Authorization")
	if member {
		c.Header("Cache-Control", noCacheControl)
	} else {
		c.Header("Cache-Control", publicCacheControl)
	}
	c.JSON(http.StatusOK, course)
}

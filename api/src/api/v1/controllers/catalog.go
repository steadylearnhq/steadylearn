package controllers

import (
	"errors"
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"

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
// @Description A published course with its syllabus, as a visitor who is not signed in sees it: a course that keeps its syllabus private lists each module's lesson count, and null for its lessons. Served from a cache for up to ten minutes.
// @Tags catalog
// @Produce json
// @Param id path string true "Course slug" example(replication-consensus)
// @Success 200 {object} schemas.CourseSchema
// @Failure 404 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /v1/courses/{id} [get]
func GetCourse(c *gin.Context) {
	slug := c.Param("id")

	course, err := services.GetCourse(c.Request.Context(), slug)
	if errors.Is(err, services.ErrCourseNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Course not found"})
		return
	}
	if err != nil {
		slog.ErrorContext(c.Request.Context(), "GetCourse failed", "course", slug, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load the course"})
		return
	}

	c.Header("Cache-Control", publicCacheControl)
	c.JSON(http.StatusOK, course)
}

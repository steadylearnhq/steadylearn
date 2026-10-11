package controllers

import (
	"errors"
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"steadylearn-api/src/services"
)

// GetLesson handles retrieving one lesson's page
// @Summary Get a lesson
// @Description A lesson of a course the caller is taking, as its page shows it: its stages in order, the lessons either side of it in the syllabus, and whether the caller has completed it. A 402 means the course is not free and the caller has no subscription that gives access, a 409 that they are not enrolled in it. The lesson is served from a cache for up to ten minutes; whether it is done never is.
// @Tags lessons
// @Produce json
// @Security BearerAuth
// @Param id path string true "Course slug" example(replication-consensus)
// @Param code path string true "Lesson code, as the syllabus numbers it" example(2.3)
// @Success 200 {object} schemas.LessonPageSchema
// @Failure 401 {object} map[string]string
// @Failure 402 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Failure 409 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /v1/courses/{id}/lessons/{code} [get]
func GetLesson(c *gin.Context) {
	userId := c.MustGet("user_id").(uuid.UUID)
	slug := c.Param("id")
	code := c.Param("code")

	lesson, err := services.GetLesson(c.Request.Context(), userId, slug, code)
	switch {
	case errors.Is(err, services.ErrCourseNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "Course not found"})
	case errors.Is(err, services.ErrLessonNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "Lesson not found"})
	case errors.Is(err, services.ErrSubscriptionRequired):
		c.JSON(http.StatusPaymentRequired, gin.H{"error": "Subscription required"})
	case errors.Is(err, services.ErrNotEnrolled):
		c.JSON(http.StatusConflict, gin.H{"error": "Not enrolled in the course"})
	case err != nil:
		slog.ErrorContext(c.Request.Context(), "GetLesson failed", "user_id", userId, "course", slug, "lesson", code, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load the lesson"})
	default:
		c.JSON(http.StatusOK, lesson)
	}
}

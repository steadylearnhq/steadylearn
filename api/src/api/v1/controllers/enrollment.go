package controllers

import (
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"steadylearn-api/src/schemas"
	"steadylearn-api/src/services"
)

// Enroll handles enrolling the caller in a course
// @Summary Enroll in a course
// @Description Enroll the caller in a course in the catalog, and return the enrollment with the lessons they have completed. Idempotent: 201 when the caller was not enrolled, 200 when they already were. A course that is not free needs a subscription that gives access; a 402 means the caller has none.
// @Tags enrollments
// @Produce json
// @Security BearerAuth
// @Param id path string true "Course slug" example(replication-consensus)
// @Success 200 {object} schemas.CourseEnrollmentSchema
// @Success 201 {object} schemas.CourseEnrollmentSchema
// @Failure 401 {object} map[string]string
// @Failure 402 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /v1/courses/{id}/enrollment [put]
func Enroll(c *gin.Context) {
	userId := c.MustGet("user_id").(uuid.UUID)
	slug := c.Param("id")

	enrollment, created, err := services.Enroll(c.Request.Context(), userId, slug)
	if errors.Is(err, services.ErrCourseNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Course not found"})
		return
	}
	if errors.Is(err, services.ErrSubscriptionRequired) {
		c.JSON(http.StatusPaymentRequired, gin.H{"error": "Subscription required"})
		return
	}
	if err != nil {
		slog.ErrorContext(c.Request.Context(), "Enroll failed", "user_id", userId, "course", slug, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to enroll"})
		return
	}

	status := http.StatusOK
	if created {
		status = http.StatusCreated
	}
	c.JSON(status, enrollment)
}

// Unenroll handles taking the caller out of a course
// @Summary Unenroll from a course
// @Description Take the caller out of a course in the catalog. Idempotent. Enrolling again starts with no lessons completed.
// @Tags enrollments
// @Security BearerAuth
// @Param id path string true "Course slug" example(replication-consensus)
// @Success 204
// @Failure 401 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /v1/courses/{id}/enrollment [delete]
func Unenroll(c *gin.Context) {
	userId := c.MustGet("user_id").(uuid.UUID)
	slug := c.Param("id")

	err := services.Unenroll(c.Request.Context(), userId, slug)
	switch {
	case errors.Is(err, services.ErrCourseNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "Course not found"})
	case err != nil:
		slog.ErrorContext(c.Request.Context(), "Unenroll failed", "user_id", userId, "course", slug, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to unenroll"})
	default:
		c.Status(http.StatusNoContent)
	}
}

// CompleteLesson handles marking a lesson done
// @Summary Complete a lesson
// @Description Mark a lesson of a course the caller is enrolled in as done, and return the enrollment with its progress. Idempotent. A 409 means the caller is not enrolled in the course, a 402 that it is not free and the caller has no subscription that gives access.
// @Tags enrollments
// @Produce json
// @Security BearerAuth
// @Param id path string true "Course slug" example(replication-consensus)
// @Param code path string true "Lesson code, as the syllabus numbers it" example(2.4)
// @Success 200 {object} schemas.CourseEnrollmentSchema
// @Failure 401 {object} map[string]string
// @Failure 402 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Failure 409 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /v1/courses/{id}/lessons/{code}/completion [put]
func CompleteLesson(c *gin.Context) {
	userId := c.MustGet("user_id").(uuid.UUID)
	slug := c.Param("id")
	code := c.Param("code")

	enrollment, err := services.CompleteLesson(c.Request.Context(), userId, slug, code)
	respondLessonChange(c, "CompleteLesson", enrollment, err)
}

// UncompleteLesson handles marking a lesson not done
// @Summary Uncomplete a lesson
// @Description Mark a lesson of a course the caller is enrolled in as not done, and return the enrollment with its progress. Idempotent. A 409 means the caller is not enrolled in the course, a 402 that it is not free and the caller has no subscription that gives access.
// @Tags enrollments
// @Produce json
// @Security BearerAuth
// @Param id path string true "Course slug" example(replication-consensus)
// @Param code path string true "Lesson code, as the syllabus numbers it" example(2.4)
// @Success 200 {object} schemas.CourseEnrollmentSchema
// @Failure 401 {object} map[string]string
// @Failure 402 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Failure 409 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /v1/courses/{id}/lessons/{code}/completion [delete]
func UncompleteLesson(c *gin.Context) {
	userId := c.MustGet("user_id").(uuid.UUID)
	slug := c.Param("id")
	code := c.Param("code")

	enrollment, err := services.UncompleteLesson(c.Request.Context(), userId, slug, code)
	respondLessonChange(c, "UncompleteLesson", enrollment, err)
}

// SetFeedback handles the caller's feedback on a course
// @Summary Leave feedback on a course
// @Description Set the caller's feedback on a course they are enrolled in, a rating from 1 to 5 and an optional message of up to 2,000 characters, replacing any they left before. Returns the enrollment with it. A 409 means the caller is not enrolled in the course, a 402 that it is not free and the caller has no subscription that gives access.
// @Tags enrollments
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path string true "Course slug" example(replication-consensus)
// @Param feedback body schemas.FeedbackRequest true "Rating and message"
// @Success 200 {object} schemas.CourseEnrollmentSchema
// @Failure 400 {object} map[string]string
// @Failure 401 {object} map[string]string
// @Failure 402 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Failure 409 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /v1/courses/{id}/feedback [put]
func SetFeedback(c *gin.Context) {
	userId := c.MustGet("user_id").(uuid.UUID)
	slug := c.Param("id")

	var request schemas.FeedbackRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "A rating from 1 to 5 is required, and a message of up to 2,000 characters"})
		return
	}

	enrollment, err := services.SetFeedback(c.Request.Context(), userId, slug, request.Rating, strings.TrimSpace(request.Message))
	switch {
	case errors.Is(err, services.ErrCourseNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "Course not found"})
	case errors.Is(err, services.ErrNotEnrolled):
		c.JSON(http.StatusConflict, gin.H{"error": "Not enrolled in the course"})
	case errors.Is(err, services.ErrSubscriptionRequired):
		c.JSON(http.StatusPaymentRequired, gin.H{"error": "Subscription required"})
	case err != nil:
		slog.ErrorContext(c.Request.Context(), "SetFeedback failed", "user_id", userId, "course", slug, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save the feedback"})
	default:
		c.JSON(http.StatusOK, enrollment)
	}
}

// respondLessonChange writes the response to marking a lesson done or not.
func respondLessonChange(c *gin.Context, op string, enrollment schemas.CourseEnrollmentSchema, err error) {
	switch {
	case errors.Is(err, services.ErrCourseNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "Course not found"})
	case errors.Is(err, services.ErrLessonNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "Lesson not found"})
	case errors.Is(err, services.ErrNotEnrolled):
		c.JSON(http.StatusConflict, gin.H{"error": "Not enrolled in the course"})
	case errors.Is(err, services.ErrSubscriptionRequired):
		c.JSON(http.StatusPaymentRequired, gin.H{"error": "Subscription required"})
	case err != nil:
		slog.ErrorContext(c.Request.Context(), op+" failed", "user_id", c.MustGet("user_id"),
			"course", c.Param("id"), "lesson", c.Param("code"), "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update the lesson"})
	default:
		c.JSON(http.StatusOK, enrollment)
	}
}

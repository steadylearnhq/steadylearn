package controllers

import (
	"errors"
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"steadylearn-api/src/services"
)

// noCacheControl keeps a learner's enrollments to their own browser, and has
// it ask again each time: they change with every lesson completed.
const noCacheControl = "private, no-cache"

// GetEnrollments handles listing the caller's enrollments
// @Summary List my enrollments
// @Description Every course in the catalog the caller is enrolled in, most recently enrolled first, with how many of its lessons they have completed. Progress is that count as a percentage of the course's lessons, rounded down.
// @Tags enrollments
// @Produce json
// @Security BearerAuth
// @Success 200 {array} schemas.EnrollmentSchema
// @Failure 401 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /v1/enrollments [get]
func GetEnrollments(c *gin.Context) {
	userId := c.MustGet("user_id").(uuid.UUID)

	enrollments, err := services.GetEnrollments(c.Request.Context(), userId)
	if err != nil {
		slog.ErrorContext(c.Request.Context(), "GetEnrollments failed", "user_id", userId, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load enrollments"})
		return
	}

	c.Header("Cache-Control", noCacheControl)
	c.JSON(http.StatusOK, enrollments)
}

// Enroll handles enrolling the caller in a course
// @Summary Enroll in a course
// @Description Enroll the caller in a course in the catalog. Idempotent: 201 when the caller was not enrolled, 200 when they already were.
// @Tags enrollments
// @Produce json
// @Security BearerAuth
// @Param id path string true "Course slug" example(replication-consensus)
// @Success 200 {object} schemas.EnrollmentSchema
// @Success 201 {object} schemas.EnrollmentSchema
// @Failure 401 {object} map[string]string
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

// CompleteLesson handles marking a lesson done
// @Summary Complete a lesson
// @Description Mark a lesson of a course the caller is enrolled in as done, and return the enrollment with its progress. Idempotent. A 409 means the caller is not enrolled in the course.
// @Tags enrollments
// @Produce json
// @Security BearerAuth
// @Param id path string true "Course slug" example(replication-consensus)
// @Param code path string true "Lesson code, as the syllabus numbers it" example(2.4)
// @Success 200 {object} schemas.EnrollmentSchema
// @Failure 401 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Failure 409 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /v1/courses/{id}/lessons/{code}/completion [put]
func CompleteLesson(c *gin.Context) {
	userId := c.MustGet("user_id").(uuid.UUID)
	slug := c.Param("id")
	code := c.Param("code")

	enrollment, err := services.CompleteLesson(c.Request.Context(), userId, slug, code)
	switch {
	case errors.Is(err, services.ErrCourseNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "Course not found"})
	case errors.Is(err, services.ErrLessonNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "Lesson not found"})
	case errors.Is(err, services.ErrNotEnrolled):
		c.JSON(http.StatusConflict, gin.H{"error": "Not enrolled in the course"})
	case err != nil:
		slog.ErrorContext(c.Request.Context(), "CompleteLesson failed", "user_id", userId, "course", slug, "lesson", code, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to complete the lesson"})
	default:
		c.JSON(http.StatusOK, enrollment)
	}
}

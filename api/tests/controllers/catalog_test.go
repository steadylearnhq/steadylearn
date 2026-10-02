package controllers_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"steadylearn-api/src/api/v1/controllers"
	"steadylearn-api/src/schemas"
	"steadylearn-api/src/services"
	"steadylearn-api/tests/testutil"
)

// getCourse serves GET /courses/:id, with the user id set as OptionalAuth sets
// it unless it is uuid.Nil, for a visitor, and decodes the course.
func getCourse(t *testing.T, slug string, userId uuid.UUID) (*httptest.ResponseRecorder, schemas.CourseSchema) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/courses/:id", func(c *gin.Context) {
		if userId != uuid.Nil {
			c.Set("user_id", userId)
		}
	}, controllers.GetCourse)

	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/courses/"+slug, nil))
	require.Equal(t, http.StatusOK, rec.Code)

	var course schemas.CourseSchema
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &course))
	return rec, course
}

// getCatalog serves GET /catalog as getCourse serves a course.
func getCatalog(t *testing.T, userId uuid.UUID) (*httptest.ResponseRecorder, schemas.CatalogSchema) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/catalog", func(c *gin.Context) {
		if userId != uuid.Nil {
			c.Set("user_id", userId)
		}
	}, controllers.GetCatalog)

	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/catalog", nil))
	require.Equal(t, http.StatusOK, rec.Code)

	var catalog schemas.CatalogSchema
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &catalog))
	return rec, catalog
}

func TestGetCatalogServesAMemberTheirEnrollments(t *testing.T) {
	testutil.UseDB(t)
	testutil.UseCache(t)
	userId := uuid.New()
	_, _, err := services.Enroll(context.Background(), userId, "storage-engines")
	require.NoError(t, err)

	rec, visitor := getCatalog(t, uuid.Nil)
	assert.Equal(t, "public, max-age=60", rec.Header().Get("Cache-Control"))
	assert.NotEmpty(t, visitor.Courses)
	assert.Nil(t, visitor.Enrollments)

	rec, member := getCatalog(t, userId)
	assert.Equal(t, "private, no-cache", rec.Header().Get("Cache-Control"))
	assert.Equal(t, visitor.Courses, member.Courses)
	require.Len(t, member.Enrollments, 1)
	assert.Equal(t, "storage-engines", member.Enrollments[0].CourseId)

	_, other := getCatalog(t, uuid.New())
	assert.Nil(t, other.Enrollments, "another member doesn't get them")
}

func TestGetCourseServesAMemberTheFullSyllabus(t *testing.T) {
	testutil.UseDB(t)
	testutil.UseCache(t)
	// storage-engines is seeded with a syllabus private to visitors.
	const slug = "storage-engines"

	rec, visitor := getCourse(t, slug, uuid.Nil)
	assert.Equal(t, "public, max-age=60", rec.Header().Get("Cache-Control"))
	require.NotEmpty(t, visitor.Modules)
	assert.Nil(t, visitor.Modules[0].Lessons)
	assert.Nil(t, visitor.Enrollment)

	rec, member := getCourse(t, slug, uuid.New())
	assert.Equal(t, "private, no-cache", rec.Header().Get("Cache-Control"))
	require.NotEmpty(t, member.Modules)
	assert.NotEmpty(t, member.Modules[0].Lessons, "a signed-in caller sees every lesson")
	assert.Nil(t, member.Enrollment, "and no enrollment until they enroll")
}

func TestGetCourseServesAMemberTheirEnrollment(t *testing.T) {
	testutil.UseDB(t)
	testutil.UseCache(t)
	const slug = "storage-engines"
	userId := uuid.New()
	_, _, err := services.Enroll(context.Background(), userId, slug)
	require.NoError(t, err)
	_, err = services.CompleteLesson(context.Background(), userId, slug, "1.1")
	require.NoError(t, err)

	_, course := getCourse(t, slug, userId)
	require.NotNil(t, course.Enrollment)
	assert.Equal(t, slug, course.Enrollment.CourseId)
	assert.Equal(t, []string{"1.1"}, course.Enrollment.CompletedLessons)

	_, other := getCourse(t, slug, uuid.New())
	assert.Nil(t, other.Enrollment, "another member doesn't get it")
}

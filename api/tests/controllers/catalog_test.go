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
	"steadylearn-api/tests/testutil"
)

// getCourse serves GET /courses/:id, with the user id set as RequireAuth sets
// it when signedIn, and decodes the course.
func getCourse(t *testing.T, slug string, signedIn bool) (*httptest.ResponseRecorder, schemas.CourseSchema) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/courses/:id", func(c *gin.Context) {
		if signedIn {
			c.Set("user_id", uuid.New())
		}
	}, controllers.GetCourse)

	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/courses/"+slug, nil))
	require.Equal(t, http.StatusOK, rec.Code)

	var course schemas.CourseSchema
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &course))
	return rec, course
}

func TestGetCourseServesAMemberTheFullSyllabus(t *testing.T) {
	testutil.UseDB(t)
	testutil.UseCache(t)
	// storage-engines is seeded with a syllabus private to visitors.
	const slug = "storage-engines"

	rec, visitor := getCourse(t, slug, false)
	assert.Equal(t, "public, max-age=60", rec.Header().Get("Cache-Control"))
	require.NotEmpty(t, visitor.Modules)
	assert.Nil(t, visitor.Modules[0].Lessons)

	rec, member := getCourse(t, slug, true)
	assert.Equal(t, "private, max-age=60", rec.Header().Get("Cache-Control"))
	require.NotEmpty(t, member.Modules)
	assert.NotEmpty(t, member.Modules[0].Lessons, "a signed-in caller sees every lesson")
}

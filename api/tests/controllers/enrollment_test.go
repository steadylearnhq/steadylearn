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

// enrollmentRouter serves the enrollment routes for one signed-in caller, with
// the user id set as RequireAuth sets it.
func enrollmentRouter(userId uuid.UUID) *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(func(c *gin.Context) { c.Set("user_id", userId) })
	router.GET("/courses/:id/enrollment", controllers.GetEnrollment)
	router.PUT("/courses/:id/enrollment", controllers.Enroll)
	router.DELETE("/courses/:id/enrollment", controllers.Unenroll)
	router.PUT("/courses/:id/lessons/:code/completion", controllers.CompleteLesson)
	router.DELETE("/courses/:id/lessons/:code/completion", controllers.UncompleteLesson)
	return router
}

func TestEnrollmentRoutes(t *testing.T) {
	testutil.UseDB(t)
	router := enrollmentRouter(uuid.New())
	// storage-engines is seeded with a syllabus.
	const course = "/courses/storage-engines"

	steps := []struct {
		name      string
		method    string
		path      string
		status    int
		completed []string // checked when the step returns an enrollment
	}{
		{"read before enrolling", http.MethodGet, course + "/enrollment", http.StatusNotFound, nil},
		{"complete before enrolling", http.MethodPut, course + "/lessons/1.1/completion", http.StatusConflict, nil},
		{"enroll", http.MethodPut, course + "/enrollment", http.StatusCreated, []string{}},
		{"enroll again", http.MethodPut, course + "/enrollment", http.StatusOK, []string{}},
		{"complete", http.MethodPut, course + "/lessons/1.1/completion", http.StatusOK, []string{"1.1"}},
		{"complete an unknown lesson", http.MethodPut, course + "/lessons/99.1/completion", http.StatusNotFound, nil},
		{"read", http.MethodGet, course + "/enrollment", http.StatusOK, []string{"1.1"}},
		{"uncomplete", http.MethodDelete, course + "/lessons/1.1/completion", http.StatusOK, []string{}},
		{"unenroll", http.MethodDelete, course + "/enrollment", http.StatusNoContent, nil},
		{"unenroll again", http.MethodDelete, course + "/enrollment", http.StatusNoContent, nil},
		{"read after unenrolling", http.MethodGet, course + "/enrollment", http.StatusNotFound, nil},
		{"uncomplete after unenrolling", http.MethodDelete, course + "/lessons/1.1/completion", http.StatusConflict, nil},
		{"read an unknown course", http.MethodGet, "/courses/missing/enrollment", http.StatusNotFound, nil},
		{"unenroll from an unknown course", http.MethodDelete, "/courses/missing/enrollment", http.StatusNotFound, nil},
	}
	for _, step := range steps {
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, httptest.NewRequestWithContext(context.Background(), step.method, step.path, nil))
		require.Equal(t, step.status, rec.Code, step.name)

		if step.completed != nil {
			var enrollment schemas.CourseEnrollmentSchema
			require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &enrollment), step.name)
			assert.Equal(t, "storage-engines", enrollment.CourseId, step.name)
			assert.Equal(t, step.completed, enrollment.CompletedLessons, step.name)
		}
		if step.method == http.MethodGet && step.status == http.StatusOK {
			assert.Equal(t, "private, no-cache", rec.Header().Get("Cache-Control"), step.name)
		}
	}
}

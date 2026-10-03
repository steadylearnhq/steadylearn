package controllers_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"steadylearn-api/src/api/v1/controllers"
	"steadylearn-api/src/core"
	"steadylearn-api/src/schemas"
	"steadylearn-api/tests/testutil"
)

// enrollmentRouter serves the enrollment routes for one signed-in caller, with
// the user id set as RequireAuth sets it.
func enrollmentRouter(userId uuid.UUID) *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(func(c *gin.Context) { c.Set("user_id", userId) })
	router.PUT("/courses/:id/enrollment", controllers.Enroll)
	router.DELETE("/courses/:id/enrollment", controllers.Unenroll)
	router.PUT("/courses/:id/lessons/:code/completion", controllers.CompleteLesson)
	router.DELETE("/courses/:id/lessons/:code/completion", controllers.UncompleteLesson)
	router.PUT("/courses/:id/feedback", controllers.SetFeedback)
	return router
}

func TestEnrollmentRoutes(t *testing.T) {
	testutil.UseDB(t)
	userId := uuid.New()
	testutil.Subscribe(t, userId)
	router := enrollmentRouter(userId)
	// storage-engines is seeded with a syllabus.
	const course = "/courses/storage-engines"

	steps := []struct {
		name      string
		method    string
		path      string
		status    int
		completed []string // checked when the step returns an enrollment
	}{
		{"complete before enrolling", http.MethodPut, course + "/lessons/1.1/completion", http.StatusConflict, nil},
		{"enroll", http.MethodPut, course + "/enrollment", http.StatusCreated, []string{}},
		{"enroll again", http.MethodPut, course + "/enrollment", http.StatusOK, []string{}},
		{"complete", http.MethodPut, course + "/lessons/1.1/completion", http.StatusOK, []string{"1.1"}},
		{"complete an unknown lesson", http.MethodPut, course + "/lessons/99.1/completion", http.StatusNotFound, nil},
		{"uncomplete", http.MethodDelete, course + "/lessons/1.1/completion", http.StatusOK, []string{}},
		{"unenroll", http.MethodDelete, course + "/enrollment", http.StatusNoContent, nil},
		{"unenroll again", http.MethodDelete, course + "/enrollment", http.StatusNoContent, nil},
		{"uncomplete after unenrolling", http.MethodDelete, course + "/lessons/1.1/completion", http.StatusConflict, nil},
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
	}
}

func TestEnrollmentRoutesNeedASubscription(t *testing.T) {
	testutil.UseDB(t)
	userId := uuid.New()
	router := enrollmentRouter(userId)
	serve := func(method, path, body string) int {
		rec := httptest.NewRecorder()
		req := httptest.NewRequestWithContext(context.Background(), method, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		router.ServeHTTP(rec, req)
		return rec.Code
	}

	// estimation is the seeded free course; storage-engines is not free.
	assert.Equal(t, http.StatusCreated, serve(http.MethodPut, "/courses/estimation/enrollment", ""), "a free course")
	assert.Equal(t, http.StatusPaymentRequired, serve(http.MethodPut, "/courses/storage-engines/enrollment", ""),
		"a course that is not free")

	// A member whose subscription ended keeps the enrollment but cannot change it.
	testutil.Subscribe(t, userId)
	require.Equal(t, http.StatusCreated, serve(http.MethodPut, "/courses/storage-engines/enrollment", ""))
	require.NoError(t, core.DB.Exec(`UPDATE subscriptions SET status = 'canceled' WHERE user_id = ?`, userId).Error)

	const course = "/courses/storage-engines"
	assert.Equal(t, http.StatusPaymentRequired, serve(http.MethodPut, course+"/lessons/1.1/completion", ""), "complete")
	assert.Equal(t, http.StatusPaymentRequired, serve(http.MethodDelete, course+"/lessons/1.1/completion", ""), "uncomplete")
	assert.Equal(t, http.StatusPaymentRequired, serve(http.MethodPut, course+"/feedback", `{"rating":4}`), "feedback")
	assert.Equal(t, http.StatusNoContent, serve(http.MethodDelete, course+"/enrollment", ""), "unenrolling still works")
}

func TestSetFeedbackRoute(t *testing.T) {
	testutil.UseDB(t)
	userId := uuid.New()
	testutil.Subscribe(t, userId)
	router := enrollmentRouter(userId)
	const course = "/courses/storage-engines"
	put := func(path, body string) *httptest.ResponseRecorder {
		rec := httptest.NewRecorder()
		req := httptest.NewRequestWithContext(context.Background(), http.MethodPut, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		router.ServeHTTP(rec, req)
		return rec
	}

	assert.Equal(t, http.StatusConflict, put(course+"/feedback", `{"rating":4}`).Code, "not enrolled")
	require.Equal(t, http.StatusCreated, put(course+"/enrollment", "").Code)

	for name, body := range map[string]string{
		"no rating":    `{"message":"Hi"}`,
		"rating 0":     `{"rating":0}`,
		"rating 6":     `{"rating":6}`,
		"long message": `{"rating":4,"message":"` + strings.Repeat("a", 2001) + `"}`,
		"not json":     `rating=4`,
	} {
		assert.Equal(t, http.StatusBadRequest, put(course+"/feedback", body).Code, name)
	}

	rec := put(course+"/feedback", `{"rating":5,"message":"  Clear and hands-on.  "}`)
	require.Equal(t, http.StatusOK, rec.Code)
	var enrollment schemas.CourseEnrollmentSchema
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &enrollment))
	assert.Equal(t, &schemas.FeedbackSchema{Rating: 5, Message: "Clear and hands-on."}, enrollment.Feedback)

	assert.Equal(t, http.StatusNotFound, put("/courses/missing/feedback", `{"rating":4}`).Code)
}

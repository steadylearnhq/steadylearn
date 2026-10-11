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
	"steadylearn-api/src/middleware"
	"steadylearn-api/src/services"
	"steadylearn-api/tests/testutil"
)

// getLesson serves GET /courses/:id/lessons/:code to a signed-in caller, with
// the user id set as RequireAuth sets it and the default Cache-Control.
func getLesson(userId uuid.UUID, path string) *httptest.ResponseRecorder {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(middleware.NoStore(), func(c *gin.Context) { c.Set("user_id", userId) })
	router.GET("/courses/:id/lessons/:code", controllers.GetLesson)

	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, httptest.NewRequestWithContext(context.Background(), http.MethodGet, path, nil))
	return rec
}

func TestGetLessonRoute(t *testing.T) {
	testutil.UseDB(t)
	testutil.UseCache(t)
	userId := uuid.New()
	testutil.Subscribe(t, userId)
	// storage-engines is seeded with a syllabus and is not free.
	const course = "/courses/storage-engines"

	assert.Equal(t, http.StatusConflict, getLesson(userId, course+"/lessons/1.1").Code, "not enrolled")
	_, _, err := services.Enroll(context.Background(), userId, "storage-engines")
	require.NoError(t, err)
	_, err = services.CompleteLesson(context.Background(), userId, "storage-engines", "1.2")
	require.NoError(t, err)

	rec := getLesson(userId, course+"/lessons/1.2")
	require.Equal(t, http.StatusOK, rec.Code)
	assert.Equal(t, "no-store", rec.Header().Get("Cache-Control"), "a member's own response is never stored")

	var lesson struct {
		Course  map[string]string
		Code    string
		Title   string
		Minutes int
		Stages  []struct {
			Kind    string
			Steps   []string
			Content map[string]any
		}
		Prev *struct{ Code, Title string }
		Next *struct{ Code, Title string }
		Done bool
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &lesson))
	assert.Equal(t, "storage-engines", lesson.Course["id"])
	assert.NotEmpty(t, lesson.Course["title"])
	assert.Equal(t, "1.2", lesson.Code)
	assert.NotEmpty(t, lesson.Title)
	assert.Positive(t, lesson.Minutes)
	require.NotEmpty(t, lesson.Stages)
	for _, stage := range lesson.Stages {
		assert.NotEmpty(t, stage.Kind)
		assert.NotNil(t, stage.Steps, "steps are a list, never null")
		assert.NotNil(t, stage.Content, "content is a JSON object")
	}
	require.NotNil(t, lesson.Prev)
	assert.Equal(t, "1.1", lesson.Prev.Code)
	assert.NotNil(t, lesson.Next)
	assert.True(t, lesson.Done)

	var first map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(getLesson(userId, course+"/lessons/1.1").Body.Bytes(), &first))
	assert.JSONEq(t, `null`, string(first["prev"]), "the first lesson has no prev, sent as null")
	assert.JSONEq(t, `false`, string(first["done"]))

	assert.Equal(t, http.StatusNotFound, getLesson(userId, course+"/lessons/99.1").Code, "an unknown lesson")
	assert.Equal(t, http.StatusNotFound, getLesson(userId, "/courses/missing/lessons/1.1").Code, "an unknown course")
	assert.Equal(t, http.StatusPaymentRequired, getLesson(uuid.New(), course+"/lessons/1.1").Code,
		"a course that is not free, to a caller without a subscription")
}

package services_test

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"steadylearn-api/src/core"
	"steadylearn-api/src/models"
	"steadylearn-api/src/schemas"
	"steadylearn-api/src/services"
	"steadylearn-api/tests/testutil"
)

// addStagedCourse adds a published course of three lessons, 1.1, 1.2 and 2.1,
// as addLessonsCourse does, with stages on the first. Its stages are stored
// out of order and with gaps in their positions, and one of them is deleted.
func addStagedCourse(t *testing.T, domain models.Domain, slug string, free bool) models.Course {
	t.Helper()
	course := addCourse(t, domain, models.Course{
		Slug:        slug,
		IsFree:      free,
		PublishedAt: ago(time.Hour),
		Modules: []models.CourseModule{
			{Position: 1, Title: "One", Lessons: []models.Lesson{
				{Position: 1, Title: "First", Minutes: 15, Stages: []models.LessonStage{
					{Position: 40, Kind: models.StageReview},
					{Position: 10, Kind: models.StageLearn, Steps: models.StepList{models.StepWatch, models.StepRead}},
					{Position: 30, Kind: models.StageLearn, Steps: models.StepList{models.StepRead}, Content: `{"title": "Again"}`},
					{Position: 25, Kind: models.StageQuestions, Steps: models.StepList{models.StepBet}},
					{Position: 20, Kind: models.StageInteractive, Steps: models.StepList{models.StepTrace}, Content: `{"title": "Lab", "component": "placeholder"}`},
				}},
				{Position: 2, Title: "Removed"},
				{Position: 3, Title: "Second"},
			}},
			{Position: 2, Title: "Two", Lessons: []models.Lesson{{Position: 1, Title: "Third"}}},
		},
	})
	require.NoError(t, core.DB.Exec(`UPDATE lessons SET deleted_at = now() WHERE title = 'Removed'`).Error)
	require.NoError(t, core.DB.Exec(`UPDATE lesson_stages SET deleted_at = now() WHERE kind = 'questions'`).Error)
	return course
}

// enrolledIn enrolls a new member in the course and returns their id. A
// course that is not free needs them subscribed first.
func enrolledIn(t *testing.T, slug string) uuid.UUID {
	t.Helper()
	userId := uuid.New()
	_, _, err := services.Enroll(context.Background(), userId, slug)
	require.NoError(t, err)
	return userId
}

func TestGetLesson(t *testing.T) {
	useEmptyCatalog(t)
	testutil.UseCache(t)
	addStagedCourse(t, addDomain(t, "dist", 1), "course", true)
	userId := enrolledIn(t, "course")

	lesson, err := services.GetLesson(context.Background(), userId, "course", "1.1")
	require.NoError(t, err)

	assert.Equal(t, schemas.LessonCourseSchema{Id: "course", Title: "Course course"}, lesson.Course)
	assert.Equal(t, "1.1", lesson.Code)
	assert.Equal(t, "First", lesson.Title)
	assert.Equal(t, 15, lesson.Minutes)
	assert.False(t, lesson.Done)

	require.Len(t, lesson.Stages, 4, "the deleted stage is left out")
	kinds := make([]string, len(lesson.Stages))
	for i, stage := range lesson.Stages {
		kinds[i] = stage.Kind
	}
	assert.Equal(t, []string{models.StageLearn, models.StageInteractive, models.StageLearn, models.StageReview}, kinds,
		"in position order, and a kind can repeat")
	assert.Equal(t, []string{models.StepWatch, models.StepRead}, lesson.Stages[0].Steps)
	assert.Equal(t, []string{}, lesson.Stages[3].Steps, "an empty list, not null")
	assert.JSONEq(t, `{}`, string(lesson.Stages[0].Content))
	assert.JSONEq(t, `{"title": "Lab", "component": "placeholder"}`, string(lesson.Stages[1].Content), "content is passed through")

	bare, err := services.GetLesson(context.Background(), userId, "course", "2.1")
	require.NoError(t, err)
	assert.Equal(t, []schemas.StageSchema{}, bare.Stages, "a lesson without stages has an empty list, not null")
}

func TestGetLessonNeighbours(t *testing.T) {
	useEmptyCatalog(t)
	testutil.UseCache(t)
	addStagedCourse(t, addDomain(t, "dist", 1), "course", true)
	userId := enrolledIn(t, "course")

	cases := []struct {
		name string
		code string
		prev *schemas.LessonLinkSchema
		next *schemas.LessonLinkSchema
	}{
		{"the start of the course", "1.1", nil, &schemas.LessonLinkSchema{Code: "1.2", Title: "Second"}},
		{"the end of a module", "1.2", &schemas.LessonLinkSchema{Code: "1.1", Title: "First"}, &schemas.LessonLinkSchema{Code: "2.1", Title: "Third"}},
		{"the end of the course", "2.1", &schemas.LessonLinkSchema{Code: "1.2", Title: "Second"}, nil},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			lesson, err := services.GetLesson(context.Background(), userId, "course", c.code)
			require.NoError(t, err)
			assert.Equal(t, c.prev, lesson.Prev, "prev")
			assert.Equal(t, c.next, lesson.Next, "next")
		})
	}
}

func TestGetLessonDone(t *testing.T) {
	useEmptyCatalog(t)
	testutil.UseCache(t)
	ctx := context.Background()
	addStagedCourse(t, addDomain(t, "dist", 1), "course", true)
	userId := enrolledIn(t, "course")
	other := enrolledIn(t, "course")

	lesson, err := services.GetLesson(ctx, userId, "course", "1.2")
	require.NoError(t, err)
	assert.False(t, lesson.Done)

	// The lesson is cached by now, but whether it is done is not.
	_, err = services.CompleteLesson(ctx, userId, "course", "1.2")
	require.NoError(t, err)
	lesson, err = services.GetLesson(ctx, userId, "course", "1.2")
	require.NoError(t, err)
	assert.True(t, lesson.Done, "done after completing it")

	lesson, err = services.GetLesson(ctx, other, "course", "1.2")
	require.NoError(t, err)
	assert.False(t, lesson.Done, "another member has not done it")

	_, err = services.UncompleteLesson(ctx, userId, "course", "1.2")
	require.NoError(t, err)
	lesson, err = services.GetLesson(ctx, userId, "course", "1.2")
	require.NoError(t, err)
	assert.False(t, lesson.Done, "not done after uncompleting it")
}

func TestGetLessonRejects(t *testing.T) {
	useEmptyCatalog(t)
	cache := testutil.UseCache(t)
	ctx := context.Background()
	dist := addDomain(t, "dist", 1)
	addStagedCourse(t, dist, "course", true)
	addStagedCourse(t, dist, "other", true)
	addStagedCourse(t, dist, "paid", false)
	addCourse(t, dist, models.Course{Slug: "draft", Modules: []models.CourseModule{{Position: 1, Title: "One", Lessons: lessons(1)}}})

	member := enrolledIn(t, "course")
	subscriber := uuid.New()
	testutil.Subscribe(t, subscriber)
	lapsed := uuid.New()
	testutil.Subscribe(t, lapsed)
	_, _, err := services.Enroll(ctx, lapsed, "paid")
	require.NoError(t, err)
	require.NoError(t, core.DB.Exec(`UPDATE subscriptions SET status = 'canceled' WHERE user_id = ?`, lapsed).Error)

	cases := []struct {
		name   string
		userId uuid.UUID
		course string
		code   string
		err    error
	}{
		{"an unknown course", member, "missing", "1.1", services.ErrCourseNotFound},
		{"a course not published", member, "draft", "1.1", services.ErrCourseNotFound},
		{"a lesson past the last", member, "course", "1.3", services.ErrLessonNotFound},
		{"a padded code", member, "course", "01.1", services.ErrLessonNotFound},
		{"an unknown lesson before a missing subscription", member, "paid", "9.1", services.ErrLessonNotFound},
		{"a paid course without a subscription", member, "paid", "1.1", services.ErrSubscriptionRequired},
		{"a paid course after the subscription ended", lapsed, "paid", "1.1", services.ErrSubscriptionRequired},
		{"a free course not enrolled in", member, "other", "1.1", services.ErrNotEnrolled},
		{"a paid course not enrolled in", subscriber, "paid", "1.1", services.ErrNotEnrolled},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			_, err := services.GetLesson(ctx, c.userId, c.course, c.code)
			assert.ErrorIs(t, err, c.err)
			assert.False(t, cache.Exists(services.LessonCacheKey(c.course, c.code)), "nothing is cached")
		})
	}
}

func TestGetLessonReadsThroughTheCache(t *testing.T) {
	useEmptyCatalog(t)
	cache := testutil.UseCache(t)
	ctx := context.Background()
	addStagedCourse(t, addDomain(t, "dist", 1), "course", true)
	userId := enrolledIn(t, "course")

	first, err := services.GetLesson(ctx, userId, "course", "1.1")
	require.NoError(t, err)
	assert.True(t, cache.Exists(services.LessonCacheKey("course", "1.1")))

	// With the lesson renamed and its stages gone, only the cache still has
	// them.
	require.NoError(t, core.DB.Exec(`UPDATE lessons SET title = 'Renamed' WHERE title = 'First'`).Error)
	require.NoError(t, core.DB.Exec(`UPDATE lesson_stages SET deleted_at = now()`).Error)
	second, err := services.GetLesson(ctx, userId, "course", "1.1")
	require.NoError(t, err)
	// Compared as the API sends them: the cache stores content compacted,
	// which the response is anyway.
	firstJSON, err := json.Marshal(first)
	require.NoError(t, err)
	secondJSON, err := json.Marshal(second)
	require.NoError(t, err)
	assert.JSONEq(t, string(firstJSON), string(secondJSON))

	cache.FastForward(time.Hour)
	third, err := services.GetLesson(ctx, userId, "course", "1.1")
	require.NoError(t, err)
	assert.Equal(t, "Renamed", third.Title, "an expired entry is loaded again")
	assert.Empty(t, third.Stages)

	cache.Close()
	_, err = services.GetLesson(ctx, userId, "course", "1.1")
	assert.NoError(t, err, "an unreachable cache falls back to the database")
}

// Every lesson of the launch catalog has its stages, and following next from
// a course's first lesson visits each of its lessons once, in syllabus order.
func TestSeededLessons(t *testing.T) {
	testutil.UseDB(t)
	testutil.UseCache(t)
	ctx := context.Background()
	userId := uuid.New()
	testutil.Subscribe(t, userId)

	catalog, err := services.GetCatalog(ctx)
	require.NoError(t, err)
	require.NotEmpty(t, catalog.Courses)

	for _, summary := range catalog.Courses {
		t.Run(summary.Id, func(t *testing.T) {
			_, _, err := services.Enroll(ctx, userId, summary.Id)
			require.NoError(t, err)

			visited := 0
			var prev *schemas.LessonLinkSchema
			for code := "1.1"; ; {
				lesson, err := services.GetLesson(ctx, userId, summary.Id, code)
				require.NoError(t, err, code)
				assert.Equal(t, prev, lesson.Prev, code)
				assert.NotEmpty(t, lesson.Stages, code)
				visited++
				if lesson.Next == nil {
					break
				}
				prev = &schemas.LessonLinkSchema{Code: lesson.Code, Title: lesson.Title}
				code = lesson.Next.Code
			}
			assert.Equal(t, summary.LessonCount, visited)
		})
	}
}

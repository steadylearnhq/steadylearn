package services_test

import (
	"context"
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

// addSyllabusCourse adds a published course of three lessons: 1.1, 1.2 and
// 2.1. Module one also holds a deleted lesson between its two, which the codes
// skip and progress does not count.
func addSyllabusCourse(t *testing.T, domain models.Domain, slug string) models.Course {
	t.Helper()
	course := addCourse(t, domain, models.Course{
		Slug:        slug,
		PublishedAt: ago(time.Hour),
		Modules: []models.CourseModule{
			{Position: 1, Title: "One", Lessons: []models.Lesson{
				{Position: 1, Title: "First"},
				{Position: 2, Title: "Removed"},
				{Position: 3, Title: "Second"},
			}},
			{Position: 2, Title: "Two", Lessons: []models.Lesson{{Position: 1, Title: "Third"}}},
		},
	})
	require.NoError(t, core.DB.Exec(`UPDATE lessons SET deleted_at = now() WHERE title = 'Removed'`).Error)
	return course
}

// completedTitles lists the lessons the learner has completed in the course.
func completedTitles(t *testing.T, userId uuid.UUID, slug string) []string {
	t.Helper()
	titles := []string{}
	require.NoError(t, core.DB.Raw(`
SELECT l.title
FROM lesson_completions lc
JOIN enrollments e ON e.id = lc.enrollment_id
JOIN courses c ON c.id = e.course_id
JOIN lessons l ON l.id = lc.lesson_id
WHERE e.user_id = ? AND c.slug = ?
ORDER BY l.title`, userId, slug).Scan(&titles).Error)
	return titles
}

func TestEnroll(t *testing.T) {
	useEmptyCatalog(t)
	ctx := context.Background()
	addSyllabusCourse(t, addDomain(t, "dist", 1), "course")
	// The app never sets the user up, so enrolling has to create their row.
	userId := uuid.New()

	enrollment, created, err := services.Enroll(ctx, userId, "course")
	require.NoError(t, err)
	assert.True(t, created)
	assert.Equal(t, "course", enrollment.CourseId)
	assert.Zero(t, enrollment.LessonsDone)
	assert.Zero(t, enrollment.Progress)
	assert.Equal(t, []string{}, enrollment.CompletedLessons, "an empty list, not null")
	assert.WithinDuration(t, time.Now(), enrollment.EnrolledAt, time.Minute)

	_, err = services.GetUserById(ctx, userId)
	require.NoError(t, err, "enrolling sets up the user")

	again, created, err := services.Enroll(ctx, userId, "course")
	require.NoError(t, err)
	assert.False(t, created, "enrolling again is a no-op")
	assert.Equal(t, enrollment.EnrolledAt, again.EnrolledAt)

	enrollments, err := services.GetEnrollments(ctx, userId)
	require.NoError(t, err)
	assert.Len(t, enrollments, 1)
}

func TestEnrollOutsideTheCatalog(t *testing.T) {
	useEmptyCatalog(t)
	dist := addDomain(t, "dist", 1)
	addCourse(t, dist, models.Course{Slug: "draft"})
	future := time.Now().Add(24 * time.Hour)
	addCourse(t, dist, models.Course{Slug: "scheduled", PublishedAt: &future})

	for _, slug := range []string{"draft", "scheduled", "missing"} {
		t.Run(slug, func(t *testing.T) {
			_, _, err := services.Enroll(context.Background(), uuid.New(), slug)
			assert.ErrorIs(t, err, services.ErrCourseNotFound)
		})
	}
}

func TestCompleteLesson(t *testing.T) {
	useEmptyCatalog(t)
	ctx := context.Background()
	addSyllabusCourse(t, addDomain(t, "dist", 1), "course")
	userId := uuid.New()
	_, _, err := services.Enroll(ctx, userId, "course")
	require.NoError(t, err)

	steps := []struct {
		code      string
		done      int
		progress  int
		completed []string
	}{
		{"1.2", 1, 33, []string{"1.2"}},
		{"1.2", 1, 33, []string{"1.2"}},                // completing again is a no-op
		{"2.1", 2, 66, []string{"1.2", "2.1"}},         // rounded down
		{"1.1", 3, 100, []string{"1.1", "1.2", "2.1"}}, // in syllabus order
	}
	for _, step := range steps {
		enrollment, err := services.CompleteLesson(ctx, userId, "course", step.code)
		require.NoError(t, err, step.code)
		assert.Equal(t, step.done, enrollment.LessonsDone, step.code)
		assert.Equal(t, step.progress, enrollment.Progress, step.code)
		assert.Equal(t, step.completed, enrollment.CompletedLessons, step.code)
	}

	assert.Equal(t, []string{"First", "Second", "Third"}, completedTitles(t, userId, "course"),
		"1.2 is the second lesson left in the module, not the deleted one")
}

func TestCompleteLessonRejects(t *testing.T) {
	useEmptyCatalog(t)
	ctx := context.Background()
	dist := addDomain(t, "dist", 1)
	addSyllabusCourse(t, dist, "course")
	addSyllabusCourse(t, dist, "other")
	userId := uuid.New()
	_, _, err := services.Enroll(ctx, userId, "course")
	require.NoError(t, err)

	cases := []struct {
		name   string
		course string
		code   string
		err    error
	}{
		{"an unknown course", "missing", "1.1", services.ErrCourseNotFound},
		{"a module past the last", "course", "3.1", services.ErrLessonNotFound},
		{"a lesson past the last", "course", "1.3", services.ErrLessonNotFound},
		{"module zero", "course", "0.1", services.ErrLessonNotFound},
		{"a padded code", "course", "01.1", services.ErrLessonNotFound},
		{"trailing text", "course", "1.1x", services.ErrLessonNotFound},
		{"no code", "course", "", services.ErrLessonNotFound},
		{"a course the learner is not enrolled in", "other", "1.1", services.ErrNotEnrolled},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			_, err := services.CompleteLesson(ctx, userId, c.course, c.code)
			assert.ErrorIs(t, err, c.err)
		})
	}
	assert.Empty(t, completedTitles(t, userId, "course"))
}

func TestUncompleteLesson(t *testing.T) {
	useEmptyCatalog(t)
	ctx := context.Background()
	addSyllabusCourse(t, addDomain(t, "dist", 1), "course")
	userId := uuid.New()
	_, _, err := services.Enroll(ctx, userId, "course")
	require.NoError(t, err)
	for _, code := range []string{"1.1", "2.1"} {
		_, err := services.CompleteLesson(ctx, userId, "course", code)
		require.NoError(t, err)
	}

	steps := []struct {
		name      string
		change    func(context.Context, uuid.UUID, string, string) (schemas.CourseEnrollmentSchema, error)
		code      string
		completed []string
	}{
		{"uncomplete", services.UncompleteLesson, "1.1", []string{"2.1"}},
		{"uncomplete again, a no-op", services.UncompleteLesson, "1.1", []string{"2.1"}},
		{"uncomplete a lesson not done, a no-op", services.UncompleteLesson, "1.2", []string{"2.1"}},
		{"complete it again", services.CompleteLesson, "1.1", []string{"1.1", "2.1"}},
	}
	for _, step := range steps {
		enrollment, err := step.change(ctx, userId, "course", step.code)
		require.NoError(t, err, step.name)
		assert.Equal(t, step.completed, enrollment.CompletedLessons, step.name)
		assert.Equal(t, len(step.completed), enrollment.LessonsDone, step.name)
	}
	assert.Equal(t, []string{"First", "First", "Third"}, completedTitles(t, userId, "course"),
		"the uncompleted row stays, deleted, beside the new one")
}

func TestUncompleteLessonRejects(t *testing.T) {
	useEmptyCatalog(t)
	ctx := context.Background()
	dist := addDomain(t, "dist", 1)
	addSyllabusCourse(t, dist, "course")
	addSyllabusCourse(t, dist, "other")
	userId := uuid.New()
	_, _, err := services.Enroll(ctx, userId, "course")
	require.NoError(t, err)

	cases := []struct {
		name   string
		course string
		code   string
		err    error
	}{
		{"an unknown course", "missing", "1.1", services.ErrCourseNotFound},
		{"an unknown lesson", "course", "1.3", services.ErrLessonNotFound},
		{"a course the learner is not enrolled in", "other", "1.1", services.ErrNotEnrolled},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			_, err := services.UncompleteLesson(ctx, userId, c.course, c.code)
			assert.ErrorIs(t, err, c.err)
		})
	}
}

// enrollmentIn is the learner's enrollment as their course page gets it, nil
// when they are not enrolled.
func enrollmentIn(t *testing.T, userId uuid.UUID, slug string) *schemas.CourseEnrollmentSchema {
	t.Helper()
	course, err := services.GetMemberCourse(context.Background(), slug, userId)
	require.NoError(t, err)
	return course.Enrollment
}

func TestCourseEnrollment(t *testing.T) {
	useEmptyCatalog(t)
	testutil.UseCache(t)
	ctx := context.Background()
	dist := addDomain(t, "dist", 1)
	addSyllabusCourse(t, dist, "course")
	addSyllabusCourse(t, dist, "other")
	userId := uuid.New()
	_, _, err := services.Enroll(ctx, userId, "course")
	require.NoError(t, err)
	for _, code := range []string{"2.1", "1.2"} {
		_, err := services.CompleteLesson(ctx, userId, "course", code)
		require.NoError(t, err)
	}
	// Someone else's progress is not the learner's.
	otherId := uuid.New()
	_, _, err = services.Enroll(ctx, otherId, "course")
	require.NoError(t, err)
	_, err = services.CompleteLesson(ctx, otherId, "course", "1.1")
	require.NoError(t, err)

	enrollment := enrollmentIn(t, userId, "course")
	require.NotNil(t, enrollment)
	assert.Equal(t, "course", enrollment.CourseId)
	assert.Equal(t, 2, enrollment.LessonsDone)
	assert.Equal(t, 66, enrollment.Progress)
	assert.Equal(t, []string{"1.2", "2.1"}, enrollment.CompletedLessons)

	// Deleting a lesson renumbers the module, and the codes follow.
	require.NoError(t, core.DB.Exec(`UPDATE lessons SET deleted_at = now() WHERE title = 'First'
		AND module_id IN (SELECT m.id FROM course_modules m JOIN courses c ON c.id = m.course_id WHERE c.slug = 'course')`).Error)
	enrollment = enrollmentIn(t, userId, "course")
	require.NotNil(t, enrollment)
	assert.Equal(t, []string{"1.1", "2.1"}, enrollment.CompletedLessons)

	assert.Nil(t, enrollmentIn(t, userId, "other"))
}

func TestUnenroll(t *testing.T) {
	useEmptyCatalog(t)
	testutil.UseCache(t)
	ctx := context.Background()
	addSyllabusCourse(t, addDomain(t, "dist", 1), "course")
	userId := uuid.New()
	_, _, err := services.Enroll(ctx, userId, "course")
	require.NoError(t, err)
	_, err = services.CompleteLesson(ctx, userId, "course", "1.1")
	require.NoError(t, err)

	require.NoError(t, services.Unenroll(ctx, userId, "course"))
	require.NoError(t, services.Unenroll(ctx, userId, "course"), "unenrolling again is a no-op")

	assert.Nil(t, enrollmentIn(t, userId, "course"))
	enrollments, err := services.GetEnrollments(ctx, userId)
	require.NoError(t, err)
	assert.Empty(t, enrollments)
	_, err = services.CompleteLesson(ctx, userId, "course", "1.2")
	assert.ErrorIs(t, err, services.ErrNotEnrolled)

	enrollment, created, err := services.Enroll(ctx, userId, "course")
	require.NoError(t, err)
	assert.True(t, created, "enrolling again after unenrolling is a new enrollment")
	assert.Zero(t, enrollment.LessonsDone, "and starts afresh")
	assert.Equal(t, []string{}, enrollment.CompletedLessons)

	assert.ErrorIs(t, services.Unenroll(ctx, userId, "missing"), services.ErrCourseNotFound)
}

func TestGetEnrollments(t *testing.T) {
	useEmptyCatalog(t)
	ctx := context.Background()
	dist := addDomain(t, "dist", 1)
	addSyllabusCourse(t, dist, "older")
	addSyllabusCourse(t, dist, "newer")
	withdrawn := addSyllabusCourse(t, dist, "withdrawn")
	empty := addCourse(t, dist, models.Course{Slug: "empty", PublishedAt: ago(time.Hour)})

	userId := uuid.New()
	for _, slug := range []string{"older", "newer", "withdrawn", "empty"} {
		_, _, err := services.Enroll(ctx, userId, slug)
		require.NoError(t, err)
	}
	// Someone else's enrollment is not the learner's.
	_, _, err := services.Enroll(ctx, uuid.New(), "older")
	require.NoError(t, err)

	require.NoError(t, core.DB.Exec(`UPDATE enrollments SET created_at = now() - interval '2 days' WHERE course_id IN
		(SELECT id FROM courses WHERE slug = 'older')`).Error)
	require.NoError(t, core.DB.Exec(`UPDATE enrollments SET created_at = now() - interval '3 days' WHERE course_id = ?`,
		empty.Id).Error)

	for _, code := range []string{"1.1", "2.1"} {
		_, err := services.CompleteLesson(ctx, userId, "newer", code)
		require.NoError(t, err)
	}
	_, err = services.CompleteLesson(ctx, userId, "older", "2.1")
	require.NoError(t, err)

	// A completed lesson that is deleted afterwards counts for neither side,
	// and a course taken out of the catalog drops out of the list.
	require.NoError(t, core.DB.Exec(`UPDATE lessons SET deleted_at = now() WHERE title = 'Third'
		AND module_id IN (SELECT m.id FROM course_modules m JOIN courses c ON c.id = m.course_id WHERE c.slug = 'newer')`).Error)
	require.NoError(t, core.DB.Model(&withdrawn).Update("published_at", nil).Error)

	enrollments, err := services.GetEnrollments(ctx, userId)
	require.NoError(t, err)

	type row struct {
		CourseId    string
		LessonsDone int
		Progress    int
	}
	got := make([]row, len(enrollments))
	for i, e := range enrollments {
		got[i] = row{e.CourseId, e.LessonsDone, e.Progress}
	}
	assert.Equal(t, []row{
		{"newer", 1, 50},
		{"older", 1, 33},
		{"empty", 0, 0},
	}, got, "most recently enrolled first")
}

func TestGetEnrollmentsWithNone(t *testing.T) {
	useEmptyCatalog(t)

	enrollments, err := services.GetEnrollments(context.Background(), uuid.New())
	require.NoError(t, err)
	assert.Equal(t, []schemas.EnrollmentSchema{}, enrollments, "an empty list, not null")
}

func TestGetMemberCourse(t *testing.T) {
	useEmptyCatalog(t)
	cache := testutil.UseCache(t)
	ctx := context.Background()
	addSyllabusCourse(t, addDomain(t, "dist", 1), "course")
	userId := uuid.New()
	_, _, err := services.Enroll(ctx, userId, "course")
	require.NoError(t, err)
	_, err = services.CompleteLesson(ctx, userId, "course", "1.2")
	require.NoError(t, err)

	course, err := services.GetMemberCourse(ctx, "course", userId)
	require.NoError(t, err)
	assert.NotEmpty(t, course.Modules[0].Lessons, "a member sees every lesson")
	require.NotNil(t, course.Enrollment)
	assert.Equal(t, "course", course.Enrollment.CourseId)
	assert.Equal(t, 1, course.Enrollment.LessonsDone)
	assert.Equal(t, []string{"1.2"}, course.Enrollment.CompletedLessons)
	assert.True(t, cache.Exists(services.CourseCacheKey("course", true)))

	// The cached course carries no one's enrollment.
	cachedCourse, err := services.GetCourse(ctx, "course", true)
	require.NoError(t, err)
	assert.Nil(t, cachedCourse.Enrollment)
	other, err := services.GetMemberCourse(ctx, "course", uuid.New())
	require.NoError(t, err)
	assert.Nil(t, other.Enrollment, "a member who isn't enrolled gets none")

	// The enrollment is read afresh each time, though the course is cached.
	_, err = services.CompleteLesson(ctx, userId, "course", "2.1")
	require.NoError(t, err)
	course, err = services.GetMemberCourse(ctx, "course", userId)
	require.NoError(t, err)
	require.NotNil(t, course.Enrollment)
	assert.Equal(t, []string{"1.2", "2.1"}, course.Enrollment.CompletedLessons)

	_, err = services.GetMemberCourse(ctx, "missing", userId)
	assert.ErrorIs(t, err, services.ErrCourseNotFound)
}

func TestGetMemberCatalog(t *testing.T) {
	useEmptyCatalog(t)
	cache := testutil.UseCache(t)
	ctx := context.Background()
	dist := addDomain(t, "dist", 1)
	addSyllabusCourse(t, dist, "course")
	addSyllabusCourse(t, dist, "other")
	userId := uuid.New()
	_, _, err := services.Enroll(ctx, userId, "course")
	require.NoError(t, err)
	_, err = services.CompleteLesson(ctx, userId, "course", "1.1")
	require.NoError(t, err)

	catalog, err := services.GetMemberCatalog(ctx, userId)
	require.NoError(t, err)
	assert.Len(t, catalog.Courses, 2)
	require.Len(t, catalog.Enrollments, 1)
	assert.Equal(t, "course", catalog.Enrollments[0].CourseId)
	assert.Equal(t, 1, catalog.Enrollments[0].LessonsDone)
	assert.True(t, cache.Exists(services.CatalogCacheKey()))

	// The cached catalog carries no one's enrollments.
	cachedCatalog, err := services.GetCatalog(ctx)
	require.NoError(t, err)
	assert.Empty(t, cachedCatalog.Enrollments)
	other, err := services.GetMemberCatalog(ctx, uuid.New())
	require.NoError(t, err)
	assert.Empty(t, other.Enrollments, "a member with none gets none")

	// The enrollments are read afresh each time, though the catalog is cached.
	_, _, err = services.Enroll(ctx, userId, "other")
	require.NoError(t, err)
	catalog, err = services.GetMemberCatalog(ctx, userId)
	require.NoError(t, err)
	assert.Len(t, catalog.Enrollments, 2)
}

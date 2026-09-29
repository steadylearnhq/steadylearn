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

// useEmptyCatalog gives the test a catalog with nothing in it to build its own
// in. The migrations seed the launch catalog, and the test's transaction rolls
// the deletes back.
func useEmptyCatalog(t *testing.T) {
	t.Helper()
	testutil.UseDB(t)
	// Deleting a course cascades to its modules, lessons, steps and break-its.
	require.NoError(t, core.DB.Exec("DELETE FROM courses").Error)
	require.NoError(t, core.DB.Exec("DELETE FROM domains").Error)
}

func base() models.BaseModel {
	return models.BaseModel{Id: uuid.New()}
}

func ago(d time.Duration) *time.Time {
	at := time.Now().Add(-d)
	return &at
}

func addDomain(t *testing.T, slug string, position int) models.Domain {
	t.Helper()
	domain := models.Domain{BaseModel: base(), Slug: slug, Name: "Domain " + slug, Position: position}
	require.NoError(t, core.DB.Create(&domain).Error)
	return domain
}

// addCourse stores the course with everything nested under it, filling in the
// ids and whatever a test does not care about.
func addCourse(t *testing.T, domain models.Domain, course models.Course) models.Course {
	t.Helper()
	course.BaseModel = base()
	course.DomainId = domain.Id
	if course.Title == "" {
		course.Title = "Course " + course.Slug
	}
	if course.Level == "" {
		course.Level = models.LevelIntermediate
	}
	if course.DurationMinutes == 0 {
		course.DurationMinutes = 120
	}
	for i := range course.BreakIts {
		course.BreakIts[i].BaseModel = base()
	}
	for i := range course.Modules {
		course.Modules[i].BaseModel = base()
		for j := range course.Modules[i].Lessons {
			lesson := &course.Modules[i].Lessons[j]
			lesson.BaseModel = base()
			if lesson.Minutes == 0 {
				lesson.Minutes = 10
			}
			for k := range lesson.Steps {
				lesson.Steps[k].BaseModel = base()
			}
		}
	}
	require.NoError(t, core.DB.Create(&course).Error)
	return course
}

func lessons(n int) []models.Lesson {
	out := make([]models.Lesson, n)
	for i := range out {
		out[i] = models.Lesson{Position: i + 1, Title: "Lesson"}
	}
	return out
}

func courseIds(courses []schemas.CourseSummarySchema) []string {
	ids := make([]string, len(courses))
	for i, c := range courses {
		ids[i] = c.Id
	}
	return ids
}

func TestGetCatalogListsPublishedCourses(t *testing.T) {
	useEmptyCatalog(t)
	testutil.UseCache(t)

	// Created out of display order, so the order has to come from the positions.
	db := addDomain(t, "db", 2)
	dist := addDomain(t, "dist", 1)
	drafts := addDomain(t, "drafts", 3)

	addCourse(t, dist, models.Course{Slug: "older", Position: 2, PublishedAt: ago(200 * 24 * time.Hour)})
	addCourse(t, dist, models.Course{
		Slug:        "recent",
		Position:    1,
		PublishedAt: ago(24 * time.Hour),
		BreakIts:    []models.CourseBreakIt{{Position: 2, Name: "Second"}, {Position: 1, Name: "First"}},
		Modules: []models.CourseModule{
			{Position: 1, Title: "One", Lessons: append(lessons(2), models.Lesson{Position: 3, Title: "Removed"})},
			{Position: 2, Title: "Two", Lessons: lessons(1)},
		},
	})
	require.NoError(t, core.DB.Exec(`UPDATE lessons SET deleted_at = now() WHERE title = 'Removed'`).Error)
	addCourse(t, db, models.Course{Slug: "free", Position: 1, IsFree: true, PublishedAt: ago(200 * 24 * time.Hour)})

	// None of these is in the catalog.
	addCourse(t, dist, models.Course{Slug: "draft", Position: 3})
	future := time.Now().Add(24 * time.Hour)
	addCourse(t, dist, models.Course{Slug: "scheduled", Position: 4, PublishedAt: &future})
	deleted := addCourse(t, dist, models.Course{Slug: "deleted", Position: 5, PublishedAt: ago(time.Hour)})
	require.NoError(t, core.DB.Model(&deleted).Update("deleted_at", time.Now()).Error)
	addCourse(t, drafts, models.Course{Slug: "only-draft", Position: 1})

	catalog, err := services.GetCatalog(context.Background())
	require.NoError(t, err)

	assert.Equal(t, []schemas.DomainSchema{
		{Id: "dist", Name: "Domain dist"},
		{Id: "db", Name: "Domain db"},
	}, catalog.Domains, "a domain with nothing published is left out")
	assert.Equal(t, []string{"recent", "older", "free"}, courseIds(catalog.Courses))

	recent := catalog.Courses[0]
	assert.Equal(t, "dist", recent.Domain)
	assert.True(t, recent.IsNew)
	assert.Equal(t, 3, recent.LessonCount, "lessons across modules, without the deleted one")
	assert.Equal(t, []string{"First", "Second"}, recent.BreakIts)

	older := catalog.Courses[1]
	assert.False(t, older.IsNew)
	assert.Equal(t, 0, older.LessonCount)
	assert.Equal(t, []string{}, older.BreakIts, "no break-its is an empty list, not null")

	assert.True(t, catalog.Courses[2].IsFree)
}

func TestGetCatalogWhenEmpty(t *testing.T) {
	useEmptyCatalog(t)
	testutil.UseCache(t)

	catalog, err := services.GetCatalog(context.Background())
	require.NoError(t, err)
	assert.Equal(t, schemas.CatalogSchema{Domains: []schemas.DomainSchema{}, Courses: []schemas.CourseSummarySchema{}}, catalog)
}

func TestGetCourseWithPublicSyllabus(t *testing.T) {
	useEmptyCatalog(t)
	testutil.UseCache(t)
	dist := addDomain(t, "dist", 1)

	// Positions with gaps still number the lessons 1, 2, 3.
	addCourse(t, dist, models.Course{
		Slug:           "open",
		PublishedAt:    ago(time.Hour),
		SyllabusPublic: true,
		Modules: []models.CourseModule{
			{Position: 20, Title: "Second", Lessons: []models.Lesson{{Position: 1, Title: "Only", Minutes: 7}}},
			{Position: 10, Title: "First", Lessons: []models.Lesson{
				{Position: 9, Title: "Later", Minutes: 12, Steps: []models.LessonStep{
					{Position: 2, Kind: models.StepBreak},
					{Position: 1, Kind: models.StepWatch},
				}},
				{Position: 5, Title: "Earlier", Minutes: 9},
			}},
			{Position: 30, Title: "Empty"},
		},
	})

	course, err := services.GetCourse(context.Background(), "open")
	require.NoError(t, err)

	assert.Equal(t, "open", course.Id)
	assert.Equal(t, 3, course.LessonCount)
	assert.Equal(t, []schemas.ModuleSchema{
		{Title: "First", LessonCount: 2, Lessons: []schemas.LessonSchema{
			{Code: "1.1", Title: "Earlier", Minutes: 9, Steps: []string{}},
			{Code: "1.2", Title: "Later", Minutes: 12, Steps: []string{"watch", "break"}},
		}},
		{Title: "Second", LessonCount: 1, Lessons: []schemas.LessonSchema{
			{Code: "2.1", Title: "Only", Minutes: 7, Steps: []string{}},
		}},
		{Title: "Empty", LessonCount: 0, Lessons: []schemas.LessonSchema{}},
	}, course.Modules)
}

func TestGetCourseWithPrivateSyllabus(t *testing.T) {
	useEmptyCatalog(t)
	testutil.UseCache(t)
	dist := addDomain(t, "dist", 1)

	addCourse(t, dist, models.Course{
		Slug:        "closed",
		PublishedAt: ago(time.Hour),
		Modules: []models.CourseModule{
			{Position: 1, Title: "One", Lessons: lessons(2)},
			{Position: 2, Title: "Two", Lessons: lessons(3)},
		},
	})

	course, err := services.GetCourse(context.Background(), "closed")
	require.NoError(t, err)

	assert.Equal(t, 5, course.LessonCount)
	assert.Equal(t, []schemas.ModuleSchema{
		{Title: "One", LessonCount: 2, Lessons: nil},
		{Title: "Two", LessonCount: 3, Lessons: nil},
	}, course.Modules, "modules and their counts, but no lessons")
}

func TestGetCourseNotInCatalog(t *testing.T) {
	useEmptyCatalog(t)
	cache := testutil.UseCache(t)
	dist := addDomain(t, "dist", 1)
	addCourse(t, dist, models.Course{Slug: "draft"})

	for _, slug := range []string{"missing", "draft"} {
		_, err := services.GetCourse(context.Background(), slug)
		require.ErrorIs(t, err, services.ErrCourseNotFound, slug)
		assert.False(t, cache.Exists(services.CourseCacheKey(slug)), "a miss is not cached")
	}
}

func TestGetCatalogReadsThroughTheCache(t *testing.T) {
	useEmptyCatalog(t)
	cache := testutil.UseCache(t)
	ctx := context.Background()
	dist := addDomain(t, "dist", 1)
	addCourse(t, dist, models.Course{Slug: "cached", PublishedAt: ago(time.Hour)})

	first, err := services.GetCatalog(ctx)
	require.NoError(t, err)
	assert.True(t, cache.Exists(services.CatalogCacheKey()))

	// With the course gone from the database, only the cache still has it.
	require.NoError(t, core.DB.Exec("DELETE FROM courses").Error)
	second, err := services.GetCatalog(ctx)
	require.NoError(t, err)
	assert.Equal(t, first, second)

	cache.FastForward(time.Hour)
	third, err := services.GetCatalog(ctx)
	require.NoError(t, err)
	assert.Empty(t, third.Courses, "an expired entry is loaded again")
}

func TestGetCourseServesWithoutTheCache(t *testing.T) {
	useEmptyCatalog(t)
	cache := testutil.UseCache(t)
	dist := addDomain(t, "dist", 1)
	addCourse(t, dist, models.Course{Slug: "uncached", PublishedAt: ago(time.Hour)})

	cache.Close()

	course, err := services.GetCourse(context.Background(), "uncached")
	require.NoError(t, err, "an unreachable cache falls back to the database")
	assert.Equal(t, "uncached", course.Id)
}

// The seed migration is the launch catalog, so it is checked as a whole: every
// course it lists loads, and its lesson count agrees with its modules.
func TestSeededCatalog(t *testing.T) {
	testutil.UseDB(t)
	testutil.UseCache(t)
	ctx := context.Background()

	catalog, err := services.GetCatalog(ctx)
	require.NoError(t, err)
	require.NotEmpty(t, catalog.Courses)

	domains := map[string]bool{}
	for _, d := range catalog.Domains {
		domains[d.Id] = true
	}

	for _, summary := range catalog.Courses {
		assert.True(t, domains[summary.Domain], "%s is in a listed domain", summary.Id)
		assert.NotEmpty(t, summary.BreakIts, summary.Id)

		course, err := services.GetCourse(ctx, summary.Id)
		require.NoError(t, err, summary.Id)
		assert.Equal(t, summary, course.CourseSummarySchema, summary.Id)

		total := 0
		for _, m := range course.Modules {
			total += m.LessonCount
			if m.Lessons != nil {
				assert.Len(t, m.Lessons, m.LessonCount, "%s: %s", summary.Id, m.Title)
			}
		}
		assert.Equal(t, summary.LessonCount, total, summary.Id)
	}
}

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
	for i := range course.Requirements {
		course.Requirements[i].BaseModel = base()
	}
	for i := range course.Outcomes {
		course.Outcomes[i].BaseModel = base()
	}
	for i := range course.Prerequisites {
		course.Prerequisites[i].BaseModel = base()
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

	course, err := services.GetCourse(context.Background(), "open", false)
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

	course, err := services.GetCourse(context.Background(), "closed", false)
	require.NoError(t, err)

	assert.Equal(t, 5, course.LessonCount)
	assert.Equal(t, []schemas.ModuleSchema{
		{Title: "One", LessonCount: 2, Lessons: nil},
		{Title: "Two", LessonCount: 3, Lessons: nil},
	}, course.Modules, "modules and their counts, but no lessons")
}

func TestGetCourseForAMember(t *testing.T) {
	useEmptyCatalog(t)
	cache := testutil.UseCache(t)
	ctx := context.Background()
	dist := addDomain(t, "dist", 1)

	addCourse(t, dist, models.Course{
		Slug:        "closed",
		PublishedAt: ago(time.Hour),
		Modules:     []models.CourseModule{{Position: 1, Title: "One", Lessons: lessons(2)}},
	})

	visitor, err := services.GetCourse(ctx, "closed", false)
	require.NoError(t, err)
	member, err := services.GetCourse(ctx, "closed", true)
	require.NoError(t, err)

	assert.Nil(t, visitor.Modules[0].Lessons)
	assert.Equal(t, []schemas.LessonSchema{
		{Code: "1.1", Title: "Lesson", Minutes: 10, Steps: []string{}},
		{Code: "1.2", Title: "Lesson", Minutes: 10, Steps: []string{}},
	}, member.Modules[0].Lessons, "a member sees a private syllabus")
	assert.True(t, cache.Exists(services.CourseCacheKey("closed", false)))
	assert.True(t, cache.Exists(services.CourseCacheKey("closed", true)), "each view is cached on its own")
}

func TestGetCoursePageCopy(t *testing.T) {
	useEmptyCatalog(t)
	testutil.UseCache(t)
	dist := addDomain(t, "dist", 1)
	hidden := addDomain(t, "hidden", 2)

	par := 4
	recommended := addCourse(t, dist, models.Course{Slug: "recommended", Position: 2, PublishedAt: ago(time.Hour)})
	optional := addCourse(t, dist, models.Course{Slug: "optional", Position: 3, PublishedAt: ago(time.Hour)})
	draft := addCourse(t, dist, models.Course{Slug: "draft", Position: 4})
	removed := addCourse(t, dist, models.Course{Slug: "removed", Position: 5, PublishedAt: ago(time.Hour)})
	require.NoError(t, core.DB.Model(&removed).Update("deleted_at", time.Now()).Error)
	orphaned := addCourse(t, hidden, models.Course{Slug: "orphaned", Position: 1, PublishedAt: ago(time.Hour)})
	require.NoError(t, core.DB.Exec("UPDATE domains SET deleted_at = now() WHERE slug = 'hidden'").Error)

	// Created out of order, so the order has to come from the positions.
	full := addCourse(t, dist, models.Course{
		Slug:        "full",
		Position:    1,
		PublishedAt: ago(time.Hour),
		Overview:    "What this course is about.",
		Assumes:     "assumes basic networking",
		BreakIts: []models.CourseBreakIt{
			{Position: 2, Name: "Unscored"},
			{Position: 1, Name: "Scored", Description: "Break it", Par: &par},
		},
		Requirements: []models.CourseRequirement{
			{Position: 2, Title: "Second"},
			{Position: 1, Title: "First", Detail: "Why"},
		},
		Outcomes: []models.CourseOutcome{
			{Position: 2, Statement: "Later"},
			{Position: 1, Statement: "Sooner"},
			{Position: 3, Statement: "Taught"},
			{Position: 4, Statement: "Taught by a deleted lesson"},
		},
		Modules: []models.CourseModule{{Position: 1, Title: "One", Lessons: lessons(3)}},
		Prerequisites: []models.CoursePrerequisite{
			{Position: 5, PrerequisiteId: optional.Id, Optional: true},
			{Position: 1, PrerequisiteId: recommended.Id},
			{Position: 2, PrerequisiteId: draft.Id},
			{Position: 3, PrerequisiteId: removed.Id},
			{Position: 4, PrerequisiteId: orphaned.Id},
		},
	})
	addCourse(t, dist, models.Course{Slug: "bare", Position: 6, PublishedAt: ago(time.Hour)})
	// Outcomes 3 and 4 are taught by lessons 1.2 and 1.3; then 1.3 is deleted.
	require.NoError(t, core.DB.Exec(`
UPDATE course_outcomes o SET lesson_id = l.id
FROM courses c, course_modules m, lessons l
WHERE c.slug = 'full' AND o.course_id = c.id AND m.course_id = c.id AND l.module_id = m.id
	AND l.position = o.position - 1 AND o.position IN (3, 4)`).Error)
	require.NoError(t, core.DB.Exec(`UPDATE lessons SET deleted_at = now()
WHERE position = 3 AND module_id IN (SELECT m.id FROM course_modules m JOIN courses c ON c.id = m.course_id WHERE c.slug = 'full')`).Error)
	// Follow-ups: courses that take "full" as a prerequisite, if in the catalog.
	for i, slug := range []string{"later-next", "next", "draft-next"} {
		next := models.Course{Slug: slug, Position: 9 - i, Prerequisites: []models.CoursePrerequisite{{Position: 1, PrerequisiteId: full.Id}}}
		if slug != "draft-next" {
			next.PublishedAt = ago(time.Hour)
		}
		addCourse(t, dist, next)
	}

	course, err := services.GetCourse(context.Background(), "full", false)
	require.NoError(t, err)

	assert.Equal(t, "What this course is about.", course.Overview)
	assert.Equal(t, "assumes basic networking", course.Assumes)
	assert.Equal(t, []schemas.RequirementSchema{{Title: "First", Detail: "Why"}, {Title: "Second", Detail: ""}}, course.Requirements)
	assert.Equal(t, []schemas.OutcomeSchema{
		{Statement: "Sooner"},
		{Statement: "Later"},
		{Statement: "Taught", Lesson: "1.2"},
		{Statement: "Taught by a deleted lesson"},
	}, course.Outcomes)
	assert.Equal(t, []schemas.BreakItSchema{
		{Name: "Scored", Description: "Break it", Par: &par},
		{Name: "Unscored", Description: "", Par: nil},
	}, course.BreakItDetails)
	assert.Equal(t, []schemas.PrerequisiteSchema{
		{Id: "recommended", Optional: false},
		{Id: "optional", Optional: true},
	}, course.Prerequisites, "only prerequisites that are in the catalog")
	assert.Equal(t, []string{"next", "later-next"}, course.FollowUps, "in catalog order, only those in the catalog")

	bare, err := services.GetCourse(context.Background(), "bare", false)
	require.NoError(t, err)
	assert.Empty(t, bare.Overview)
	assert.Equal(t, []schemas.RequirementSchema{}, bare.Requirements, "empty lists, not null")
	assert.Equal(t, []schemas.OutcomeSchema{}, bare.Outcomes)
	assert.Equal(t, []string{}, bare.FollowUps)
	assert.Equal(t, []schemas.BreakItSchema{}, bare.BreakItDetails)
	assert.Equal(t, []schemas.PrerequisiteSchema{}, bare.Prerequisites)
}

func TestGetCourseNotInCatalog(t *testing.T) {
	useEmptyCatalog(t)
	cache := testutil.UseCache(t)
	dist := addDomain(t, "dist", 1)
	addCourse(t, dist, models.Course{Slug: "draft"})

	for _, slug := range []string{"missing", "draft"} {
		for _, member := range []bool{false, true} {
			_, err := services.GetCourse(context.Background(), slug, member)
			require.ErrorIs(t, err, services.ErrCourseNotFound, slug)
			assert.False(t, cache.Exists(services.CourseCacheKey(slug, member)), "a miss is not cached")
		}
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

	course, err := services.GetCourse(context.Background(), "uncached", false)
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
	listed := map[string]bool{}
	for _, c := range catalog.Courses {
		listed[c.Id] = true
	}

	for _, summary := range catalog.Courses {
		assert.True(t, domains[summary.Domain], "%s is in a listed domain", summary.Id)
		assert.NotEmpty(t, summary.BreakIts, summary.Id)

		course, err := services.GetCourse(ctx, summary.Id, true)
		require.NoError(t, err, summary.Id)
		assert.Equal(t, summary, course.CourseSummarySchema, summary.Id)

		names := make([]string, len(course.BreakItDetails))
		for i, b := range course.BreakItDetails {
			names[i] = b.Name
		}
		assert.Equal(t, summary.BreakIts, names, "%s: the page describes the break-its the catalog lists", summary.Id)
		for _, p := range course.Prerequisites {
			assert.True(t, listed[p.Id], "%s: prerequisite %s is in the catalog", summary.Id, p.Id)
		}
		codes := map[string]bool{}
		for _, m := range course.Modules {
			for _, l := range m.Lessons {
				codes[l.Code] = true
			}
		}
		for _, o := range course.Outcomes {
			assert.True(t, o.Lesson == "" || codes[o.Lesson], "%s: outcome %q is taught by a lesson of the course", summary.Id, o.Statement)
		}

		total := 0
		for _, m := range course.Modules {
			total += m.LessonCount
			assert.Len(t, m.Lessons, m.LessonCount, "%s: a member sees every lesson of %s", summary.Id, m.Title)
		}
		assert.Equal(t, summary.LessonCount, total, summary.Id)
	}

	course, err := services.GetCourse(ctx, "replication-consensus", true)
	require.NoError(t, err)
	taughtIn := make([]string, len(course.Outcomes))
	for i, o := range course.Outcomes {
		taughtIn[i] = o.Lesson
	}
	assert.Equal(t, []string{"2.2", "3.2", "4.2", "2.3"}, taughtIn)
	assert.Equal(t, []string{"distributed-transactions", "crdts-local-first"}, course.FollowUps)
}

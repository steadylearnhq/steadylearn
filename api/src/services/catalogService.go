package services

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"

	"steadylearn-api/src/core"
	"steadylearn-api/src/schemas"
)

// ErrCourseNotFound is a slug with no course in the catalog: none by that
// name, or one that is deleted or not published yet.
var ErrCourseNotFound = errors.New("course not found")

// newCourseWindow is how long after publishing a course is badged as new.
const newCourseWindow = 60 * 24 * time.Hour

// catalogCacheTTL is how long a cached catalog or course is served. The
// catalog only changes with a migration, so this is also roughly how long a
// release takes to show; and it bounds how late a course loses its new badge.
const catalogCacheTTL = 10 * time.Minute

// Cache keys carry a version segment that is bumped whenever the schema they
// hold changes shape, so an entry written by an older build is never decoded
// into the new one.

func CatalogCacheKey() string {
	return core.CacheKey("catalog", "v1")
}

func CourseCacheKey(slug string) string {
	return core.CacheKey("course", "v1", slug)
}

// GetCatalog is every published course, with the domains they belong to,
// read through the cache.
func GetCatalog(ctx context.Context) (schemas.CatalogSchema, error) {
	return cached(ctx, CatalogCacheKey(), catalogCacheTTL, func() (schemas.CatalogSchema, error) {
		return loadCatalog(ctx, time.Now())
	})
}

// GetCourse is one published course with its syllabus, read through the cache.
// It is the view of a visitor who is not signed in: a course that keeps its
// syllabus private lists its modules but not their lessons.
func GetCourse(ctx context.Context, slug string) (schemas.CourseSchema, error) {
	return cached(ctx, CourseCacheKey(slug), catalogCacheTTL, func() (schemas.CourseSchema, error) {
		return loadCourse(ctx, slug, time.Now())
	})
}

// courseSummaries selects the listing fields of every course in the catalog:
// published by now, and in a domain that is not deleted. A query built on it
// appends its own conditions and order.
//
// The lesson count and the break-its are aggregated per course through
// lateral joins, which the indexes on course_id and module_id answer without
// touching other courses' rows.
const courseSummaries = `
SELECT c.id, c.slug, d.slug AS domain, c.title, c.description, c.level,
	c.duration_minutes AS minutes, c.is_free, c.syllabus_public,
	c.published_at > @new_since AS is_new,
	lc.lesson_count,
	COALESCE(b.break_its, '[]') AS break_its
FROM courses c
JOIN domains d ON d.id = c.domain_id AND d.deleted_at IS NULL
CROSS JOIN LATERAL (
	SELECT count(*) AS lesson_count
	FROM course_modules m
	JOIN lessons l ON l.module_id = m.id AND l.deleted_at IS NULL
	WHERE m.course_id = c.id AND m.deleted_at IS NULL
) lc
LEFT JOIN LATERAL (
	SELECT json_agg(bi.name ORDER BY bi.position) AS break_its
	FROM course_break_its bi
	WHERE bi.course_id = c.id AND bi.deleted_at IS NULL
) b ON true
WHERE c.deleted_at IS NULL AND c.published_at <= @now
`

type courseSummaryRow struct {
	Id             uuid.UUID
	Slug           string
	Domain         string
	Title          string
	Description    string
	Level          string
	Minutes        int
	IsFree         bool
	SyllabusPublic bool
	IsNew          bool
	LessonCount    int
	BreakIts       []byte
}

func (r courseSummaryRow) schema() (schemas.CourseSummarySchema, error) {
	var breakIts []string
	if err := json.Unmarshal(r.BreakIts, &breakIts); err != nil {
		return schemas.CourseSummarySchema{}, fmt.Errorf("course %s break-its: %w", r.Slug, err)
	}

	return schemas.CourseSummarySchema{
		Id:          r.Slug,
		Domain:      r.Domain,
		Title:       r.Title,
		Description: r.Description,
		Level:       r.Level,
		Minutes:     r.Minutes,
		LessonCount: r.LessonCount,
		IsNew:       r.IsNew,
		IsFree:      r.IsFree,
		BreakIts:    breakIts,
	}, nil
}

func loadCatalog(ctx context.Context, now time.Time) (schemas.CatalogSchema, error) {
	params := map[string]any{"now": now, "new_since": now.Add(-newCourseWindow)}
	db := core.DB.WithContext(ctx)

	domains := []schemas.DomainSchema{}
	err := db.Raw(`
SELECT d.slug AS id, d.name
FROM domains d
WHERE d.deleted_at IS NULL AND EXISTS (
	SELECT 1 FROM courses c
	WHERE c.domain_id = d.id AND c.deleted_at IS NULL AND c.published_at <= @now
)
ORDER BY d.position`, params).Scan(&domains).Error
	if err != nil {
		return schemas.CatalogSchema{}, fmt.Errorf("failed to list domains: %w", err)
	}

	var rows []courseSummaryRow
	err = db.Raw(courseSummaries+`ORDER BY d.position, c.position`, params).Scan(&rows).Error
	if err != nil {
		return schemas.CatalogSchema{}, fmt.Errorf("failed to list courses: %w", err)
	}

	courses := make([]schemas.CourseSummarySchema, 0, len(rows))
	for _, row := range rows {
		course, err := row.schema()
		if err != nil {
			return schemas.CatalogSchema{}, err
		}
		courses = append(courses, course)
	}

	return schemas.CatalogSchema{Domains: domains, Courses: courses}, nil
}

type moduleRow struct {
	Id          uuid.UUID
	Number      int
	Title       string
	LessonCount int
}

type lessonRow struct {
	ModuleId uuid.UUID
	Number   int
	Title    string
	Minutes  int
	Steps    []byte
}

func loadCourse(ctx context.Context, slug string, now time.Time) (schemas.CourseSchema, error) {
	params := map[string]any{"now": now, "new_since": now.Add(-newCourseWindow), "slug": slug}
	db := core.DB.WithContext(ctx)

	var rows []courseSummaryRow
	if err := db.Raw(courseSummaries+`AND c.slug = @slug`, params).Scan(&rows).Error; err != nil {
		return schemas.CourseSchema{}, fmt.Errorf("failed to load course: %w", err)
	}
	if len(rows) == 0 {
		return schemas.CourseSchema{}, ErrCourseNotFound
	}
	row := rows[0]

	summary, err := row.schema()
	if err != nil {
		return schemas.CourseSchema{}, err
	}

	// Numbers come from the order rather than the stored positions, which may
	// have gaps, so lesson codes always count 1, 2, 3.
	var modules []moduleRow
	err = db.Raw(`
SELECT m.id, m.title,
	row_number() OVER (ORDER BY m.position) AS number,
	(SELECT count(*) FROM lessons l WHERE l.module_id = m.id AND l.deleted_at IS NULL) AS lesson_count
FROM course_modules m
WHERE m.course_id = ? AND m.deleted_at IS NULL
ORDER BY m.position`, row.Id).Scan(&modules).Error
	if err != nil {
		return schemas.CourseSchema{}, fmt.Errorf("failed to list modules: %w", err)
	}

	lessons := map[uuid.UUID][]schemas.LessonSchema{}
	if row.SyllabusPublic {
		lessons, err = loadLessons(ctx, row.Id, modules)
		if err != nil {
			return schemas.CourseSchema{}, err
		}
	}

	course := schemas.CourseSchema{CourseSummarySchema: summary, Modules: make([]schemas.ModuleSchema, 0, len(modules))}
	for _, m := range modules {
		module := schemas.ModuleSchema{Title: m.Title, LessonCount: m.LessonCount}
		// A private syllabus leaves Lessons nil, which the API reports as null.
		if row.SyllabusPublic {
			module.Lessons = lessons[m.Id]
			if module.Lessons == nil {
				module.Lessons = []schemas.LessonSchema{}
			}
		}
		course.Modules = append(course.Modules, module)
	}

	return course, nil
}

// loadLessons is every lesson of the course with its steps, grouped by module.
func loadLessons(ctx context.Context, courseId uuid.UUID, modules []moduleRow) (map[uuid.UUID][]schemas.LessonSchema, error) {
	var rows []lessonRow
	err := core.DB.WithContext(ctx).Raw(`
SELECT l.module_id, l.title, l.minutes,
	row_number() OVER (PARTITION BY l.module_id ORDER BY l.position) AS number,
	COALESCE(s.steps, '[]') AS steps
FROM lessons l
JOIN course_modules m ON m.id = l.module_id AND m.deleted_at IS NULL
LEFT JOIN LATERAL (
	SELECT json_agg(ls.kind ORDER BY ls.position) AS steps
	FROM lesson_steps ls
	WHERE ls.lesson_id = l.id AND ls.deleted_at IS NULL
) s ON true
WHERE m.course_id = ? AND l.deleted_at IS NULL
ORDER BY m.position, l.position`, courseId).Scan(&rows).Error
	if err != nil {
		return nil, fmt.Errorf("failed to list lessons: %w", err)
	}

	moduleNumber := make(map[uuid.UUID]int, len(modules))
	for _, m := range modules {
		moduleNumber[m.Id] = m.Number
	}

	lessons := map[uuid.UUID][]schemas.LessonSchema{}
	for _, r := range rows {
		var steps []string
		if err := json.Unmarshal(r.Steps, &steps); err != nil {
			return nil, fmt.Errorf("lesson %q steps: %w", r.Title, err)
		}
		lessons[r.ModuleId] = append(lessons[r.ModuleId], schemas.LessonSchema{
			Code:    fmt.Sprintf("%d.%d", moduleNumber[r.ModuleId], r.Number),
			Title:   r.Title,
			Minutes: r.Minutes,
			Steps:   steps,
		})
	}

	return lessons, nil
}

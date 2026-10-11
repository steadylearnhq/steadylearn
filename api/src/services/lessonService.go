package services

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"

	"steadylearn-api/src/core"
	"steadylearn-api/src/models"
	"steadylearn-api/src/schemas"
)

// LessonCacheKey holds one lesson's page, without whether the member has done
// it.
func LessonCacheKey(slug string, code string) string {
	return core.CacheKey("lesson", "v1", slug, code)
}

// GetLesson is a lesson of a course in the catalog, named by its syllabus code,
// as its page shows it to a member taking the course. A course that is not free
// needs a subscription that gives access, and then an enrollment. The lesson
// comes through the cache; whether the member has done it never does.
func GetLesson(ctx context.Context, userId uuid.UUID, slug string, code string) (schemas.LessonPageSchema, error) {
	db := core.DB.WithContext(ctx)

	course, err := findCatalogCourse(db, slug)
	if err != nil {
		return schemas.LessonPageSchema{}, err
	}
	lessonId, err := lessonByCode(db, course.Id, code)
	if err != nil {
		return schemas.LessonPageSchema{}, err
	}
	// Access comes before the enrollment: a learner who cannot take the course
	// would get nowhere by enrolling.
	if err := requireAccess(db, userId, course); err != nil {
		return schemas.LessonPageSchema{}, err
	}
	enrollmentId, err := liveEnrollment(db, userId, course.Id)
	if err != nil {
		return schemas.LessonPageSchema{}, err
	}

	lesson, err := cached(ctx, LessonCacheKey(slug, code), catalogCacheTTL, func() (schemas.LessonPageSchema, error) {
		return loadLesson(ctx, course.Id, lessonId)
	})
	if err != nil {
		return schemas.LessonPageSchema{}, err
	}

	err = db.Raw(`SELECT EXISTS (SELECT 1 FROM lesson_completions WHERE enrollment_id = ? AND lesson_id = ? AND deleted_at IS NULL)`,
		enrollmentId, lessonId).Scan(&lesson.Done).Error
	if err != nil {
		return schemas.LessonPageSchema{}, fmt.Errorf("failed to check the lesson's completion: %w", err)
	}
	return lesson, nil
}

type syllabusRow struct {
	Id      uuid.UUID
	Code    string
	Title   string
	Minutes int
}

type stageRow struct {
	Kind    string
	Steps   models.StepList
	Content string
}

func (r stageRow) schema() schemas.StageSchema {
	return schemas.StageSchema{Kind: r.Kind, Steps: r.Steps, Content: json.RawMessage(r.Content)}
}

// loadLesson is the lesson's page, with its neighbours in the course's syllabus
// and its live stages.
func loadLesson(ctx context.Context, courseId uuid.UUID, lessonId uuid.UUID) (schemas.LessonPageSchema, error) {
	db := core.DB.WithContext(ctx)

	var course schemas.LessonCourseSchema
	if err := db.Raw(`SELECT slug AS id, title FROM courses WHERE id = ?`, courseId).Scan(&course).Error; err != nil {
		return schemas.LessonPageSchema{}, fmt.Errorf("failed to load course: %w", err)
	}

	// The whole syllabus is a dozen rows or so, and its order gives the
	// neighbours across module boundaries.
	var syllabus []syllabusRow
	err := db.Raw(`
SELECT s.id, s.module || '.' || s.lesson AS code, l.title, l.minutes
FROM (`+syllabusLessons+`) s
JOIN lessons l ON l.id = s.id
ORDER BY s.module, s.lesson`, map[string]any{"course": courseId}).Scan(&syllabus).Error
	if err != nil {
		return schemas.LessonPageSchema{}, fmt.Errorf("failed to list lessons: %w", err)
	}

	lesson := schemas.LessonPageSchema{Course: course}
	found := false
	for i, row := range syllabus {
		if row.Id != lessonId {
			continue
		}
		found = true
		lesson.Code, lesson.Title, lesson.Minutes = row.Code, row.Title, row.Minutes
		if i > 0 {
			lesson.Prev = &schemas.LessonLinkSchema{Code: syllabus[i-1].Code, Title: syllabus[i-1].Title}
		}
		if i < len(syllabus)-1 {
			lesson.Next = &schemas.LessonLinkSchema{Code: syllabus[i+1].Code, Title: syllabus[i+1].Title}
		}
		break
	}
	if !found {
		return schemas.LessonPageSchema{}, ErrLessonNotFound
	}

	var stages []stageRow
	err = db.Raw(`
SELECT kind, steps, content
FROM lesson_stages
WHERE lesson_id = ? AND deleted_at IS NULL
ORDER BY position`, lessonId).Scan(&stages).Error
	if err != nil {
		return schemas.LessonPageSchema{}, fmt.Errorf("failed to list stages: %w", err)
	}
	lesson.Stages = make([]schemas.StageSchema, 0, len(stages))
	for _, stage := range stages {
		lesson.Stages = append(lesson.Stages, stage.schema())
	}

	return lesson, nil
}

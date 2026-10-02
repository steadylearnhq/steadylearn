package services

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"steadylearn-api/src/core"
	"steadylearn-api/src/models"
	"steadylearn-api/src/schemas"
)

var (
	// ErrLessonNotFound is a lesson code with no lesson in the course.
	ErrLessonNotFound = errors.New("lesson not found")
	// ErrNotEnrolled is a lesson completed in a course the learner is not
	// enrolled in.
	ErrNotEnrolled = errors.New("not enrolled in the course")
)

// Enrollments are read straight from the database, never cached: they are a
// learner's own and change with every lesson they complete.

// enrollmentRows selects the learner's enrollments in courses still in the
// catalog, with the lessons each course has and how many of them the learner
// has completed. Deleted lessons count for neither. A query built on it
// appends its own conditions and order.
const enrollmentRows = `
SELECT c.slug AS course_id, e.created_at AS enrolled_at, lc.lesson_count, done.lessons_done
FROM enrollments e
JOIN courses c ON c.id = e.course_id AND c.deleted_at IS NULL AND c.published_at <= @now
JOIN domains d ON d.id = c.domain_id AND d.deleted_at IS NULL
CROSS JOIN LATERAL (
	SELECT count(*) AS lesson_count
	FROM course_modules m
	JOIN lessons l ON l.module_id = m.id AND l.deleted_at IS NULL
	WHERE m.course_id = c.id AND m.deleted_at IS NULL
) lc
CROSS JOIN LATERAL (
	SELECT count(*) AS lessons_done
	FROM lesson_completions lcn
	JOIN lessons l ON l.id = lcn.lesson_id AND l.deleted_at IS NULL
	JOIN course_modules m ON m.id = l.module_id AND m.deleted_at IS NULL AND m.course_id = c.id
	WHERE lcn.enrollment_id = e.id AND lcn.deleted_at IS NULL
) done
WHERE e.user_id = @user AND e.deleted_at IS NULL
`

type enrollmentRow struct {
	CourseId    string
	EnrolledAt  time.Time
	LessonCount int
	LessonsDone int
}

func (r enrollmentRow) schema() schemas.EnrollmentSchema {
	progress := 0
	if r.LessonCount > 0 {
		progress = r.LessonsDone * 100 / r.LessonCount
	}
	return schemas.EnrollmentSchema{
		CourseId:    r.CourseId,
		EnrolledAt:  r.EnrolledAt,
		LessonsDone: r.LessonsDone,
		Progress:    progress,
	}
}

// GetEnrollments is every course in the catalog the learner is enrolled in,
// most recently enrolled first.
func GetEnrollments(ctx context.Context, userId uuid.UUID) ([]schemas.EnrollmentSchema, error) {
	var rows []enrollmentRow
	err := core.DB.WithContext(ctx).Raw(enrollmentRows+`ORDER BY e.created_at DESC, c.slug`,
		map[string]any{"user": userId, "now": time.Now()}).Scan(&rows).Error
	if err != nil {
		return nil, fmt.Errorf("failed to list enrollments: %w", err)
	}

	enrollments := make([]schemas.EnrollmentSchema, 0, len(rows))
	for _, row := range rows {
		enrollments = append(enrollments, row.schema())
	}
	return enrollments, nil
}

// getEnrollment is the learner's enrollment in one course.
func getEnrollment(ctx context.Context, userId uuid.UUID, slug string) (schemas.EnrollmentSchema, error) {
	var rows []enrollmentRow
	err := core.DB.WithContext(ctx).Raw(enrollmentRows+`AND c.slug = @slug`,
		map[string]any{"user": userId, "now": time.Now(), "slug": slug}).Scan(&rows).Error
	if err != nil {
		return schemas.EnrollmentSchema{}, fmt.Errorf("failed to load enrollment: %w", err)
	}
	if len(rows) == 0 {
		return schemas.EnrollmentSchema{}, ErrNotEnrolled
	}
	return rows[0].schema(), nil
}

// catalogCourseId is the id of the course in the catalog with the given slug.
func catalogCourseId(db *gorm.DB, slug string) (uuid.UUID, error) {
	var rows []struct{ Id uuid.UUID }
	err := db.Raw(`
SELECT c.id
FROM courses c
JOIN domains d ON d.id = c.domain_id AND d.deleted_at IS NULL
WHERE c.slug = @slug AND c.deleted_at IS NULL AND c.published_at <= @now`,
		map[string]any{"slug": slug, "now": time.Now()}).Scan(&rows).Error
	if err != nil {
		return uuid.Nil, fmt.Errorf("failed to find course: %w", err)
	}
	if len(rows) == 0 {
		return uuid.Nil, ErrCourseNotFound
	}
	return rows[0].Id, nil
}

// Enroll enrolls the learner in a course in the catalog, and reports whether
// they were not enrolled before. Enrolling again is a no-op.
//
// The learner's local row is created if it is missing: a valid token is all
// it takes to be a learner, and the row exists to hold what hangs off them.
func Enroll(ctx context.Context, userId uuid.UUID, slug string) (schemas.EnrollmentSchema, bool, error) {
	created := false
	err := core.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		courseId, err := catalogCourseId(tx, slug)
		if err != nil {
			return err
		}

		user := models.User{BaseModel: models.BaseModel{Id: userId}}
		if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&user).Error; err != nil {
			return fmt.Errorf("failed to set up user: %w", err)
		}

		enrollment := models.Enrollment{BaseModel: models.BaseModel{Id: uuid.New()}, UserId: userId, CourseId: courseId}
		result := tx.Clauses(clause.OnConflict{DoNothing: true}).Omit(clause.Associations).Create(&enrollment)
		if result.Error != nil {
			return fmt.Errorf("failed to enroll: %w", result.Error)
		}
		created = result.RowsAffected > 0
		return nil
	})
	if err != nil {
		return schemas.EnrollmentSchema{}, false, err
	}

	enrollment, err := getEnrollment(ctx, userId, slug)
	return enrollment, created, err
}

// CompleteLesson marks a lesson done for a learner enrolled in its course, and
// returns the enrollment with its progress. The lesson is named by its code,
// 2.4 for the fourth lesson of the second module, as the syllabus numbers it.
// Completing a lesson again is a no-op.
func CompleteLesson(ctx context.Context, userId uuid.UUID, slug string, code string) (schemas.EnrollmentSchema, error) {
	db := core.DB.WithContext(ctx)

	courseId, err := catalogCourseId(db, slug)
	if err != nil {
		return schemas.EnrollmentSchema{}, err
	}

	lessonId, err := lessonByCode(db, courseId, code)
	if err != nil {
		return schemas.EnrollmentSchema{}, err
	}

	var enrollments []struct{ Id uuid.UUID }
	err = db.Raw(`SELECT id FROM enrollments WHERE user_id = ? AND course_id = ? AND deleted_at IS NULL`,
		userId, courseId).Scan(&enrollments).Error
	if err != nil {
		return schemas.EnrollmentSchema{}, fmt.Errorf("failed to find enrollment: %w", err)
	}
	if len(enrollments) == 0 {
		return schemas.EnrollmentSchema{}, ErrNotEnrolled
	}

	completion := models.LessonCompletion{
		BaseModel:    models.BaseModel{Id: uuid.New()},
		EnrollmentId: enrollments[0].Id,
		LessonId:     lessonId,
	}
	err = db.Clauses(clause.OnConflict{DoNothing: true}).Omit(clause.Associations).Create(&completion).Error
	if err != nil {
		return schemas.EnrollmentSchema{}, fmt.Errorf("failed to complete lesson: %w", err)
	}

	return getEnrollment(ctx, userId, slug)
}

// lessonByCode finds the lesson a syllabus code names. Codes count modules and
// lessons in order, skipping deleted ones, as loadCourse numbers them.
func lessonByCode(db *gorm.DB, courseId uuid.UUID, code string) (uuid.UUID, error) {
	var module, lesson int
	// The round trip rejects anything but the plain form: 2.4, not 02.4 or 2.4x.
	if _, err := fmt.Sscanf(code, "%d.%d", &module, &lesson); err != nil || fmt.Sprintf("%d.%d", module, lesson) != code {
		return uuid.Nil, ErrLessonNotFound
	}

	var rows []struct{ Id uuid.UUID }
	err := db.Raw(`
SELECT l.id
FROM (
	SELECT m.id, row_number() OVER (ORDER BY m.position) AS number
	FROM course_modules m
	WHERE m.course_id = @course AND m.deleted_at IS NULL
) m
JOIN LATERAL (
	SELECT l.id, row_number() OVER (ORDER BY l.position) AS number
	FROM lessons l
	WHERE l.module_id = m.id AND l.deleted_at IS NULL
) l ON l.number = @lesson
WHERE m.number = @module`,
		map[string]any{"course": courseId, "module": module, "lesson": lesson}).Scan(&rows).Error
	if err != nil {
		return uuid.Nil, fmt.Errorf("failed to find lesson: %w", err)
	}
	if len(rows) == 0 {
		return uuid.Nil, ErrLessonNotFound
	}
	return rows[0].Id, nil
}

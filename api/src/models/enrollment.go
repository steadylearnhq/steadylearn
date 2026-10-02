package models

import (
	"github.com/google/uuid"
)

// Enrollment is a learner taking a course. A learner has at most one live
// enrollment in a course; their progress through it is the lessons they have
// completed. Unenrolling soft-deletes it, so enrolling again starts afresh.
type Enrollment struct {
	BaseModel
	UserId      uuid.UUID          `gorm:"type:uuid;not null;uniqueIndex:idx_enrollments_user_course,where:deleted_at IS NULL"`
	User        User               `gorm:"constraint:OnDelete:CASCADE"`
	CourseId    uuid.UUID          `gorm:"type:uuid;not null;uniqueIndex:idx_enrollments_user_course;index"`
	Course      Course             `gorm:"constraint:OnDelete:CASCADE"`
	Completions []LessonCompletion `gorm:"constraint:OnDelete:CASCADE"`
}

// LessonCompletion is a lesson an enrolled learner has finished. It hangs off
// the enrollment, so a lesson can only be completed in a course the learner
// is taking. Marking the lesson not done soft-deletes it.
type LessonCompletion struct {
	BaseModel
	EnrollmentId uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_lesson_completions_enrollment_lesson,where:deleted_at IS NULL"`
	LessonId     uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_lesson_completions_enrollment_lesson;index"`
	Lesson       Lesson    `gorm:"constraint:OnDelete:CASCADE"`
}

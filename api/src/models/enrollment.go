package models

import (
	"time"

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

// CourseFeedback is what an enrolled learner thinks of the course: a rating
// from 1 to 5 and an optional message for its author. It hangs off the
// enrollment, so only a learner taking the course can leave one, and they
// leave at most one, which they may edit.
type CourseFeedback struct {
	BaseModel
	UpdatedAt    time.Time  `gorm:"column:updated_at;not null;default:CURRENT_TIMESTAMP"`
	EnrollmentId uuid.UUID  `gorm:"type:uuid;not null;uniqueIndex:idx_course_feedbacks_enrollment,where:deleted_at IS NULL"`
	Enrollment   Enrollment `gorm:"constraint:OnDelete:CASCADE"`
	Rating       int        `gorm:"not null;check:chk_course_feedbacks_rating,rating BETWEEN 1 AND 5"`
	Message      string     `gorm:"not null;default:''"`
}

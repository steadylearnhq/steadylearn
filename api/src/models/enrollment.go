package models

import (
	"github.com/google/uuid"
)

// Enrollment is a learner taking a course. A learner enrolls in a course once;
// their progress through it is the lessons they have completed.
type Enrollment struct {
	BaseModel
	UserId      uuid.UUID          `gorm:"type:uuid;not null;uniqueIndex:idx_enrollments_user_course"`
	User        User               `gorm:"constraint:OnDelete:CASCADE"`
	CourseId    uuid.UUID          `gorm:"type:uuid;not null;uniqueIndex:idx_enrollments_user_course;index"`
	Course      Course             `gorm:"constraint:OnDelete:CASCADE"`
	Completions []LessonCompletion `gorm:"constraint:OnDelete:CASCADE"`
}

// LessonCompletion is a lesson an enrolled learner has finished. It hangs off
// the enrollment, so a lesson can only be completed in a course the learner
// is taking.
type LessonCompletion struct {
	BaseModel
	EnrollmentId uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_lesson_completions_enrollment_lesson"`
	LessonId     uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_lesson_completions_enrollment_lesson;index"`
	Lesson       Lesson    `gorm:"constraint:OnDelete:CASCADE"`
}

package schemas

import "time"

// EnrollmentSchema is a course the caller is taking and how far through it
// they are.
type EnrollmentSchema struct {
	// CourseId is the course's slug, as the catalog lists it.
	CourseId   string    `json:"courseId" example:"replication-consensus"`
	EnrolledAt time.Time `json:"enrolledAt" example:"2026-10-02T14:12:24Z"`
	// LessonsDone counts the course's lessons the caller has completed.
	LessonsDone int `json:"lessonsDone" example:"6"`
	// Progress is LessonsDone as a percentage of the course's lessons, rounded
	// down, so 100 means every lesson is done.
	Progress int `json:"progress" example:"50"`
}

// CourseEnrollmentSchema is the caller's enrollment in one course, with which
// of its lessons they have completed.
type CourseEnrollmentSchema struct {
	EnrollmentSchema
	// CompletedLessons are the codes of the lessons the caller has completed,
	// as the course's syllabus numbers them, in syllabus order.
	CompletedLessons []string `json:"completedLessons" example:"1.1,1.2"`
}

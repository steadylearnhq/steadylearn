package models

import (
	"time"

	"github.com/google/uuid"
)

// The catalog is a tree: a domain holds courses, a course holds modules,
// break-its and the copy its own page shows, a module holds lessons, and a
// lesson is a sequence of steps. Every
// ordered child carries a position, which is only ever compared, so gaps are
// fine and an item can be moved in without renumbering its siblings.

// Domain is a subject area the catalog groups courses under. The slug is its
// public id, the one the app filters on and links to.
type Domain struct {
	BaseModel
	Slug     string `gorm:"not null;uniqueIndex"`
	Name     string `gorm:"not null"`
	Position int    `gorm:"not null"`
}

// Course levels, from least to most assumed background.
const (
	LevelFoundational = "foundational"
	LevelIntermediate = "intermediate"
	LevelAdvanced     = "advanced"
)

type Course struct {
	BaseModel
	Slug     string    `gorm:"not null;uniqueIndex"`
	DomainId uuid.UUID `gorm:"type:uuid;not null;index"`
	Domain   Domain    `gorm:"constraint:OnDelete:RESTRICT"`
	Position int       `gorm:"not null"`
	Title    string    `gorm:"not null"`
	// Description is the one line the catalog lists; Overview leads the
	// course's own page.
	Description string `gorm:"not null"`
	Overview    string `gorm:"not null;default:''"`
	Level       string `gorm:"not null;check:level IN ('foundational', 'intermediate', 'advanced')"`
	// Assumes is the background the level takes for granted, shown beside it:
	// "assumes basic networking".
	Assumes string `gorm:"not null;default:''"`
	// DurationMinutes is the course's advertised length. It is set rather than
	// summed from the lessons: it also covers the time a learner spends in the
	// simulations, which no lesson's own length includes.
	DurationMinutes int  `gorm:"not null;check:duration_minutes > 0"`
	IsFree          bool `gorm:"not null;default:false"`
	// SyllabusPublic shows the lesson list to visitors who are not signed in.
	// Otherwise they see only the modules and how many lessons each one has.
	SyllabusPublic bool `gorm:"not null;default:false"`
	// PublishedAt is when the course went live. A course without one, or with
	// one in the future, is not in the catalog.
	PublishedAt   *time.Time
	Modules       []CourseModule       `gorm:"constraint:OnDelete:CASCADE"`
	BreakIts      []CourseBreakIt      `gorm:"constraint:OnDelete:CASCADE"`
	Requirements  []CourseRequirement  `gorm:"constraint:OnDelete:CASCADE"`
	Outcomes      []CourseOutcome      `gorm:"constraint:OnDelete:CASCADE"`
	Prerequisites []CoursePrerequisite `gorm:"foreignKey:CourseId;constraint:OnDelete:CASCADE"`
}

// CourseBreakIt is a failure mode the learner triggers in one of the course's
// simulations.
type CourseBreakIt struct {
	BaseModel
	CourseId    uuid.UUID `gorm:"type:uuid;not null;index"`
	Position    int       `gorm:"not null"`
	Name        string    `gorm:"not null"`
	Description string    `gorm:"not null;default:''"`
	// Par is how many moves the simulation expects the break to take, if it
	// sets one.
	Par *int `gorm:"check:par > 0"`
}

// CourseRequirement is something a learner should know before starting the
// course: "What you need to know".
type CourseRequirement struct {
	BaseModel
	CourseId uuid.UUID `gorm:"type:uuid;not null;index"`
	Position int       `gorm:"not null"`
	Title    string    `gorm:"not null"`
	Detail   string    `gorm:"not null;default:''"`
}

// CourseOutcome is something a learner can do after the course: "You'll be
// able to". LessonId is the lesson that teaches it, which unlocks it for a
// learner who completes it; an outcome may have none.
type CourseOutcome struct {
	BaseModel
	CourseId  uuid.UUID  `gorm:"type:uuid;not null;index"`
	Position  int        `gorm:"not null"`
	Statement string     `gorm:"not null"`
	LessonId  *uuid.UUID `gorm:"type:uuid;index"`
	Lesson    *Lesson    `gorm:"constraint:OnDelete:SET NULL"`
}

// CoursePrerequisite is a course that makes this one easier to take: one the
// learner is recommended to take first, or, if Optional, may.
type CoursePrerequisite struct {
	BaseModel
	CourseId       uuid.UUID `gorm:"type:uuid;not null;index;check:chk_course_prerequisites_other,course_id <> prerequisite_id"`
	PrerequisiteId uuid.UUID `gorm:"type:uuid;not null;index"`
	Prerequisite   *Course   `gorm:"constraint:OnDelete:CASCADE"`
	Position       int       `gorm:"not null"`
	Optional       bool      `gorm:"not null;default:false"`
}

type CourseModule struct {
	BaseModel
	CourseId uuid.UUID `gorm:"type:uuid;not null;index"`
	Position int       `gorm:"not null"`
	Title    string    `gorm:"not null"`
	Lessons  []Lesson  `gorm:"foreignKey:ModuleId;constraint:OnDelete:CASCADE"`
}

type Lesson struct {
	BaseModel
	ModuleId uuid.UUID    `gorm:"type:uuid;not null;index"`
	Position int          `gorm:"not null"`
	Title    string       `gorm:"not null"`
	Minutes  int          `gorm:"not null;check:minutes > 0"`
	Steps    []LessonStep `gorm:"constraint:OnDelete:CASCADE"`
}

// Lesson step kinds. The app owns how each one is drawn.
const (
	StepWatch      = "watch"
	StepRead       = "read"
	StepBuild      = "build"
	StepTrace      = "trace"
	StepRange      = "range"
	StepBet        = "bet"
	StepBreak      = "break"
	StepPostmortem = "postmortem"
)

// LessonStep is one activity in a lesson: a video, a reading, a simulation.
type LessonStep struct {
	BaseModel
	LessonId uuid.UUID `gorm:"type:uuid;not null;index"`
	Position int       `gorm:"not null"`
	Kind     string    `gorm:"not null;check:kind IN ('watch', 'read', 'build', 'trace', 'range', 'bet', 'break', 'postmortem')"`
}

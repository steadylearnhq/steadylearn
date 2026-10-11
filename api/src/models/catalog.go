package models

import (
	"database/sql/driver"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

// The catalog is a tree: a domain holds courses, a course holds modules,
// break-its and the copy its own page shows, a module holds lessons, and a
// lesson is a sequence of steps, which the syllabus lists, and of stages,
// which the lesson page walks through. Every ordered child carries a
// position, which is only ever compared, so gaps are fine and an item can be
// moved in without renumbering its siblings.

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
	ModuleId uuid.UUID     `gorm:"type:uuid;not null;index"`
	Position int           `gorm:"not null"`
	Title    string        `gorm:"not null"`
	Minutes  int           `gorm:"not null;check:minutes > 0"`
	Steps    []LessonStep  `gorm:"constraint:OnDelete:CASCADE"`
	Stages   []LessonStage `gorm:"constraint:OnDelete:CASCADE"`
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

// Lesson stage kinds. The app owns how each one is drawn.
const (
	StageLearn       = "learn"
	StageInteractive = "interactive"
	StageQuestions   = "questions"
	StageReview      = "review"
)

// LessonStage is one screen of the lesson page. Steps are the lesson's steps
// the stage covers, which the syllabus shows as icons: a learn stage with both
// watch and read lets the learner pick one, an interactive stage is one lab
// (a postmortem included), and a review has none. Kinds can repeat, so a
// lesson may go learn, interactive, learn. Content is JSON the API passes through
// untouched: the app owns its shape for each kind, so it can be replaced
// without a code change.
type LessonStage struct {
	BaseModel
	LessonId uuid.UUID `gorm:"type:uuid;not null;index;uniqueIndex:idx_lesson_stages_lesson_position,where:deleted_at IS NULL"`
	Position int       `gorm:"not null;uniqueIndex:idx_lesson_stages_lesson_position"`
	Kind     string    `gorm:"not null;check:kind IN ('learn', 'interactive', 'questions', 'review')"`
	Steps    StepList  `gorm:"type:text[];not null;default:'{}';check:chk_lesson_stages_steps,(kind = 'learn' AND steps IN ('{watch}', '{read}', '{watch,read}')) OR (kind = 'interactive' AND steps IN ('{build}', '{trace}', '{range}', '{break}', '{postmortem}')) OR (kind = 'questions' AND steps = '{bet}') OR (kind = 'review' AND steps = '{}')"`
	Content  string    `gorm:"type:jsonb;not null;default:'{}'"`
}

// StepList is a text[] column of step kinds, in order. Each call takes its
// own pgtype.Map, which caches plans and is not safe for concurrent use.
type StepList []string

func (s *StepList) Scan(src any) error {
	return pgtype.NewMap().SQLScanner((*[]string)(s)).Scan(src)
}

func (s StepList) Value() (driver.Value, error) {
	if s == nil {
		s = StepList{}
	}
	buf, err := pgtype.NewMap().Encode(pgtype.TextArrayOID, pgtype.TextFormatCode, []string(s), nil)
	return string(buf), err
}

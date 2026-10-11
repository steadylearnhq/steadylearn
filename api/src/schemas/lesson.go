package schemas

import "encoding/json"

// LessonPageSchema is one lesson as its own page shows it: the stages it walks
// through, the lessons either side of it, and whether the caller has done it.
type LessonPageSchema struct {
	Course LessonCourseSchema `json:"course"`
	// Code is the lesson's place in the syllabus: 2.3 is the third lesson of
	// the second module.
	Code    string `json:"code" example:"2.3"`
	Title   string `json:"title" example:"Sizing replicated storage"`
	Minutes int    `json:"minutes" example:"15"`
	// Stages are the lesson's screens, in order. Kinds can repeat, so the app
	// names a stage by its place in this list, counting from 1.
	Stages []StageSchema `json:"stages"`
	// Prev and Next are the lessons either side of this one in syllabus order,
	// across module boundaries, or null at the start and end of the course.
	Prev *LessonLinkSchema `json:"prev"`
	Next *LessonLinkSchema `json:"next"`
	// Done is whether the caller has completed the lesson. It is never cached
	// with the rest.
	Done bool `json:"done" example:"false"`
}

// LessonCourseSchema is the course a lesson belongs to, as its page names it.
type LessonCourseSchema struct {
	Id    string `json:"id" example:"replication-consensus"`
	Title string `json:"title" example:"Replication & consensus"`
}

// LessonLinkSchema is a lesson another lesson's page links to.
type LessonLinkSchema struct {
	Code  string `json:"code" example:"2.2"`
	Title string `json:"title" example:"Read and write quorums"`
}

// StageSchema is one screen of a lesson. Steps are the syllabus steps it
// covers: a learn stage with both watch and read lets the learner pick one.
type StageSchema struct {
	Kind  string   `json:"kind" enums:"learn,interactive,questions,review" example:"learn"`
	Steps []string `json:"steps" enums:"watch,read,build,trace,range,bet,break,postmortem" example:"watch,read"`
	// Content is the stage's own JSON, whose shape the app owns for each kind.
	// The API passes it through untouched.
	Content json.RawMessage `json:"content" swaggertype:"object"`
}

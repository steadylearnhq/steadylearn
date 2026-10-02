package schemas

// Catalog ids are slugs, not the rows' uuids: they are what the app puts in
// its URLs (?domain=dist, ?course=storage-engines).

type DomainSchema struct {
	Id   string `json:"id" example:"dist"`
	Name string `json:"name" example:"Distributed systems"`
}

// CourseSummarySchema is a course as the catalog lists it, without its syllabus.
type CourseSummarySchema struct {
	Id          string `json:"id" example:"replication-consensus"`
	Domain      string `json:"domain" example:"dist"`
	Title       string `json:"title" example:"Replication & consensus"`
	Description string `json:"description" example:"Quorums, elections and leases, and the trade-offs behind each one."`
	Level       string `json:"level" enums:"foundational,intermediate,advanced" example:"advanced"`
	// Minutes is the course's advertised length, which is more than the sum of
	// its lessons: it includes time spent in the simulations.
	Minutes     int  `json:"minutes" example:"198"`
	LessonCount int  `json:"lessonCount" example:"12"`
	IsNew       bool `json:"isNew" example:"false"`
	IsFree      bool `json:"isFree" example:"false"`
	// BreakIts are the failure modes the learner triggers in the simulations.
	BreakIts []string `json:"breakIts" example:"Lost write,Stale read,Split brain"`
}

type CatalogSchema struct {
	// Domains are those with at least one course in the catalog, in display order.
	Domains []DomainSchema        `json:"domains"`
	Courses []CourseSummarySchema `json:"courses"`
}

type LessonSchema struct {
	// Code is the lesson's place in the syllabus: 2.3 is the third lesson of
	// the second module.
	Code    string   `json:"code" example:"2.3"`
	Title   string   `json:"title" example:"Sizing replicated storage"`
	Minutes int      `json:"minutes" example:"15"`
	Steps   []string `json:"steps" enums:"watch,read,build,trace,range,bet,break,postmortem" example:"watch,read,range,bet"`
}

type ModuleSchema struct {
	Title       string `json:"title" example:"Quorums"`
	LessonCount int    `json:"lessonCount" example:"4"`
	// Lessons is null when the course keeps its syllabus private from visitors
	// who are not signed in.
	Lessons []LessonSchema `json:"lessons"`
}

// RequirementSchema is something to know before starting the course.
type RequirementSchema struct {
	Title  string `json:"title" example:"Networks drop and reorder messages"`
	Detail string `json:"detail" example:"You know a request can time out even though the server applied it."`
}

// BreakItSchema is a break-it as the course's page describes it.
type BreakItSchema struct {
	Name        string `json:"name" example:"Lost write"`
	Description string `json:"description" example:"Get an acknowledged write to vanish"`
	// Par is how many moves the break is expected to take, or null without one.
	Par *int `json:"par" example:"4"`
}

// PrerequisiteSchema is a course that makes this one easier to take.
type PrerequisiteSchema struct {
	// Id is the prerequisite's slug, a course in the catalog.
	Id string `json:"id" example:"partitioning-rebalancing"`
	// Optional is a course worth taking first; one that is not is recommended.
	Optional bool `json:"optional" example:"false"`
}

// CourseSchema is a course with its syllabus and the copy its own page shows.
type CourseSchema struct {
	CourseSummarySchema
	// Overview leads the course's page; it is empty until the course has one.
	Overview string `json:"overview" example:"How replicated systems agree on what \"latest\" means, and the specific ways that agreement breaks."`
	// Assumes is the background the level takes for granted, or empty.
	Assumes        string               `json:"assumes" example:"assumes basic networking"`
	Requirements   []RequirementSchema  `json:"requirements"`
	Outcomes       []string             `json:"outcomes" example:"Size R and W for a given N and say what each choice costs"`
	BreakItDetails []BreakItSchema      `json:"breakItDetails"`
	Prerequisites  []PrerequisiteSchema `json:"prerequisites"`
	Modules        []ModuleSchema       `json:"modules"`
}

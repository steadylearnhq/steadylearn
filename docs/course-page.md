# Course page for members

Signed-in members open a course on its own page (`/courses/:id`) instead of
the catalog's drawer, as in the v9 design. The page has two states, before and
after enrolling. Nothing tracks enrollment yet, so this work ships the first
one: the course as a member sees it before enrolling.

## What the page shows

- Header: breadcrumb (Catalog / domain), title, overview, and a call to action.
- Stats row: level (with what it assumes), length (lessons and sections), and,
  once there is data behind them, rating and enrolled counts.
- Syllabus: one collapsible module per section, each lesson with its practice
  steps and length.
- Side column: "What you need to know", "You'll be able to", "You'll break"
  (each break-it with its description and par).
- "Before you start": courses that make this one easier, recommended or
  optional.

## Step 1: API (`api/`)

- Model additions, with their Atlas migration:
  - `courses.overview`, `courses.assumes`
  - `course_break_its.description`, `course_break_its.par`
  - `course_requirements` (title, detail), `course_outcomes` (statement),
    `course_prerequisites` (prerequisite course, optional flag)
- `GET /v1/courses/:id` returns them, prerequisites as course slugs, and only
  courses that are in the catalog.
- The same endpoint accepts an optional bearer token. A signed-in caller gets
  every lesson, even of a course whose syllabus is private to visitors. Both
  views are cached separately, and the member response is not shared by
  caches (`Cache-Control: private`).
- A data migration seeds the content the design gives, for Replication &
  consensus. Other courses get theirs as their copy is written; until then
  the page leaves those sections out.

## Step 2: App (`app/`)

- Route `/courses/:id` under `RequireAuth`; the members' catalog cards and the
  dashboard link to it. Visitors keep the drawer.
- `fetchCourse` sends the session's token when there is one, so members get
  the full syllabus.
- The page follows the design's pre-enrollment state; sections with no data
  are left out.

## Later

- Enrollment (the Enroll button, progress, the enrolled state of the page)
  needs an enrollments table and endpoints.
- Rating and enrolled counts come with enrollment and feedback.

# Enrollment and progress

The members' catalog shows which courses a member is enrolled in and how far
through each they are. Until now that came from placeholder data in
`app/src/data/dashboard.ts`; this work puts it behind the API.

## Rules

- A member enrolls in a course in the catalog; enrolling again is a no-op.
- Progress is lessons completed ÷ lessons in the course, rounded down, so
  100% means every lesson is done. Deleted lessons count for neither side.
- A lesson can be marked done only in a course the member is enrolled in.
- Enrolling creates the member's local user row if it is missing: the app
  never calls `POST /v1/users`, so a valid token is taken as enough.

## Step 1: API (`api/`)

- Models, with their Atlas migration:
  - `enrollments` (user, course, unique per pair)
  - `lesson_completions` (enrollment, lesson, unique per pair), cascading
    with the enrollment and the lesson.
- Endpoints, all behind `RequireAuth`, none cached:
  - `GET /v1/enrollments`: the caller's enrollments in courses still in the
    catalog, newest first, each with `lessonsDone` and `progress`.
  - `PUT /v1/courses/:id/enrollment`: enroll; 201 when new, 200 when the
    member already was.
  - `PUT /v1/courses/:id/lessons/:code/completion`: mark lesson `2.4` done
    and return the enrollment with its new progress; 409 when not enrolled.
    Lessons are addressed by code, as the syllabus shows them, since the
    catalog's public ids are never row uuids.
- Fix: `GET /v1/courses/:id` read the caller as a visitor even with a token,
  since it looked `user_id` up as a string.

## Step 2: App (`app/`)

- `fetchEnrollments` in `src/lib/enrollments.ts`, with the session's token.
- The members' catalog reads progress from it: an enrolled course shows its
  bar, 0% included, and "Unenrolled" hides every enrolled course. A failed
  request leaves the cards without progress rather than failing the page.

## Step 3: Enroll on the course page (`app/`)

- The course page reads the member's enrollment
  (`GET /v1/courses/:id/enrollment`, a 404 meaning not enrolled) and, until
  it knows, holds the button's place empty so it never offers Enroll to
  someone already enrolled.
- Not enrolled: an "Enroll →" button at the right of the header, as in the
  v9 design, which `PUT`s the enrollment. A failed
  enrollment says so beside the button; a failed read offers Enroll anyway,
  since enrolling again is a no-op.
- Enrolled: the stats row opens with Progress, lessons done of the course's,
  its percentage and one bar segment per lesson. The design's other enrolled
  stats (points, vs par, calibration, next review) have no data yet.
- Enrolling drops the shared `GET /v1/enrollments` request, so the catalog
  shows the new enrollment when the member goes back to it.

## Step 4: The enrollment rides with the course

The course page made two requests, the course and then the enrollment, and
held the button's place empty between them.

- API: `GET /v1/courses/:id` adds `enrollment` for a signed-in caller who is
  enrolled. The course still comes from the cache; the enrollment is read
  each time and never cached. A member's response is `private, no-cache`.
- `GET /v1/courses/:id/enrollment` is deprecated, kept until the app reads
  the new field, then removed.
- App: the course page reads the enrollment from the course, and after
  enrolling writes the answer into its copy of it.

## Step 5: The enrollments ride with the catalog

The members' catalog made two requests too, the catalog and then
`GET /v1/enrollments`, and showed no progress until the second answered.

- API: `GET /v1/catalog` takes an optional token and adds `enrollments` for
  a signed-in caller who has any, as `/v1/enrollments` lists them: a list on
  the catalog rather than a field on each course, since a course's page
  already has an `enrollment` of its own shape. The catalog still comes from
  the cache; the enrollments never do. A member's response is
  `private, no-cache`.
- App: the catalog is fetched with the member's token and kept apart from
  the visitor's; the members' catalog reads progress from it.
- Once the app is deployed, `GET /v1/enrollments` and
  `GET /v1/courses/:id/enrollment` have no callers and go.

## Later

- The dashboard's "Continue" list still uses placeholder data.
- The design's "Resume 2.4 →" button takes the Enroll button's place once
  enrolled; it needs the lesson player to point at.
- The enrolled page doesn't mark done lessons in its syllabus, and has no
  way to unenroll, though the API serves both.
- Nothing in the app marks lessons done until the lesson player exists.

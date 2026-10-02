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

## Later

- The dashboard's "Continue" list and the course page's enrolled state
  still use placeholder data, and the course page has no Enroll button yet.
- Nothing in the app marks lessons done until the lesson player exists.

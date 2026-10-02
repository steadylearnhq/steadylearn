# Course page for enrolled members

The v9 design gives the course page a second state, once the member has
enrolled. This work builds the parts of it that have data, or can be given
some.

## What the enrolled page shows

- Header: no call to action until the lesson player exists (the design's
  "Resume 2.4 →" opens it).
- Stats row: Progress only (lessons done, percentage, a segment per lesson).
  The design's Points, Vs par, Calibration and Next review wait for data.
- Syllabus:
  - only the module holding the next lesson starts open;
  - each module's meta reads "2 of 4 done · 38 min";
  - each lesson has a checkbox that marks it done or not done;
  - done lessons are muted, and the next one is labelled "Up next".
- Side column, in place of the public panels:
  - Outcomes, "1 of 4 unlocked": each outcome is unlocked by finishing the
    lesson that teaches it, shown as "via 2.2" once unlocked, "in 3.2" before;
  - Leave a feedback: a 1–5 rating and an optional message, which the member
    can edit afterwards.
  - The design's Notes & bookmarks and Badges wait for data.
- "We also recommend: courses that build on this one", in place of
  "Before you start": courses that list this one as a prerequisite.

## Step 1: API (`api/`)

- `course_outcomes.lesson_id`, the lesson that teaches the outcome (nullable,
  set null if the lesson goes). `CourseSchema.outcomes` becomes
  `{ statement, lesson }`, `lesson` being its code or empty.
- `course_feedbacks`: one per enrollment, rating 1–5 and a message of up to
  2,000 characters. It hangs off the enrollment, as completions do, so only a
  learner taking the course can leave one.
- `PUT /v1/courses/:id/feedback` sets the caller's feedback and returns the
  enrollment; 409 when not enrolled, 400 for a bad rating or message.
- The enrollment (`CourseEnrollmentSchema`) carries the member's `feedback`.
- `CourseSchema.followUps`: slugs of courses in the catalog that list this
  one as a prerequisite, in catalog order.
- The course cache key's version is bumped, since the course changes shape.
- Data migration: Replication & consensus outcomes link to 2.2, 3.2, 4.2 and
  2.3 (the design says 2.4, but in the seed that is Sloppy quorums and 2.3 is
  Sizing replicated storage); Distributed transactions and CRDTs and
  local-first list it as a prerequisite, giving it its follow-ups.

## Step 2: App (`app/`)

- The enrolled syllabus, side column and recommendations as above.
- Checkboxes call `PUT`/`DELETE /v1/courses/:id/lessons/:code/completion`;
  the feedback dialog calls `PUT /v1/courses/:id/feedback`. Each writes the
  returned enrollment into the page's course and drops the shared copies.

## Later

- "Resume →" with the lesson player; Notes & bookmarks; Badges; the other
  enrolled stats; a "related" kind of recommendation.
- Rating and enrolled counts on the public page, from the feedback.

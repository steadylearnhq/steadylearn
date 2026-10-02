-- Link each Replication & consensus outcome to the lesson that teaches it,
-- addressed by module and lesson position as the syllabus numbers them. The
-- design ties the last outcome to 2.4, but in this course that is Sloppy
-- quorums; 2.3, Sizing replicated storage, is the lesson that teaches it.
UPDATE "course_outcomes" o
SET "lesson_id" = l."id"
FROM (VALUES
  ('replication-consensus', 1, 2, 2),
  ('replication-consensus', 2, 3, 2),
  ('replication-consensus', 3, 4, 2),
  ('replication-consensus', 4, 2, 3)
) AS v(course, outcome, module, lesson)
JOIN "courses" c ON c."slug" = v.course
JOIN "course_modules" m ON m."course_id" = c."id" AND m."position" = v.module AND m."deleted_at" IS NULL
JOIN "lessons" l ON l."module_id" = m."id" AND l."position" = v.lesson AND l."deleted_at" IS NULL
WHERE o."course_id" = c."id" AND o."position" = v.outcome AND o."deleted_at" IS NULL;

-- The design recommends these after Replication & consensus, as next steps:
-- each takes it as a prerequisite.
INSERT INTO "course_prerequisites" ("id", "course_id", "prerequisite_id", "position", "optional")
SELECT gen_random_uuid(), c."id", p."id", v.position, v.optional
FROM (VALUES
  ('distributed-transactions', 'replication-consensus', 1, false),
  ('crdts-local-first', 'replication-consensus', 1, false)
) AS v(course, prerequisite, position, optional)
JOIN "courses" c ON c."slug" = v.course
JOIN "courses" p ON p."slug" = v.prerequisite;

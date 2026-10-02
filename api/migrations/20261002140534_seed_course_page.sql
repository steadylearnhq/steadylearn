-- Seed the copy a course's own page shows beyond its catalog listing. Only
-- Replication & consensus has it so far; the page leaves a section out while a
-- course has nothing for it, and each course's copy ships as a migration like
-- this one when it is written.

UPDATE "courses" SET
  "overview" = 'How replicated systems agree on what "latest" means, and the specific ways that agreement breaks.',
  "assumes" = 'assumes basic networking'
WHERE "slug" = 'replication-consensus';

UPDATE "course_break_its" bi SET "description" = v.description, "par" = v.par
FROM (VALUES
  ('replication-consensus', 'Lost write', 'Get an acknowledged write to vanish', 4),
  ('replication-consensus', 'Stale read', 'Read old data with R + W > N', 5),
  ('replication-consensus', 'Split brain', 'Two leaders, same term', 7)
) AS v(course, name, description, par)
JOIN "courses" c ON c."slug" = v.course
WHERE bi."course_id" = c."id" AND bi."name" = v.name;

INSERT INTO "course_requirements" ("id", "course_id", "position", "title", "detail")
SELECT gen_random_uuid(), c."id", v.position, v.title, v.detail
FROM (VALUES
  ('replication-consensus', 1, 'Networks drop and reorder messages', 'You know a request can time out even though the server applied it.'),
  ('replication-consensus', 2, 'What a write acknowledgement means', 'You can say when a client is told "done" and what has been persisted at that point.'),
  ('replication-consensus', 3, 'Basic key-value APIs', 'Get, put and compare-and-set, and what each returns on conflict.'),
  ('replication-consensus', 4, 'Reading pseudocode', 'Lessons show algorithms as short pseudocode, not a specific language.')
) AS v(course, position, title, detail)
JOIN "courses" c ON c."slug" = v.course;

INSERT INTO "course_outcomes" ("id", "course_id", "position", "statement")
SELECT gen_random_uuid(), c."id", v.position, v.statement
FROM (VALUES
  ('replication-consensus', 1, 'Size R and W for a given N and say what each choice costs'),
  ('replication-consensus', 2, 'Explain why Raft cannot elect two leaders in one term'),
  ('replication-consensus', 3, 'Spot a missing fencing token in a lock-based design'),
  ('replication-consensus', 4, 'Estimate replicated storage with a defensible range')
) AS v(course, position, statement)
JOIN "courses" c ON c."slug" = v.course;

INSERT INTO "course_prerequisites" ("id", "course_id", "prerequisite_id", "position", "optional")
SELECT gen_random_uuid(), c."id", p."id", v.position, v.optional
FROM (VALUES
  ('replication-consensus', 'partitioning-rebalancing', 1, false),
  ('replication-consensus', 'failure-detection-gossip', 2, false),
  ('replication-consensus', 'clocks-time-ordering', 3, true)
) AS v(course, prerequisite, position, optional)
JOIN "courses" c ON c."slug" = v.course
JOIN "courses" p ON p."slug" = v.prerequisite;

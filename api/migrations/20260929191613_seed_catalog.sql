-- Seed the launch catalog. There is no authoring tool yet, so the catalog ships
-- as data: a change to a course is a new migration like this one.
--
-- Rows reference each other by slug and position and get their uuids here, so
-- the file reads as the catalog itself. The staging tables are plain temp
-- tables, dropped at the end, rather than ON COMMIT DROP: the test harness runs
-- migrations through psql outside a transaction, where those would vanish as
-- soon as they were created.

INSERT INTO "domains" ("id", "slug", "name", "position") VALUES
  (gen_random_uuid(), 'dist', 'Distributed systems', 1),
  (gen_random_uuid(), 'db', 'Databases', 2),
  (gen_random_uuid(), 'comp', 'Compilers', 3),
  (gen_random_uuid(), 'crypto', 'Cryptography', 4),
  (gen_random_uuid(), 'ml', 'Inference', 5),
  (gen_random_uuid(), 'prob', 'Probability', 6);

-- Courses published in September are within the "new" window at launch.
INSERT INTO "courses" ("id", "domain_id", "slug", "position", "title", "description", "level", "duration_minutes", "is_free", "syllabus_public", "published_at")
SELECT gen_random_uuid(), d."id", v.slug, v.position, v.title, v.description, v.level, v.minutes, v.is_free, v.syllabus_public, v.published_at::timestamptz
FROM (VALUES
  ('dist', 'replication-consensus', 1, 'Replication & consensus', 'Quorums, elections and leases, and the trade-offs behind each one.', 'advanced', 198, false, true, '2026-06-01'),
  ('dist', 'clocks-time-ordering', 2, 'Clocks, time and ordering', 'Lamport clocks, vector clocks, hybrid logical clocks and TrueTime.', 'advanced', 240, false, false, '2026-06-01'),
  ('dist', 'partitioning-rebalancing', 3, 'Partitioning and rebalancing', 'Hash vs range partitioning, hot keys, and moving data without downtime.', 'intermediate', 180, false, false, '2026-06-01'),
  ('dist', 'distributed-transactions', 4, 'Distributed transactions', 'Two-phase commit, sagas, Percolator and Calvin, and when to avoid them.', 'advanced', 360, false, false, '2026-06-01'),
  ('dist', 'failure-detection-gossip', 5, 'Failure detection and gossip', 'Phi-accrual detectors, SWIM, and why "is it down?" has no crisp answer.', 'intermediate', 150, false, false, '2026-06-01'),
  ('dist', 'crdts-local-first', 6, 'CRDTs and local-first', 'Merge functions that always converge, and what they cost in metadata.', 'advanced', 270, false, false, '2026-09-15'),
  ('db', 'storage-engines', 1, 'Storage engines', 'B-trees and LSM trees from the page up: write amplification, compaction, recovery.', 'advanced', 420, false, false, '2026-06-01'),
  ('db', 'isolation-honestly', 2, 'Isolation, honestly', 'What each isolation level actually permits, shown as anomalies you can trigger.', 'intermediate', 180, false, false, '2026-06-01'),
  ('comp', 'compilers-for-practitioners', 1, 'Compilers for practitioners', 'SSA, inlining and register allocation, read through the lens of your hot loop.', 'intermediate', 480, false, false, '2026-06-01'),
  ('crypto', 'applied-cryptography', 1, 'Applied cryptography', 'Primitives, protocols, and the misuse patterns that show up in code review.', 'intermediate', 300, false, false, '2026-06-01'),
  ('ml', 'serving-large-models', 1, 'Serving large models', 'Batching, KV caches, paged attention and the unit economics of a token.', 'advanced', 300, false, false, '2026-09-15'),
  ('ml', 'quantization-in-practice', 2, 'Quantization in practice', 'What you lose at int8 and int4, and how to measure it before users do.', 'advanced', 90, false, false, '2026-06-01'),
  ('prob', 'tail-latency-queueing', 1, 'Tail latency and queueing', 'Little''s law, fan-out, hedged requests and why p99 lies about p99.9.', 'intermediate', 180, false, false, '2026-06-01'),
  ('prob', 'estimation', 2, 'Estimation', 'Back-of-envelope numbers you can defend, with ranges and stated confidence.', 'foundational', 90, true, false, '2026-06-01')
) AS v(domain, slug, position, title, description, level, minutes, is_free, syllabus_public, published_at)
JOIN "domains" d ON d."slug" = v.domain;

INSERT INTO "course_break_its" ("id", "course_id", "position", "name")
SELECT gen_random_uuid(), c."id", v.position, v.name
FROM (VALUES
  ('replication-consensus', 1, 'Lost write'),
  ('replication-consensus', 2, 'Stale read'),
  ('replication-consensus', 3, 'Split brain'),
  ('clocks-time-ordering', 1, 'Causality violation'),
  ('clocks-time-ordering', 2, 'Skewed reorder'),
  ('clocks-time-ordering', 3, 'Skipped commit wait'),
  ('partitioning-rebalancing', 1, 'Hot partition'),
  ('partitioning-rebalancing', 2, 'Lost key on move'),
  ('distributed-transactions', 1, 'Blocked coordinator'),
  ('distributed-transactions', 2, 'Orphaned lock'),
  ('distributed-transactions', 3, 'Half-applied saga'),
  ('distributed-transactions', 4, 'Lost compensation'),
  ('distributed-transactions', 5, 'Heuristic abort'),
  ('failure-detection-gossip', 1, 'False-positive storm'),
  ('failure-detection-gossip', 2, 'Zombie member'),
  ('crdts-local-first', 1, 'Tombstone bloat'),
  ('crdts-local-first', 2, 'Interleaved edits'),
  ('crdts-local-first', 3, 'Resurrected delete'),
  ('storage-engines', 1, 'Torn page'),
  ('storage-engines', 2, 'Compaction stall'),
  ('storage-engines', 3, 'Lost WAL tail'),
  ('storage-engines', 4, 'Read amplification'),
  ('isolation-honestly', 1, 'Dirty read'),
  ('isolation-honestly', 2, 'Lost update'),
  ('isolation-honestly', 3, 'Write skew'),
  ('isolation-honestly', 4, 'Phantom read'),
  ('isolation-honestly', 5, 'Read skew'),
  ('compilers-for-practitioners', 1, 'Aliasing miscompile'),
  ('compilers-for-practitioners', 2, 'Spill storm'),
  ('applied-cryptography', 1, 'Nonce reuse'),
  ('applied-cryptography', 2, 'Padding oracle'),
  ('applied-cryptography', 3, 'Timing leak'),
  ('applied-cryptography', 4, 'Key confusion'),
  ('serving-large-models', 1, 'Cache thrash'),
  ('serving-large-models', 2, 'Head-of-line batch'),
  ('quantization-in-practice', 1, 'Outlier collapse'),
  ('tail-latency-queueing', 1, 'Retry storm'),
  ('tail-latency-queueing', 2, 'Fan-out tail'),
  ('tail-latency-queueing', 3, 'Coordinated omission'),
  ('estimation', 1, 'Unit slip')
) AS v(course, position, name)
JOIN "courses" c ON c."slug" = v.course;

-- A module with a lesson count has no written lessons yet: it gets that many
-- placeholder lessons below. Those courses keep their syllabus private, so the
-- placeholders are never shown before real ones replace them.
CREATE TEMP TABLE seed_modules (course text, position int, title text, lesson_count int);
INSERT INTO seed_modules VALUES
  ('replication-consensus', 1, 'Why replicate', NULL),
  ('replication-consensus', 2, 'Quorums', NULL),
  ('replication-consensus', 3, 'Consensus', NULL),
  ('replication-consensus', 4, 'Time and leases', NULL),
  ('clocks-time-ordering', 1, 'Physical clocks and drift', 2),
  ('clocks-time-ordering', 2, 'Lamport and vector clocks', 3),
  ('clocks-time-ordering', 3, 'Hybrid logical clocks', 2),
  ('clocks-time-ordering', 4, 'TrueTime and commit wait', 2),
  ('partitioning-rebalancing', 1, 'Hash vs range', 3),
  ('partitioning-rebalancing', 2, 'Hot keys', 2),
  ('partitioning-rebalancing', 3, 'Rebalancing online', 3),
  ('distributed-transactions', 1, 'Atomic commit', 4),
  ('distributed-transactions', 2, 'Two-phase commit', 4),
  ('distributed-transactions', 3, 'Sagas', 3),
  ('distributed-transactions', 4, 'Deterministic databases', 3),
  ('failure-detection-gossip', 1, 'Timeouts', 2),
  ('failure-detection-gossip', 2, 'Phi-accrual detection', 2),
  ('failure-detection-gossip', 3, 'Gossip and SWIM', 3),
  ('crdts-local-first', 1, 'Convergence', 3),
  ('crdts-local-first', 2, 'Counters and sets', 4),
  ('crdts-local-first', 3, 'Sequences and text', 3),
  ('storage-engines', 1, 'Pages and B-trees', 5),
  ('storage-engines', 2, 'LSM trees', 5),
  ('storage-engines', 3, 'Compaction', 3),
  ('storage-engines', 4, 'Recovery', 2),
  ('isolation-honestly', 1, 'Anomalies', 3),
  ('isolation-honestly', 2, 'Snapshot isolation', 3),
  ('isolation-honestly', 3, 'Serializability', 2),
  ('compilers-for-practitioners', 1, 'IR and SSA', 4),
  ('compilers-for-practitioners', 2, 'Optimization passes', 5),
  ('compilers-for-practitioners', 3, 'Register allocation', 4),
  ('compilers-for-practitioners', 4, 'Reading the output', 3),
  ('applied-cryptography', 1, 'Primitives', 3),
  ('applied-cryptography', 2, 'Authenticated encryption', 3),
  ('applied-cryptography', 3, 'Protocols', 3),
  ('applied-cryptography', 4, 'Misuse in review', 2),
  ('serving-large-models', 1, 'Batching', 3),
  ('serving-large-models', 2, 'KV caches', 3),
  ('serving-large-models', 3, 'Paged attention', 3),
  ('serving-large-models', 4, 'Cost per token', 3),
  ('quantization-in-practice', 1, 'Number formats', 2),
  ('quantization-in-practice', 2, 'Measuring the loss', 3),
  ('tail-latency-queueing', 1, 'Little''s law', 3),
  ('tail-latency-queueing', 2, 'Fan-out', 3),
  ('tail-latency-queueing', 3, 'Hedged requests', 3),
  ('estimation', 1, 'Orders of magnitude', 3),
  ('estimation', 2, 'Ranges and confidence', 3);

-- Steps are space-separated kinds, in the order the lesson runs them.
CREATE TEMP TABLE seed_lessons (course text, module int, position int, title text, minutes int, steps text);
INSERT INTO seed_lessons VALUES
  ('replication-consensus', 1, 1, 'Failure is the normal case', 9, 'watch read'),
  ('replication-consensus', 1, 2, 'The write path', 14, 'read build bet'),
  ('replication-consensus', 1, 3, 'Lose an acknowledged write', 16, 'watch break postmortem'),
  ('replication-consensus', 2, 1, 'Leaderless replication', 11, 'watch read bet'),
  ('replication-consensus', 2, 2, 'Quorums and R + W > N', 18, 'watch read bet postmortem'),
  ('replication-consensus', 2, 3, 'Sizing replicated storage', 15, 'watch read range bet'),
  ('replication-consensus', 2, 4, 'Sloppy quorums', 14, 'watch read break'),
  ('replication-consensus', 3, 1, 'Why consensus is hard', 12, 'watch read'),
  ('replication-consensus', 3, 2, 'Leader election', 24, 'watch read break bet postmortem'),
  ('replication-consensus', 3, 3, 'Log matching', 16, 'read trace bet'),
  ('replication-consensus', 4, 1, 'Clocks you can''t trust', 12, 'watch read bet'),
  ('replication-consensus', 4, 2, 'Fencing tokens', 18, 'read trace bet postmortem');

INSERT INTO "course_modules" ("id", "course_id", "position", "title")
SELECT gen_random_uuid(), c."id", sm.position, sm.title
FROM seed_modules sm
JOIN "courses" c ON c."slug" = sm.course;

INSERT INTO "lessons" ("id", "module_id", "position", "title", "minutes")
SELECT gen_random_uuid(), m."id", sl.position, sl.title, sl.minutes
FROM seed_lessons sl
JOIN "courses" c ON c."slug" = sl.course
JOIN "course_modules" m ON m."course_id" = c."id" AND m."position" = sl.module;

INSERT INTO "lesson_steps" ("id", "lesson_id", "position", "kind")
SELECT gen_random_uuid(), l."id", s.position, s.kind
FROM seed_lessons sl
JOIN "courses" c ON c."slug" = sl.course
JOIN "course_modules" m ON m."course_id" = c."id" AND m."position" = sl.module
JOIN "lessons" l ON l."module_id" = m."id" AND l."position" = sl.position
CROSS JOIN LATERAL unnest(string_to_array(sl.steps, ' ')) WITH ORDINALITY AS s(kind, position);

-- Placeholders split the course's length evenly across its lessons.
INSERT INTO "lessons" ("id", "module_id", "position", "title", "minutes")
SELECT gen_random_uuid(), m."id", n, format('Lesson %s.%s', sm.position, n), GREATEST(1, round(c."duration_minutes"::numeric / totals.lessons))
FROM seed_modules sm
JOIN "courses" c ON c."slug" = sm.course
JOIN "course_modules" m ON m."course_id" = c."id" AND m."position" = sm.position
JOIN (SELECT course, sum(lesson_count) AS lessons FROM seed_modules GROUP BY course) totals ON totals.course = sm.course
CROSS JOIN LATERAL generate_series(1, sm.lesson_count) AS n
WHERE sm.lesson_count IS NOT NULL;

DROP TABLE seed_modules;
DROP TABLE seed_lessons;

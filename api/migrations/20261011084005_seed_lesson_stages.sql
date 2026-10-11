-- Give every lesson the stages its lesson page walks through, made from the
-- steps the syllabus already lists, so each step now sits on the stage it
-- happens in:
--
--   1. learn, with the lesson's watch and read steps. A lesson with neither,
--      such as the placeholder lessons of courses not yet written, reads.
--   2. one stage per other step, in the lesson's order: interactive for a lab
--      (build, trace, range, break, postmortem), questions for a bet.
--   3. review, with no steps.
--
-- "watch read break bet postmortem" becomes learn {watch,read}, interactive
-- {break}, questions {bet}, interactive {postmortem}, review.
--
-- Content is a placeholder for every stage. To replace it, a later migration
-- addresses the stage by course slug, module position, lesson position and
-- stage position, the way the catalog seeds do:
--
--   * text: UPDATE the stage's content;
--   * a real lab: set its content's component to a key the app registers;
--   * another stage, such as a second learn after a lab: INSERT it at a
--     position between its neighbours, since positions are only compared.

INSERT INTO "lesson_stages" ("id", "lesson_id", "position", "kind", "steps", "content")
SELECT gen_random_uuid(), l."id", 1, 'learn',
  COALESCE((
    SELECT array_agg(ls."kind" ORDER BY ls."position")
    FROM "lesson_steps" ls
    WHERE ls."lesson_id" = l."id" AND ls."deleted_at" IS NULL AND ls."kind" IN ('watch', 'read')
  ), '{read}'),
  '{}'
FROM "lessons" l
WHERE l."deleted_at" IS NULL;

INSERT INTO "lesson_stages" ("id", "lesson_id", "position", "kind", "steps", "content")
SELECT gen_random_uuid(), ls."lesson_id",
  1 + row_number() OVER (PARTITION BY ls."lesson_id" ORDER BY ls."position"),
  CASE ls."kind" WHEN 'bet' THEN 'questions' ELSE 'interactive' END,
  ARRAY[ls."kind"],
  CASE ls."kind" WHEN 'bet' THEN '{"questions": []}' ELSE '{"title": "Lab", "component": "placeholder"}' END::jsonb
FROM "lesson_steps" ls
JOIN "lessons" l ON l."id" = ls."lesson_id" AND l."deleted_at" IS NULL
WHERE ls."deleted_at" IS NULL AND ls."kind" NOT IN ('watch', 'read');

INSERT INTO "lesson_stages" ("id", "lesson_id", "position", "kind", "steps", "content")
SELECT gen_random_uuid(), st."lesson_id", max(st."position") + 1, 'review', '{}', '{"takeaways": []}'
FROM "lesson_stages" st
GROUP BY st."lesson_id";

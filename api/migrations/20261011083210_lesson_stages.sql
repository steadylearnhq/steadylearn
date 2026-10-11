-- Create "lesson_stages" table
CREATE TABLE "lesson_stages" (
  "id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" timestamptz NULL,
  "lesson_id" uuid NOT NULL,
  "position" bigint NOT NULL,
  "kind" text NOT NULL,
  "steps" text[] NOT NULL DEFAULT '{}',
  "content" jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY ("id"),
  CONSTRAINT "fk_lessons_stages" FOREIGN KEY ("lesson_id") REFERENCES "lessons" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT "chk_lesson_stages_kind" CHECK (kind = ANY (ARRAY['learn'::text, 'interactive'::text, 'questions'::text, 'review'::text])),
  CONSTRAINT "chk_lesson_stages_steps" CHECK (((kind = 'learn'::text) AND (((steps = '{watch}'::text[]) OR (steps = '{read}'::text[])) OR (steps = '{watch,read}'::text[]))) OR ((kind = 'interactive'::text) AND ((((steps = '{build}'::text[]) OR (steps = '{trace}'::text[])) OR (steps = '{range}'::text[])) OR (steps = '{break}'::text[]))) OR ((kind = 'questions'::text) AND (steps = '{bet}'::text[])) OR ((kind = 'review'::text) AND ((steps = '{}'::text[]) OR (steps = '{postmortem}'::text[]))))
);
-- Create index "idx_lesson_stages_lesson_id" to table: "lesson_stages"
CREATE INDEX "idx_lesson_stages_lesson_id" ON "lesson_stages" ("lesson_id");
-- Create index "idx_lesson_stages_lesson_position" to table: "lesson_stages"
CREATE UNIQUE INDEX "idx_lesson_stages_lesson_position" ON "lesson_stages" ("lesson_id", "position") WHERE (deleted_at IS NULL);

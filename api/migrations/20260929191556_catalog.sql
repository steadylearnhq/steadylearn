-- Create "domains" table
CREATE TABLE "domains" (
  "id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" timestamptz NULL,
  "slug" text NOT NULL,
  "name" text NOT NULL,
  "position" bigint NOT NULL,
  PRIMARY KEY ("id")
);
-- Create index "idx_domains_slug" to table: "domains"
CREATE UNIQUE INDEX "idx_domains_slug" ON "domains" ("slug");
-- Create "courses" table
CREATE TABLE "courses" (
  "id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" timestamptz NULL,
  "slug" text NOT NULL,
  "domain_id" uuid NOT NULL,
  "position" bigint NOT NULL,
  "title" text NOT NULL,
  "description" text NOT NULL,
  "level" text NOT NULL,
  "duration_minutes" bigint NOT NULL,
  "is_free" boolean NOT NULL DEFAULT false,
  "syllabus_public" boolean NOT NULL DEFAULT false,
  "published_at" timestamptz NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "fk_courses_domain" FOREIGN KEY ("domain_id") REFERENCES "domains" ("id") ON UPDATE NO ACTION ON DELETE RESTRICT,
  CONSTRAINT "chk_courses_duration_minutes" CHECK (duration_minutes > 0),
  CONSTRAINT "chk_courses_level" CHECK (level = ANY (ARRAY['foundational'::text, 'intermediate'::text, 'advanced'::text]))
);
-- Create index "idx_courses_domain_id" to table: "courses"
CREATE INDEX "idx_courses_domain_id" ON "courses" ("domain_id");
-- Create index "idx_courses_slug" to table: "courses"
CREATE UNIQUE INDEX "idx_courses_slug" ON "courses" ("slug");
-- Create "course_break_its" table
CREATE TABLE "course_break_its" (
  "id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" timestamptz NULL,
  "course_id" uuid NOT NULL,
  "position" bigint NOT NULL,
  "name" text NOT NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "fk_courses_break_its" FOREIGN KEY ("course_id") REFERENCES "courses" ("id") ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create index "idx_course_break_its_course_id" to table: "course_break_its"
CREATE INDEX "idx_course_break_its_course_id" ON "course_break_its" ("course_id");
-- Create "course_modules" table
CREATE TABLE "course_modules" (
  "id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" timestamptz NULL,
  "course_id" uuid NOT NULL,
  "position" bigint NOT NULL,
  "title" text NOT NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "fk_courses_modules" FOREIGN KEY ("course_id") REFERENCES "courses" ("id") ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create index "idx_course_modules_course_id" to table: "course_modules"
CREATE INDEX "idx_course_modules_course_id" ON "course_modules" ("course_id");
-- Create "lessons" table
CREATE TABLE "lessons" (
  "id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" timestamptz NULL,
  "module_id" uuid NOT NULL,
  "position" bigint NOT NULL,
  "title" text NOT NULL,
  "minutes" bigint NOT NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "fk_course_modules_lessons" FOREIGN KEY ("module_id") REFERENCES "course_modules" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT "chk_lessons_minutes" CHECK (minutes > 0)
);
-- Create index "idx_lessons_module_id" to table: "lessons"
CREATE INDEX "idx_lessons_module_id" ON "lessons" ("module_id");
-- Create "lesson_steps" table
CREATE TABLE "lesson_steps" (
  "id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" timestamptz NULL,
  "lesson_id" uuid NOT NULL,
  "position" bigint NOT NULL,
  "kind" text NOT NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "fk_lessons_steps" FOREIGN KEY ("lesson_id") REFERENCES "lessons" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT "chk_lesson_steps_kind" CHECK (kind = ANY (ARRAY['watch'::text, 'read'::text, 'build'::text, 'trace'::text, 'range'::text, 'bet'::text, 'break'::text, 'postmortem'::text]))
);
-- Create index "idx_lesson_steps_lesson_id" to table: "lesson_steps"
CREATE INDEX "idx_lesson_steps_lesson_id" ON "lesson_steps" ("lesson_id");

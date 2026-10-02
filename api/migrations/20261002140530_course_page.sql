-- Modify "course_break_its" table
ALTER TABLE "course_break_its" ADD CONSTRAINT "chk_course_break_its_par" CHECK (par > 0), ADD COLUMN "description" text NOT NULL DEFAULT '', ADD COLUMN "par" bigint NULL;
-- Modify "courses" table
ALTER TABLE "courses" ADD COLUMN "overview" text NOT NULL DEFAULT '', ADD COLUMN "assumes" text NOT NULL DEFAULT '';
-- Create "course_outcomes" table
CREATE TABLE "course_outcomes" (
  "id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" timestamptz NULL,
  "course_id" uuid NOT NULL,
  "position" bigint NOT NULL,
  "statement" text NOT NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "fk_courses_outcomes" FOREIGN KEY ("course_id") REFERENCES "courses" ("id") ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create index "idx_course_outcomes_course_id" to table: "course_outcomes"
CREATE INDEX "idx_course_outcomes_course_id" ON "course_outcomes" ("course_id");
-- Create "course_prerequisites" table
CREATE TABLE "course_prerequisites" (
  "id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" timestamptz NULL,
  "course_id" uuid NOT NULL,
  "prerequisite_id" uuid NOT NULL,
  "position" bigint NOT NULL,
  "optional" boolean NOT NULL DEFAULT false,
  PRIMARY KEY ("id"),
  CONSTRAINT "fk_course_prerequisites_prerequisite" FOREIGN KEY ("prerequisite_id") REFERENCES "courses" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT "fk_courses_prerequisites" FOREIGN KEY ("course_id") REFERENCES "courses" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT "chk_course_prerequisites_other" CHECK (course_id <> prerequisite_id)
);
-- Create index "idx_course_prerequisites_course_id" to table: "course_prerequisites"
CREATE INDEX "idx_course_prerequisites_course_id" ON "course_prerequisites" ("course_id");
-- Create index "idx_course_prerequisites_prerequisite_id" to table: "course_prerequisites"
CREATE INDEX "idx_course_prerequisites_prerequisite_id" ON "course_prerequisites" ("prerequisite_id");
-- Create "course_requirements" table
CREATE TABLE "course_requirements" (
  "id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" timestamptz NULL,
  "course_id" uuid NOT NULL,
  "position" bigint NOT NULL,
  "title" text NOT NULL,
  "detail" text NOT NULL DEFAULT '',
  PRIMARY KEY ("id"),
  CONSTRAINT "fk_courses_requirements" FOREIGN KEY ("course_id") REFERENCES "courses" ("id") ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create index "idx_course_requirements_course_id" to table: "course_requirements"
CREATE INDEX "idx_course_requirements_course_id" ON "course_requirements" ("course_id");

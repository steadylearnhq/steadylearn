-- Create "enrollments" table
CREATE TABLE "enrollments" (
  "id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" timestamptz NULL,
  "user_id" uuid NOT NULL,
  "course_id" uuid NOT NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "fk_enrollments_course" FOREIGN KEY ("course_id") REFERENCES "courses" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT "fk_enrollments_user" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create index "idx_enrollments_course_id" to table: "enrollments"
CREATE INDEX "idx_enrollments_course_id" ON "enrollments" ("course_id");
-- Create index "idx_enrollments_user_course" to table: "enrollments"
CREATE UNIQUE INDEX "idx_enrollments_user_course" ON "enrollments" ("user_id", "course_id");
-- Create "lesson_completions" table
CREATE TABLE "lesson_completions" (
  "id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" timestamptz NULL,
  "enrollment_id" uuid NOT NULL,
  "lesson_id" uuid NOT NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "fk_enrollments_completions" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT "fk_lesson_completions_lesson" FOREIGN KEY ("lesson_id") REFERENCES "lessons" ("id") ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create index "idx_lesson_completions_enrollment_lesson" to table: "lesson_completions"
CREATE UNIQUE INDEX "idx_lesson_completions_enrollment_lesson" ON "lesson_completions" ("enrollment_id", "lesson_id");
-- Create index "idx_lesson_completions_lesson_id" to table: "lesson_completions"
CREATE INDEX "idx_lesson_completions_lesson_id" ON "lesson_completions" ("lesson_id");

-- Create "course_feedbacks" table
CREATE TABLE "course_feedbacks" (
  "id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" timestamptz NULL,
  "updated_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "enrollment_id" uuid NOT NULL,
  "rating" bigint NOT NULL,
  "message" text NOT NULL DEFAULT '',
  PRIMARY KEY ("id"),
  CONSTRAINT "fk_course_feedbacks_enrollment" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT "chk_course_feedbacks_rating" CHECK ((rating >= 1) AND (rating <= 5))
);
-- Create index "idx_course_feedbacks_enrollment" to table: "course_feedbacks"
CREATE UNIQUE INDEX "idx_course_feedbacks_enrollment" ON "course_feedbacks" ("enrollment_id") WHERE (deleted_at IS NULL);
-- Modify "course_outcomes" table
ALTER TABLE "course_outcomes" ADD COLUMN "lesson_id" uuid NULL, ADD CONSTRAINT "fk_course_outcomes_lesson" FOREIGN KEY ("lesson_id") REFERENCES "lessons" ("id") ON UPDATE NO ACTION ON DELETE SET NULL;
-- Create index "idx_course_outcomes_lesson_id" to table: "course_outcomes"
CREATE INDEX "idx_course_outcomes_lesson_id" ON "course_outcomes" ("lesson_id");

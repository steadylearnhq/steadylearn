-- Drop index "idx_enrollments_user_course" from table: "enrollments"
DROP INDEX "idx_enrollments_user_course";
-- Create index "idx_enrollments_user_course" to table: "enrollments"
CREATE UNIQUE INDEX "idx_enrollments_user_course" ON "enrollments" ("user_id", "course_id") WHERE (deleted_at IS NULL);
-- Drop index "idx_lesson_completions_enrollment_lesson" from table: "lesson_completions"
DROP INDEX "idx_lesson_completions_enrollment_lesson";
-- Create index "idx_lesson_completions_enrollment_lesson" to table: "lesson_completions"
CREATE UNIQUE INDEX "idx_lesson_completions_enrollment_lesson" ON "lesson_completions" ("enrollment_id", "lesson_id") WHERE (deleted_at IS NULL);

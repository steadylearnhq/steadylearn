import type { Course, Lesson } from '../data/catalog'
import { fetchCatalog, fetchCourse } from './catalog'
import type { Enrollment } from './enrollments'

/** A course the member is enrolled in, with the first lesson they haven't done when its syllabus loaded. */
export type MyCourse = {
  course: Course
  domainName: string
  enrollment: Enrollment
  finished: boolean
  next?: Lesson
}

/**
 * The member's enrollments, most recent first. The catalog carries them; each
 * course's syllabus is asked for too, for the lesson they're up to. A syllabus
 * that doesn't load only leaves that lesson out. Both requests are the shared
 * ones in `catalog.ts`, so the home page and My courses ask once between them.
 */
export async function loadMyCourses(): Promise<MyCourse[]> {
  const catalog = await fetchCatalog()
  const courses = new Map(catalog.courses.map((c) => [c.id, c]))
  const enrollments = (catalog.enrollments ?? [])
    .filter((e) => courses.has(e.courseId))
    .sort((a, b) => b.enrolledAt.localeCompare(a.enrolledAt))
  return Promise.all(
    enrollments.map(async (enrollment) => {
      const course = courses.get(enrollment.courseId)!
      const detail = await fetchCourse(course.id).catch(() => undefined)
      const done = new Set(detail?.enrollment?.completedLessons)
      return {
        course,
        domainName: catalog.domains.find((d) => d.id === course.domain)?.name ?? '',
        enrollment,
        finished: enrollment.progress === 100,
        next: detail?.modules.flatMap((m) => m.lessons ?? []).find((l) => !done.has(l.code)),
      }
    }),
  )
}

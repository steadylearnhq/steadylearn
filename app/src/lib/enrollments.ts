import { apiPut } from './api'
import { accessToken } from './auth'
import { forgetEnrollment } from './catalog'

/** A course the member is enrolled in, and how far through it they are; the catalog lists them. */
export type Enrollment = {
  courseId: string
  enrolledAt: string
  lessonsDone: number
  /** Lessons done as a percentage, rounded down, so 100 means finished. */
  progress: number
}

/** The member's enrollment in one course, with the codes of the lessons they've done, in syllabus order; it comes with the course. */
export type CourseEnrollment = Enrollment & { completedLessons: string[] }

/** Enrolls the signed-in member in a course; enrolling again just returns the enrollment. */
export async function enroll(courseId: string): Promise<CourseEnrollment> {
  const path = `/v1/courses/${encodeURIComponent(courseId)}/enrollment`
  const enrollment = await apiPut<CourseEnrollment>(path, await accessToken())
  forgetEnrollment(courseId)
  return enrollment
}

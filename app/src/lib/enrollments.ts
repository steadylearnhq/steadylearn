import { apiGet, apiPut } from './api'
import { accessToken } from './auth'
import { forgetMemberCourse } from './catalog'

/** A course the member is enrolled in, and how far through it they are. */
export type Enrollment = {
  courseId: string
  enrolledAt: string
  lessonsDone: number
  /** Lessons done as a percentage, rounded down, so 100 means finished. */
  progress: number
}

/** The member's enrollment in one course, with the codes of the lessons they've done, in syllabus order; it comes with the course. */
export type CourseEnrollment = Enrollment & { completedLessons: string[] }

// One request per page load, as for the catalog, kept per member so signing in
// as someone else doesn't serve the last member's. A failed request is
// forgotten so the next call tries again, and so is any request an enrollment
// change has made stale.

let enrollments: { userId: string; request: Promise<Enrollment[]> } | undefined

/** The signed-in member's enrollments; `userId` is theirs, and only keys the shared request. */
export function fetchEnrollments(userId: string): Promise<Enrollment[]> {
  if (enrollments?.userId !== userId) {
    const request = accessToken()
      .then((token) => apiGet<Enrollment[]>('/v1/enrollments', token))
      .catch((error: unknown) => {
        if (enrollments?.request === request) enrollments = undefined
        throw error
      })
    enrollments = { userId, request }
  }
  return enrollments.request
}

/** Enrolls the signed-in member in a course; enrolling again just returns the enrollment. */
export async function enroll(courseId: string): Promise<CourseEnrollment> {
  const path = `/v1/courses/${encodeURIComponent(courseId)}/enrollment`
  const enrollment = await apiPut<CourseEnrollment>(path, await accessToken())
  enrollments = undefined
  forgetMemberCourse(courseId)
  return enrollment
}

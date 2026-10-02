import { ApiError, apiGet, apiPut } from './api'
import { accessToken } from './auth'

/** A course the member is enrolled in, and how far through it they are. */
export type Enrollment = {
  courseId: string
  enrolledAt: string
  lessonsDone: number
  /** Lessons done as a percentage, rounded down, so 100 means finished. */
  progress: number
}

/** The member's enrollment in one course, with the codes of the lessons they've done, in syllabus order. */
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

const enrollmentPath = (courseId: string) => `/v1/courses/${encodeURIComponent(courseId)}/enrollment`

/**
 * The signed-in member's enrollment in a course, or `null` when they aren't
 * enrolled. Not shared: it is read only by the course's own page, which is
 * where it changes.
 */
export async function fetchEnrollment(courseId: string): Promise<CourseEnrollment | null> {
  try {
    return await apiGet<CourseEnrollment>(enrollmentPath(courseId), await accessToken())
  } catch (error) {
    // A course that isn't in the catalog is a 404 too; its page shows it as not found anyway.
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

/** Enrolls the signed-in member in a course; enrolling again just returns the enrollment. */
export async function enroll(courseId: string): Promise<CourseEnrollment> {
  const enrollment = await apiPut<CourseEnrollment>(enrollmentPath(courseId), await accessToken())
  enrollments = undefined
  return enrollment
}

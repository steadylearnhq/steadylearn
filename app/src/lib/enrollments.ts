import { apiGet } from './api'
import { accessToken } from './auth'

/** A course the member is enrolled in, and how far through it they are. */
export type Enrollment = {
  courseId: string
  enrolledAt: string
  lessonsDone: number
  /** Lessons done as a percentage, rounded down, so 100 means finished. */
  progress: number
}

// One request per page load, as for the catalog, kept per member so signing in
// as someone else doesn't serve the last member's. A failed request is
// forgotten so the next call tries again.

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

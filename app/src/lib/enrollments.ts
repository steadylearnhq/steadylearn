import { apiDelete, apiPut } from './api'
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

/** What the member thinks of a course they're taking: a rating from 1 to 5 and an optional message. */
export type Feedback = { rating: number; message: string }

/**
 * The member's enrollment in one course, with the codes of the lessons they've
 * done, in syllabus order, and their feedback once they've left some; it comes
 * with the course.
 */
export type CourseEnrollment = Enrollment & { completedLessons: string[]; feedback?: Feedback }

const coursePath = (courseId: string) => `/v1/courses/${encodeURIComponent(courseId)}`

// Every change answers with the enrollment as it now stands, and drops the
// shared copies that carried the old one.
const change = async (courseId: string, send: (token?: string) => Promise<CourseEnrollment>) => {
  const enrollment = await send(await accessToken())
  forgetEnrollment(courseId)
  return enrollment
}

/** Enrolls the signed-in member in a course; enrolling again just returns the enrollment. */
export const enroll = (courseId: string) =>
  change(courseId, (token) => apiPut<CourseEnrollment>(`${coursePath(courseId)}/enrollment`, token))

/** Marks a lesson of a course the member is taking done, or not done. */
export const setLessonDone = (courseId: string, code: string, done: boolean) =>
  change(courseId, (token) => {
    const path = `${coursePath(courseId)}/lessons/${encodeURIComponent(code)}/completion`
    return done ? apiPut<CourseEnrollment>(path, token) : apiDelete<CourseEnrollment>(path, token)
  })

/** Leaves, or replaces, the member's feedback on a course they're taking. */
export const leaveFeedback = (courseId: string, feedback: Feedback) =>
  change(courseId, (token) => apiPut<CourseEnrollment>(`${coursePath(courseId)}/feedback`, token, feedback))

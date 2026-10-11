import type { LessonStepKey } from '../data/lessonSteps'
import { apiGet } from './api'
import { session } from './auth'
import { shared } from './catalog'

/** Content of a learn stage. A length that isn't set yet is left out. */
export type LearnContent = {
  watch?: { minutes?: number }
  read?: { minutes?: number }
}

/** Content of a lab: `component` is the key of the lab the app draws, `placeholder` until a real one exists. */
export type InteractiveContent = { title?: string; component?: string }

/** Content of a questions stage. The questions' own shape comes with the first real ones. */
export type QuestionsContent = { questions?: unknown[] }

/** Content of the review that ends a lesson. */
export type ReviewContent = { takeaways?: string[] }

/**
 * One screen of a lesson. Its steps are the syllabus steps it covers: a learn
 * stage with both watch and read lets the member pick one, a lab is one
 * interactive step, and a review has none. Kinds can repeat, so a stage is
 * named by its place in the lesson, never by its kind.
 */
export type LessonStage =
  | { kind: 'learn'; steps: Extract<LessonStepKey, 'watch' | 'read'>[]; content: LearnContent }
  | { kind: 'interactive'; steps: Exclude<LessonStepKey, 'watch' | 'read' | 'bet'>[]; content: InteractiveContent }
  | { kind: 'questions'; steps: Extract<LessonStepKey, 'bet'>[]; content: QuestionsContent }
  | { kind: 'review'; steps: []; content: ReviewContent }

/** A lesson next to another in the syllabus. */
export type LessonLink = { code: string; title: string }

/**
 * A lesson as its own page shows it, to a member taking the course: its
 * stages, the lessons either side of it, across modules, and whether the
 * member has done it.
 */
export type LessonPage = {
  course: { id: string; title: string }
  code: string
  title: string
  minutes: number
  stages: LessonStage[]
  /** Null at the start of the course. */
  prev: LessonLink | null
  /** Null at the end of the course. */
  next: LessonLink | null
  done: boolean
}

// Each lesson is fetched once per page load and member, as the catalog is, so
// stepping back to a lesson answers at once; it is forgotten with the rest of
// the member's copies when their enrollment changes.
const lessons = new Map<string, Promise<LessonPage>>()

export async function fetchLesson(courseId: string, code: string): Promise<LessonPage> {
  const member = await session()
  return shared(lessons, `${member?.userId}:${courseId}:${code}`, () =>
    apiGet<LessonPage>(`/v1/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(code)}`, member?.token),
  )
}

/** Drops the copies of a course's lessons, after an enrollment in it changed. */
export function forgetLessons(courseId: string) {
  for (const key of lessons.keys()) if (key.split(':')[1] === courseId) lessons.delete(key)
}

/** A lesson's page, at its `stage`, counting from 1, when one is given. */
export const lessonHref = (courseId: string, code: string, stage?: number) =>
  `/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(code)}${stage ? `/${stage}` : ''}`

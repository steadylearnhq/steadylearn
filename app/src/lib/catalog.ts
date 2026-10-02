import type { Catalog, CourseDetail } from '../data/catalog'
import { apiGet } from './api'
import { session } from './auth'

// The catalog only changes with a release, so each request is made once per
// page load and shared: returning to the catalog, or stepping back to a course
// already opened, answers at once. A failed request is forgotten so the next
// call tries again.
//
// Both are fetched with the session's token when there is one, since a member
// gets their enrollments with them and sees every lesson of a course. Each
// member's copies are kept apart from the visitor's and from each other's, so
// signing in or out mid-visit never serves someone else's; and they are
// forgotten when the member's enrollment changes.

const VISITOR = 'visitor'
const catalogs = new Map<string, Promise<Catalog>>()
const courses = new Map<string, Promise<CourseDetail>>()

/** Answers from `cache` under `key`, or asks once and keeps the answer unless it fails. */
function shared<T>(cache: Map<string, Promise<T>>, key: string, ask: () => Promise<T>): Promise<T> {
  let request = cache.get(key)
  if (!request) {
    request = ask().catch((error: unknown) => {
      cache.delete(key)
      throw error
    })
    cache.set(key, request)
  }
  return request
}

export async function fetchCatalog(): Promise<Catalog> {
  const member = await session()
  return shared(catalogs, member?.userId ?? VISITOR, () => apiGet<Catalog>('/v1/catalog', member?.token))
}

export async function fetchCourse(id: string): Promise<CourseDetail> {
  const member = await session()
  return shared(courses, `${member?.userId ?? VISITOR}:${id}`, () =>
    apiGet<CourseDetail>(`/v1/courses/${encodeURIComponent(id)}`, member?.token),
  )
}

/** Drops the members' copies of the catalog and of a course, after an enrollment in it changed. */
export function forgetEnrollment(courseId: string) {
  for (const key of catalogs.keys()) if (key !== VISITOR) catalogs.delete(key)
  for (const key of courses.keys()) if (key.endsWith(`:${courseId}`) && !key.startsWith(`${VISITOR}:`)) courses.delete(key)
}

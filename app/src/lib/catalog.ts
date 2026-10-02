import type { Catalog, CourseDetail } from '../data/catalog'
import { apiGet } from './api'
import { accessToken } from './auth'

// The catalog only changes with a release, so each request is made once per
// page load and shared: returning to the catalog, or stepping back to a course
// already opened, answers at once. A failed request is forgotten so the next
// call tries again.
//
// A course is fetched with the session's token when there is one, since a
// member sees every lesson and their enrollment; each view is kept apart, so
// signing in mid-visit doesn't keep serving the visitor's. A member's copy is
// forgotten when their enrollment in it changes.

let catalog: Promise<Catalog> | undefined
const courses = new Map<string, Promise<CourseDetail>>()

export function fetchCatalog(): Promise<Catalog> {
  catalog ??= apiGet<Catalog>('/v1/catalog').catch((error: unknown) => {
    catalog = undefined
    throw error
  })
  return catalog
}

/** Drops the member's copy of a course, so the next visit asks for it again. */
export function forgetMemberCourse(id: string) {
  courses.delete(`member:${id}`)
}

export async function fetchCourse(id: string): Promise<CourseDetail> {
  const token = await accessToken()
  const key = `${token ? 'member' : 'visitor'}:${id}`
  let course = courses.get(key)
  if (!course) {
    course = apiGet<CourseDetail>(`/v1/courses/${encodeURIComponent(id)}`, token).catch((error: unknown) => {
      courses.delete(key)
      throw error
    })
    courses.set(key, course)
  }
  return course
}

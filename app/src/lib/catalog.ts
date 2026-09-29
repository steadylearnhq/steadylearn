import type { Catalog, CourseDetail } from '../data/catalog'
import { apiGet } from './api'

// The catalog only changes with a release, so each request is made once per
// page load and shared: returning to the catalog, or stepping back to a course
// already opened, answers at once. A failed request is forgotten so the next
// call tries again.

let catalog: Promise<Catalog> | undefined
const courses = new Map<string, Promise<CourseDetail>>()

export function fetchCatalog(): Promise<Catalog> {
  catalog ??= apiGet<Catalog>('/v1/catalog').catch((error: unknown) => {
    catalog = undefined
    throw error
  })
  return catalog
}

export function fetchCourse(id: string): Promise<CourseDetail> {
  let course = courses.get(id)
  if (!course) {
    course = apiGet<CourseDetail>(`/v1/courses/${encodeURIComponent(id)}`).catch((error: unknown) => {
      courses.delete(id)
      throw error
    })
    courses.set(id, course)
  }
  return course
}

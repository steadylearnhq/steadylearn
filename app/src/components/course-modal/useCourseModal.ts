import { useSearchParams } from '@solidjs/router'
import type { Course } from '../../data/catalog'

/**
 * The open course lives in ?course=<id> so a course can be linked to directly.
 * `list` is the sequence prev/next steps through, e.g. the filtered catalog,
 * and `all` is where the course is looked up, so a link to a course the
 * filters hide still opens it.
 */
export function useCourseModal(list: () => Course[], all: () => Course[] = list) {
  const [params, setParams] = useSearchParams<{ course?: string }>()

  const course = () => all().find((c) => c.id === params.course)
  const index = () => list().findIndex((c) => c.id === params.course)

  const show = (id: string | undefined) => setParams({ course: id }, { replace: true, scroll: false })

  const step = (delta: number) => {
    const items = list()
    if (!items.length) return
    show(items[(index() + delta + items.length) % items.length].id)
  }

  return {
    course,
    /** "3 of 14", or empty when the course is outside the list. */
    position: () => (index() >= 0 ? `${index() + 1} of ${list().length}` : ''),
    close: () => show(undefined),
    prev: () => step(-1),
    next: () => step(1),
  }
}

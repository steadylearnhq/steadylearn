import { useSearchParams } from '@solidjs/router'
import { createMemo } from 'solid-js'
import { LEVELS, type Catalog, type Course, type Level } from '../../data/catalog'

export const LENGTHS = [
  { id: 'short', label: '< 2 h', test: (m: number) => m < 120 },
  { id: 'medium', label: '2–5 h', test: (m: number) => m >= 120 && m <= 300 },
  { id: 'long', label: '> 5 h', test: (m: number) => m > 300 },
] as const

export type LengthId = (typeof LENGTHS)[number]['id']

type CatalogParams = {
  domain?: string
  level?: string
  length?: string
  own?: string
  q?: string
}

/**
 * Catalog filters live in the URL (?domain=&level=&length=&own=&q=) so filtered
 * views can be linked to, e.g. from the landing page's domain grid. The API
 * returns the whole catalog, so filtering is done here and answers as you type.
 *
 * `own=unenrolled` hides the courses a member is enrolled in; it needs
 * `enrolled`, so it does nothing for visitors.
 */
export function useCatalogFilters(catalog: () => Catalog | undefined, enrolled?: (c: Course) => boolean) {
  const [params, setParams] = useSearchParams<CatalogParams>()

  const courses = () => catalog()?.courses ?? []

  const domain = () => catalog()?.domains.find((d) => d.id === params.domain)?.id
  const level = (): Level | undefined => LEVELS.find((l) => l.id === params.level)?.id
  const length = () => LENGTHS.find((l) => l.id === params.length)
  const unenrolled = () => !!enrolled && params.own === 'unenrolled'
  const query = () => params.q ?? ''

  const matches = (c: Course) => {
    const q = query().trim().toLowerCase()
    const haystack = `${c.title} ${c.description} ${c.breakIts.join(' ')}`.toLowerCase()
    return (
      (!domain() || c.domain === domain()) &&
      (!level() || c.level === level()) &&
      (!length() || length()!.test(c.minutes)) &&
      (!unenrolled() || !enrolled!(c)) &&
      (!q || haystack.includes(q))
    )
  }

  const filtered = createMemo(() => courses().filter(matches))

  const chips = createMemo(() => [
    { id: undefined, label: 'All', count: courses().length },
    ...(catalog()?.domains ?? []).map((d) => ({
      id: d.id,
      label: d.name,
      count: courses().filter((c) => c.domain === d.id).length,
    })),
  ])

  const update = (patch: Partial<Record<keyof CatalogParams, string | undefined>>) =>
    setParams(patch, { replace: true, scroll: false })

  return {
    domain,
    level,
    length,
    unenrolled,
    query,
    filtered,
    chips,
    setDomain: (d: string | undefined) => update({ domain: d }),
    setLevel: (l: Level | undefined) => update({ level: l }),
    setLength: (l: LengthId | undefined) => update({ length: l }),
    setUnenrolled: (on: boolean) => update({ own: on ? 'unenrolled' : undefined }),
    setQuery: (q: string) => update({ q: q || undefined }),
    clear: () => update({ domain: undefined, level: undefined, length: undefined, own: undefined, q: undefined }),
  }
}

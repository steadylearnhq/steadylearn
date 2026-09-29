import { useSearchParams } from '@solidjs/router'
import { createMemo } from 'solid-js'
import { COURSES, DOMAIN_BY_ID, DOMAINS, LEVELS, type Course, type DomainId, type Level } from '../../data/catalog'

export const LENGTHS = [
  { id: 'short', label: '< 2 h', test: (h: number) => h < 2 },
  { id: 'medium', label: '2–5 h', test: (h: number) => h >= 2 && h <= 5 },
  { id: 'long', label: '> 5 h', test: (h: number) => h > 5 },
] as const

export type LengthId = (typeof LENGTHS)[number]['id']

type CatalogParams = {
  domain?: string
  level?: string
  length?: string
  q?: string
}

/**
 * Catalog filters live in the URL (?domain=&level=&length=&q=) so filtered
 * views can be linked to, e.g. from the landing page's domain grid.
 */
export function useCatalogFilters() {
  const [params, setParams] = useSearchParams<CatalogParams>()

  const domain = (): DomainId | undefined =>
    params.domain && params.domain in DOMAIN_BY_ID ? (params.domain as DomainId) : undefined
  const level = (): Level | undefined => LEVELS.find((l) => l.toLowerCase() === params.level)
  const length = () => LENGTHS.find((l) => l.id === params.length)
  const query = () => params.q ?? ''

  const matches = (c: Course) => {
    const q = query().trim().toLowerCase()
    const haystack = `${c.title} ${c.description} ${c.breakIts.join(' ')}`.toLowerCase()
    return (
      (!domain() || c.domain === domain()) &&
      (!level() || c.level === level()) &&
      (!length() || length()!.test(c.hours)) &&
      (!q || haystack.includes(q))
    )
  }

  const filtered = createMemo(() => COURSES.filter(matches))

  const update = (patch: Partial<Record<keyof CatalogParams, string | undefined>>) =>
    setParams(patch, { replace: true, scroll: false })

  return {
    domain,
    level,
    length,
    query,
    filtered,
    setDomain: (d: DomainId | undefined) => update({ domain: d }),
    setLevel: (l: Level | undefined) => update({ level: l?.toLowerCase() }),
    setLength: (l: LengthId | undefined) => update({ length: l }),
    setQuery: (q: string) => update({ q: q || undefined }),
    clear: () => update({ domain: undefined, level: undefined, length: undefined, q: undefined }),
  }
}

export const DOMAIN_CHIPS = [
  { id: undefined, label: 'All', count: COURSES.length },
  ...DOMAINS.map((d) => ({ id: d.id, label: d.name, count: COURSES.filter((c) => c.domain === d.id).length })),
]

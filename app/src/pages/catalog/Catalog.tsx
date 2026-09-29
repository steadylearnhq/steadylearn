import { useLocation } from '@solidjs/router'
import { For, Show } from 'solid-js'
import { COURSES, DOMAINS, LEVELS, domainDot, plural } from '../../data/catalog'
import { usePageTitle } from '../../lib/title'
import CourseCard from './CourseCard'
import { DOMAIN_CHIPS, LENGTHS, useCatalogFilters } from './filters'
import Segmented from './Segmented'
import styles from './Catalog.module.css'

export default function Catalog() {
  usePageTitle('Catalog')
  const location = useLocation()
  const filters = useCatalogFilters()

  // Opening a course keeps the current filters in the URL.
  const courseHref = (id: string) => {
    const params = new URLSearchParams(location.search)
    params.set('course', id)
    return `${location.pathname}?${params}`
  }

  return (
    <main class={styles.page}>
      <section class={styles.head}>
        <div class={styles.heading}>
          <h1 class={styles.title}>Catalog</h1>
          <span class={styles.subtitle}>
            {COURSES.length} courses across {DOMAINS.length} domains.
          </span>
        </div>
        <label class={styles.search}>
          <span class={styles.searchIcon} aria-hidden="true" />
          <span class="visually-hidden">Search courses</span>
          <input
            type="search"
            value={filters.query()}
            onInput={(e) => filters.setQuery(e.currentTarget.value)}
            placeholder="Search courses and concepts"
          />
        </label>
      </section>

      <section class={styles.filters}>
        <div class={styles.chips} role="radiogroup" aria-label="Domain">
          <For each={DOMAIN_CHIPS}>
            {(chip) => (
              <button
                type="button"
                role="radio"
                aria-checked={filters.domain() === chip.id}
                class={styles.chip}
                onClick={() => filters.setDomain(chip.id)}
              >
                <Show when={chip.id}>
                  {(id) => <span class={styles.chipDot} style={{ background: domainDot(id()) }} />}
                </Show>
                {chip.label}
                <span class={styles.chipCount}>{chip.count}</span>
              </button>
            )}
          </For>
        </div>
        <div class={styles.refine}>
          <Segmented
            label="Level"
            value={filters.level()}
            onChange={filters.setLevel}
            options={[{ value: undefined, label: 'Any' }, ...LEVELS.map((l) => ({ value: l, label: l }))]}
          />
          <Segmented
            label="Length"
            value={filters.length()?.id}
            onChange={filters.setLength}
            options={[{ value: undefined, label: 'Any' }, ...LENGTHS.map((l) => ({ value: l.id, label: l.label }))]}
          />
          <span class={styles.count} aria-live="polite">
            {plural(filters.filtered().length, 'course')}
          </span>
        </div>
      </section>

      <Show when={filters.filtered().length === 0}>
        <div class={styles.empty}>
          <span class={styles.emptyTitle}>Nothing matches.</span>
          <button type="button" class={styles.clear} onClick={filters.clear}>
            Clear filters
          </button>
        </div>
      </Show>

      <section class={styles.grid}>
        <For each={filters.filtered()}>{(course) => <CourseCard course={course} href={courseHref(course.id)} />}</For>
      </section>
    </main>
  )
}

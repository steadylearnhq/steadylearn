import { useLocation } from '@solidjs/router'
import { createResource, For, Match, Show, Switch } from 'solid-js'
import CourseModal from '../../components/course-modal/CourseModal'
import { useCourseModal } from '../../components/course-modal/useCourseModal'
import { LEVELS, domainDot, plural } from '../../data/catalog'
import { fetchCatalog } from '../../lib/catalog'
import { usePageTitle } from '../../lib/title'
import CourseCard from './CourseCard'
import { LENGTHS, useCatalogFilters } from './filters'
import Segmented from './Segmented'
import styles from './Catalog.module.css'

export default function Catalog() {
  usePageTitle('Catalog')
  const location = useLocation()
  const [catalog, { refetch }] = createResource(fetchCatalog)
  // Reading an errored resource throws, so everything below reads this instead.
  const loaded = () => (catalog.state === 'ready' ? catalog() : undefined)
  const filters = useCatalogFilters(loaded)
  const modal = useCourseModal(filters.filtered, () => loaded()?.courses ?? [])

  const domainName = (id: string) => loaded()?.domains.find((d) => d.id === id)?.name ?? ''

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
            <Show when={loaded()} fallback={' '}>
              {(c) => `${plural(c().courses.length, 'course')} across ${plural(c().domains.length, 'domain')}.`}
            </Show>
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
          <For each={filters.chips()}>
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
            options={[{ value: undefined, label: 'Any' }, ...LEVELS.map((l) => ({ value: l.id, label: l.label }))]}
          />
          <Segmented
            label="Length"
            value={filters.length()?.id}
            onChange={filters.setLength}
            options={[{ value: undefined, label: 'Any' }, ...LENGTHS.map((l) => ({ value: l.id, label: l.label }))]}
          />
          <Show when={loaded()}>
            <span class={styles.count} aria-live="polite">
              {plural(filters.filtered().length, 'course')}
            </span>
          </Show>
        </div>
      </section>

      <Switch>
        <Match when={catalog.error}>
          <div class={styles.empty} role="alert">
            <span class={styles.emptyTitle}>The catalog didn't load.</span>
            <button type="button" class={styles.clear} onClick={() => void refetch()}>
              Try again
            </button>
          </div>
        </Match>
        <Match when={!loaded()}>
          <div class={styles.empty} aria-busy="true">
            <span class={styles.loading}>Loading courses…</span>
          </div>
        </Match>
        <Match when={filters.filtered().length === 0}>
          <div class={styles.empty}>
            <span class={styles.emptyTitle}>Nothing matches.</span>
            <button type="button" class={styles.clear} onClick={filters.clear}>
              Clear filters
            </button>
          </div>
        </Match>
      </Switch>

      <section class={styles.grid}>
        <For each={filters.filtered()}>
          {(course) => <CourseCard course={course} domainName={domainName(course.domain)} href={courseHref(course.id)} />}
        </For>
      </section>

      <Show when={modal.course()}>
        {(course) => (
          <CourseModal
            course={course()}
            domainName={domainName(course().domain)}
            position={modal.position()}
            onClose={modal.close}
            onPrev={modal.prev}
            onNext={modal.next}
          />
        )}
      </Show>
    </main>
  )
}

import { useLocation } from '@solidjs/router'
import { createMemo, createResource, For, Match, Show, Switch } from 'solid-js'
import CourseDrawer from '../../components/course-drawer/CourseDrawer'
import { useCourseDrawer } from '../../components/course-drawer/useCourseDrawer'
import { LEVELS, domainDot, plural, type Course } from '../../data/catalog'
import { user } from '../../lib/auth'
import { fetchCatalog } from '../../lib/catalog'
import { fetchEnrollments } from '../../lib/enrollments'
import { usePageTitle } from '../../lib/title'
import CourseCard from './CourseCard'
import CourseRow from './CourseRow'
import { LENGTHS, useCatalogFilters } from './filters'
import Segmented from './Segmented'
import styles from './Catalog.module.css'

export default function Catalog() {
  usePageTitle('Catalog')
  const location = useLocation()
  const [catalog, { refetch }] = createResource(fetchCatalog)
  // Reading an errored resource throws, so everything below reads this instead.
  const loaded = () => (catalog.state === 'ready' ? catalog() : undefined)
  // Members see the courses as cards with their progress, open each on its own
  // page rather than in the drawer, and can hide the ones they're enrolled in.
  const member = () => !!user()
  const [enrollments] = createResource(() => user()?.id, fetchEnrollments)
  // Until the enrollments load, or if they fail to, the cards show no progress.
  const progress = createMemo(
    () => new Map((enrollments.state === 'ready' ? enrollments() : []).map((e) => [e.courseId, e.progress])),
  )
  const progressOf = (id: string) => (member() ? progress().get(id) : undefined)
  const enrolled = (c: Course) => progressOf(c.id) !== undefined
  const filters = useCatalogFilters(loaded, enrolled)
  const drawer = useCourseDrawer(filters.filtered, () => loaded()?.courses ?? [])

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
              {(c) =>
                `${plural(c().courses.length, 'course')} across ${plural(c().domains.length, 'domain')}.` +
                (member() ? ' Every course ends with something to break.' : '')
              }
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
          <Show when={member()}>
            <Segmented
              label="Enrollment"
              hideLabel
              value={filters.unenrolled()}
              onChange={filters.setUnenrolled}
              options={[
                { value: false, label: 'All' },
                { value: true, label: 'Unenrolled' },
              ]}
            />
          </Show>
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

      <Show
        when={member()}
        fallback={
          <section class={styles.list}>
            <For each={filters.filtered()}>
              {(course) => (
                <CourseRow course={course} domainName={domainName(course.domain)} href={courseHref(course.id)} />
              )}
            </For>
          </section>
        }
      >
        <section class={styles.grid}>
          <For each={filters.filtered()}>
            {(course) => (
              <CourseCard
                course={course}
                domainName={domainName(course.domain)}
                href={`/courses/${course.id}`}
                progress={progressOf(course.id)}
              />
            )}
          </For>
        </section>
      </Show>

      <Show when={drawer.course()}>
        {(course) => (
          <CourseDrawer
            course={course()}
            domainName={domainName(course().domain)}
            position={drawer.position()}
            onClose={drawer.close}
            onPrev={drawer.prev}
            onNext={drawer.next}
          />
        )}
      </Show>
    </main>
  )
}

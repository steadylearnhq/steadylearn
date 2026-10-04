import { A, useSearchParams } from '@solidjs/router'
import { createMemo, createResource, For, Match, Show, Switch } from 'solid-js'
import Button from '../../components/Button'
import Critter from '../../components/Critter'
import { domainDot, domainStyle, levelLabel } from '../../data/catalog'
import { user } from '../../lib/auth'
import { loadMyCourses, type MyCourse } from '../../lib/myCourses'
import { usePageTitle } from '../../lib/title'
import Segmented from '../catalog/Segmented'
import styles from './MyCourses.module.css'

type Filter = 'progress' | 'all' | 'finished'

/** The courses a member is enrolled in, with how far through each they are. */
export default function MyCourses() {
  usePageTitle('My courses')
  const [mine, { refetch }] = createResource(() => user()?.id, loadMyCourses)
  // Reading an errored resource throws, so everything below reads this instead.
  const loaded = () => (mine.state === 'ready' ? mine() : undefined)

  // The filter lives in the URL (?show=all|finished), so a filtered view can be linked to.
  const [params, setParams] = useSearchParams<{ show?: string }>()
  const show = (): Filter => (params.show === 'all' || params.show === 'finished' ? params.show : 'progress')
  const setShow = (s: Filter) => setParams({ show: s === 'progress' ? undefined : s }, { replace: true, scroll: false })

  const inProgress = () => (loaded() ?? []).filter((m) => !m.finished).length
  const finished = () => (loaded()?.length ?? 0) - inProgress()
  const shown = createMemo(() => (loaded() ?? []).filter((m) => show() === 'all' || (show() === 'finished') === m.finished))

  return (
    <main class={styles.page}>
      <section class={styles.head}>
        <div class={styles.heading}>
          <h1 class={styles.title}>My courses</h1>
          <span class={styles.subtitle}>
            <Show when={loaded()} fallback={' '}>
              {(m) => `${m().length} enrolled · ${inProgress()} in progress · ${finished()} finished`}
            </Show>
          </span>
        </div>
        <Segmented
          label="Show"
          hideLabel
          size="md"
          value={show()}
          onChange={setShow}
          options={[
            { value: 'all', label: 'All', count: loaded()?.length },
            { value: 'progress', label: 'In progress', count: loaded() && inProgress() },
            { value: 'finished', label: 'Finished', count: loaded() && finished() },
          ]}
        />
      </section>

      <section class={styles.columns} aria-hidden="true">
        <span />
        <span>course</span>
        <span>progress</span>
        <span />
      </section>

      <Switch>
        <Match when={mine.error}>
          <div class={styles.empty} role="alert">
            <span class={styles.emptyTitle}>Your courses didn't load.</span>
            <button type="button" class={styles.action} onClick={() => void refetch()}>
              Try again
            </button>
          </div>
        </Match>
        <Match when={!loaded()}>
          <div class={styles.empty} aria-busy="true">
            <span class={styles.loading}>Loading your courses…</span>
          </div>
        </Match>
        <Match when={loaded()?.length === 0}>
          <div class={styles.empty}>
            <span class={styles.emptyTitle}>You haven't enrolled in a course yet.</span>
            <A href="/catalog" class={styles.action}>
              Browse the catalog →
            </A>
          </div>
        </Match>
        <Match when={shown().length === 0}>
          <div class={styles.empty}>
            <span class={styles.emptyTitle}>{show() === 'finished' ? 'Nothing finished yet.' : 'Nothing in progress.'}</span>
            <button type="button" class={styles.action} onClick={() => setShow('all')}>
              Show all
            </button>
          </div>
        </Match>
      </Switch>

      <ul class={styles.list}>
        <For each={shown()}>{(m) => <Row {...m} />}</For>
      </ul>
    </main>
  )
}

function Row(props: MyCourse) {
  const href = () => `/courses/${props.course.id}`
  const domain = () => domainStyle(props.course.domain)
  const nextLine = () => {
    if (props.finished) return 'Finished'
    return props.next ? `Next: ${props.next.code} ${props.next.title} · ${props.next.minutes} min` : ''
  }

  return (
    <li class={styles.row}>
      <Critter kind={domain().kind} hue={domain().hue} size={40} mood={props.finished ? 'happy' : 'awake'} />
      <div class={styles.main}>
        <div class={styles.meta}>
          <span class={styles.dot} style={{ background: domainDot(props.course.domain) }} />
          <span>
            {props.domainName} · {levelLabel(props.course.level)}
          </span>
        </div>
        <A href={href()} class={styles.courseTitle}>
          {props.course.title}
        </A>
        <span class={styles.next}>{nextLine()}</span>
      </div>
      <div class={styles.progress}>
        <div class={styles.progressHead}>
          <span>
            {props.enrollment.lessonsDone} of {props.course.lessonCount} lessons
          </span>
          <span class={styles.pct}>{props.enrollment.progress}%</span>
        </div>
        <span
          class={styles.track}
          role="progressbar"
          aria-label={`${props.course.title} progress`}
          aria-valuenow={props.enrollment.progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span class={styles.fill} style={{ width: `${props.enrollment.progress}%` }} />
        </span>
      </div>
      <Button variant="outline" size="xs" class={styles.cta} href={href()}>
        {props.finished ? 'Review' : props.next ? `Resume ${props.next.code} →` : 'Resume →'}
      </Button>
    </li>
  )
}

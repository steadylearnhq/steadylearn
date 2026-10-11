import { Navigate, useNavigate, useParams } from '@solidjs/router'
import { createEffect, createResource, createSignal, Match, Show, Switch } from 'solid-js'
import { ApiError } from '../../lib/api'
import { fetchLesson, lessonHref, type LessonPage } from '../../lib/lessons'
import { usePageTitle } from '../../lib/title'
import NotFound from '../NotFound'
import LessonFooter, { type LessonAction, type LessonStep } from './LessonFooter'
import LessonHeader from './LessonHeader'
import { createScrollEdges } from './scrollEdges'
import { STAGE_LABELS } from './stages'
import styles from './Lesson.module.css'

/**
 * A lesson's own page, standalone like the checkout: a fixed header and
 * footer around a body that scrolls, showing one stage at a time. The stage is
 * its number in the URL, counting from 1, since kinds can repeat. A member who
 * can't take the course, or hasn't started it, is sent to its page.
 */
export default function Lesson() {
  const params = useParams<{ id: string; code: string; stage?: string }>()
  const navigate = useNavigate()
  const [lesson, { refetch }] = createResource(
    () => ({ id: params.id, code: params.code }),
    ({ id, code }) => fetchLesson(id, code),
  )
  // Reading an errored resource throws, so the page reads this instead.
  const loaded = () => (lesson.state === 'ready' ? lesson() : undefined)
  const status = () => (lesson.error instanceof ApiError ? lesson.error.status : undefined)

  usePageTitle(() => {
    const l = loaded()
    return l ? `${l.code} ${l.title}` : ''
  })

  /** The current stage's index in the lesson, or undefined when the URL names none of its stages. */
  const stageIndex = () => {
    const l = loaded()
    const raw = params.stage ?? ''
    if (!l || !/^\d+$/.test(raw)) return undefined
    const n = Number(raw)
    return n >= 1 && n <= l.stages.length ? n - 1 : undefined
  }
  const stage = () => {
    const i = stageIndex()
    return i === undefined ? undefined : loaded()?.stages[i]
  }

  // A missing, malformed or out-of-range stage opens the first. A lesson with
  // no stages stays on /1 rather than redirecting to itself.
  createEffect(() => {
    if (loaded() && stageIndex() === undefined && params.stage !== '1') {
      navigate(lessonHref(params.id, params.code, 1), { replace: true })
    }
  })

  const [body, setBody] = createSignal<HTMLElement>()
  const edges = createScrollEdges(body)

  const courseHref = (l: LessonPage) => `/courses/${encodeURIComponent(l.course.id)}`
  const label = (l: LessonPage, i: number) => STAGE_LABELS[l.stages[i].kind]

  const steps = (l: LessonPage): LessonStep[] => {
    const current = stageIndex() ?? 0
    return l.stages.map((s, i) => ({
      label: STAGE_LABELS[s.kind].label,
      state: i < current ? 'done' : i === current ? 'current' : 'upcoming',
      href: lessonHref(l.course.id, l.code, i + 1),
    }))
  }

  // Back a stage, or to the lesson before from the first.
  const prev = (l: LessonPage): LessonAction | undefined => {
    const i = stageIndex() ?? 0
    if (i > 0) return { label: `← ${label(l, i - 1).label}`, href: lessonHref(l.course.id, l.code, i) }
    if (l.prev) return { label: '← Previous lesson', href: lessonHref(l.course.id, l.prev.code, 1) }
    return undefined
  }

  // On a stage, then on to the next lesson, or back to the course after its last.
  const next = (l: LessonPage): LessonAction => {
    const i = stageIndex() ?? 0
    if (i < l.stages.length - 1) return { label: label(l, i + 1).lead, href: lessonHref(l.course.id, l.code, i + 2) }
    if (l.next) return { label: 'Next lesson →', href: lessonHref(l.course.id, l.next.code, 1) }
    return { label: 'Back to course →', href: courseHref(l) }
  }

  return (
    <Switch>
      <Match when={status() === 404}>
        <NotFound />
      </Match>
      <Match when={status() === 402 || status() === 409}>
        <Navigate href={`/courses/${encodeURIComponent(params.id)}`} />
      </Match>
      <Match when={lesson.error}>
        <main class={styles.status} role="alert">
          <span class={styles.statusTitle}>This lesson didn't load.</span>
          <button type="button" class={styles.retry} onClick={() => void refetch()}>
            Try again
          </button>
        </main>
      </Match>
      <Match when={loaded()}>
        {(l) => (
          <div class={styles.frame}>
            <LessonHeader
              courseTitle={l().course.title}
              code={l().code}
              title={l().title}
              closeHref={courseHref(l())}
              scrolled={edges.above()}
            />
            <main ref={setBody} class={styles.body}>
              <div class={styles.content}>
                <Show when={stage()}>{(s) => <p class={styles.kind}>{s().kind}</p>}</Show>
              </div>
            </main>
            <LessonFooter prev={prev(l())} next={next(l())} steps={steps(l())} more={edges.below()} />
          </div>
        )}
      </Match>
      <Match when={true}>
        <main class={styles.status} aria-busy="true">
          <span class={styles.loading}>Loading the lesson…</span>
        </main>
      </Match>
    </Switch>
  )
}

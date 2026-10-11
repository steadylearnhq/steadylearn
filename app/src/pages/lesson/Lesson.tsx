import { A, Navigate, useNavigate, useParams } from '@solidjs/router'
import { createEffect, createResource, Match, Show, Switch } from 'solid-js'
import { ApiError } from '../../lib/api'
import { fetchLesson, lessonHref } from '../../lib/lessons'
import { usePageTitle } from '../../lib/title'
import NotFound from '../NotFound'
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
            {/* The lesson's own header and footer go in these slots. */}
            <header class={styles.header}>
              <A href={`/courses/${encodeURIComponent(l().course.id)}`} class={styles.back}>
                ← {l().course.title}
              </A>
              <span class={styles.heading}>
                {l().code} {l().title}
              </span>
            </header>
            <main class={styles.body}>
              <Show when={stage()}>{(s) => <p class={styles.kind}>{s().kind}</p>}</Show>
            </main>
            <footer class={styles.footer}>
              <Show when={stageIndex() !== undefined}>
                <span class={styles.position}>
                  stage {(stageIndex() ?? 0) + 1} of {l().stages.length}
                </span>
              </Show>
            </footer>
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

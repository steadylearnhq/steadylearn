import { For, Match, Show, Switch, createEffect, createResource, createSignal, on, onCleanup, onMount } from 'solid-js'
import { Dynamic, Portal } from 'solid-js/web'
import { domainDot, domainStyle, formatLength, levelLabel, plural, type Course, type Lesson, type Module } from '../../data/catalog'
import { LESSON_STEPS, STEP_BY_KEY, type LessonStepKey } from '../../data/lessonSteps'
import { user } from '../../lib/auth'
import { SUBSCRIBE_HREF } from '../../lib/billing'
import { fetchCourse } from '../../lib/catalog'
import Button from '../Button'
import Critter from '../Critter'
import StepIcon from '../StepIcon'
import styles from './CourseDrawer.module.css'

type CourseDrawerProps = {
  course: Course
  domainName: string
  position: string
  onClose: () => void
  onPrev: () => void
  onNext: () => void
}

const FOCUSABLE = 'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])'

/** How many lessons in a module use each step, in order of first use. */
const stepMix = (lessons: Lesson[]) => {
  const counts = new Map<LessonStepKey, number>()
  for (const l of lessons) for (const s of l.steps) counts.set(s, (counts.get(s) ?? 0) + 1)
  return [...counts]
}

const Chevron = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M9 6l6 6-6 6" />
  </svg>
)

/** A course's details in a panel that slides in from the right. */
export default function CourseDrawer(props: CourseDrawerProps) {
  let panel!: HTMLDivElement
  let body!: HTMLDivElement

  const domain = () => domainStyle(props.course.domain)

  // Everything but the syllabus comes with the catalog, so the drawer opens
  // at once and only the syllabus waits on the course's own request.
  const [detail, { refetch }] = createResource(() => props.course.id, fetchCourse)
  // While the next course loads, the resource still holds the previous one.
  const syllabus = () =>
    detail.state === 'ready' && detail().id === props.course.id ? detail().modules : undefined
  const hasLessons = () => syllabus()?.some((m) => m.lessons) ?? false

  // Modules start open; these are the ones the visitor has folded.
  const [folded, setFolded] = createSignal<ReadonlySet<number>>(new Set())
  const toggle = (i: number) =>
    setFolded((prev) => {
      const next = new Set(prev)
      if (!next.delete(i)) next.add(i)
      return next
    })

  const kpis = () => [
    { label: 'Level', value: levelLabel(props.course.level) },
    { label: 'Length', value: formatLength(props.course.minutes) },
    { label: 'Lessons', value: props.course.lessonCount },
    { label: 'Break-its', value: props.course.breakIts.length },
  ]

  const moduleMeta = (m: Module) =>
    m.lessons
      ? `${plural(m.lessons.length, 'lesson')} · ${m.lessons.reduce((sum, l) => sum + l.minutes, 0)} min`
      : plural(m.lessonCount, 'lesson')

  onMount(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panel.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return props.onClose()
      if (e.key === 'ArrowRight') return props.onNext()
      if (e.key === 'ArrowLeft') return props.onPrev()
      if (e.key !== 'Tab') return
      // Keep keyboard focus inside the drawer.
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)]
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)

    onCleanup(() => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
      previousFocus?.focus()
    })
  })

  // Start each course at the top of its syllabus, with every module open.
  createEffect(
    on(
      () => props.course.id,
      () => {
        body.scrollTop = 0
        setFolded(new Set<number>())
      },
      { defer: true },
    ),
  )

  return (
    <Portal>
      <div class={styles.scrim} onClick={props.onClose}>
        <div
          ref={panel}
          class={styles.panel}
          role="dialog"
          aria-modal="true"
          aria-labelledby="course-drawer-title"
          tabindex="-1"
          onClick={(e) => e.stopPropagation()}
        >
          <div class={styles.head}>
            <div class={styles.bar}>
              <span class={styles.dot} style={{ background: domainDot(props.course.domain) }} />
              <span class={styles.domain}>{props.domainName}</span>
              <Show when={props.course.isNew}>
                <span class={styles.badge}>new</span>
              </Show>
              <span class={styles.spacer} />
              <span class={styles.position}>{props.position}</span>
              <button type="button" class={styles.iconButton} aria-label="Previous course" onClick={props.onPrev}>
                ←
              </button>
              <button type="button" class={styles.iconButton} aria-label="Next course" onClick={props.onNext}>
                →
              </button>
              <button type="button" class={styles.close} aria-label="Close" onClick={props.onClose}>
                ✕
              </button>
            </div>
            <div class={styles.intro}>
              <div class={styles.introText}>
                <h2 id="course-drawer-title" class={styles.title}>
                  {props.course.title}
                </h2>
                <span class={styles.description}>{props.course.description}</span>
              </div>
              <Critter kind={domain().kind} hue={domain().hue} size={64} />
            </div>
          </div>

          <div class={styles.kpis}>
            <For each={kpis()}>
              {(k) => (
                <div class={styles.kpi}>
                  <span class={styles.kpiLabel}>{k.label}</span>
                  <span class={styles.kpiValue}>{k.value}</span>
                </div>
              )}
            </For>
          </div>

          <div ref={body} class={styles.body}>
            <div class={styles.syllabus}>
              <div class={styles.sectionHead}>
                <h3 class={`${styles.h3} ${styles.syllabusTitle}`}>Syllabus</h3>
                <span class={styles.small}>
                  <Show when={syllabus()}>
                    {(modules) => (
                      <>
                        {plural(modules().length, 'module')}
                        {hasLessons() ? '' : ' · lesson list after sign-up'}
                      </>
                    )}
                  </Show>
                </span>
              </div>
              <Switch>
                <Match when={detail.error}>
                  <div class={styles.syllabusState} role="alert">
                    <span>The syllabus didn't load.</span>
                    <button type="button" class={styles.retry} onClick={() => void refetch()}>
                      Try again
                    </button>
                  </div>
                </Match>
                <Match when={!syllabus()}>
                  <div class={styles.syllabusState} aria-busy="true">
                    Loading syllabus…
                  </div>
                </Match>
              </Switch>
              <For each={syllabus()}>
                {(m, i) => {
                  const lessons = () => (m.lessons?.length ? m.lessons : undefined)
                  const open = () => !!lessons() && !folded().has(i())
                  return (
                    <div class={styles.module} classList={{ [styles.moduleOpen]: open() }}>
                      {/* Only modules with a visible lesson list fold. */}
                      <Dynamic
                        component={lessons() ? 'button' : 'div'}
                        type={lessons() ? 'button' : undefined}
                        class={styles.moduleHead}
                        aria-expanded={lessons() ? open() : undefined}
                        onClick={lessons() ? () => toggle(i()) : undefined}
                      >
                        <span class={styles.chevron} classList={{ [styles.chevronOpen]: open() }}>
                          <Show when={lessons()}>
                            <Chevron />
                          </Show>
                        </span>
                        <span class={styles.code}>{String(i() + 1).padStart(2, '0')}</span>
                        <span class={styles.moduleText}>
                          <span class={styles.moduleTitle}>{m.title}</span>
                          <span class={styles.moduleMeta}>
                            <Show when={!open() && lessons()}>
                              {(ls) => (
                                <>
                                  <span
                                    class={styles.mix}
                                    role="img"
                                    aria-label={stepMix(ls())
                                      .map(([s, n]) => `${n} ${STEP_BY_KEY[s].legend}`)
                                      .join(', ')}
                                  >
                                    <For each={stepMix(ls())}>
                                      {([s, n]) => (
                                        <span class={styles.mixItem}>
                                          <StepIcon step={s} size={14} stroke={2} />
                                          {n}
                                        </span>
                                      )}
                                    </For>
                                  </span>
                                  <span class={styles.metaRule} />
                                </>
                              )}
                            </Show>
                            <span>{moduleMeta(m)}</span>
                          </span>
                        </span>
                      </Dynamic>
                      <Show when={open()}>
                        <For each={lessons()}>
                          {(l) => (
                            <div class={styles.lesson}>
                              <span />
                              <span class={styles.code}>{l.code}</span>
                              <span class={styles.lessonTitle}>{l.title}</span>
                              <span
                                class={styles.steps}
                                role="img"
                                aria-label={l.steps.map((s) => STEP_BY_KEY[s].legend).join(', ')}
                              >
                                <For each={l.steps}>
                                  {(s) => (
                                    <span classList={{ [styles.breakStep]: s === 'break' }}>
                                      <StepIcon step={s} size={16} stroke={2} />
                                    </span>
                                  )}
                                </For>
                              </span>
                              <span class={styles.duration}>{l.minutes} min</span>
                            </div>
                          )}
                        </For>
                      </Show>
                    </div>
                  )
                }}
              </For>
            </div>

            <aside class={styles.aside}>
              <h3 class={styles.h3}>You'll break</h3>
              <ul class={styles.breakList}>
                <For each={props.course.breakIts}>
                  {(name, i) => (
                    <li class={styles.breakItem}>
                      <Critter
                        kind={domain().kind}
                        hue={domain().hue + [0, 28, -28][i() % 3]}
                        size={26}
                        mood={i() % 3 === 2 ? 'asleep' : 'awake'}
                      />
                      <span>{name}</span>
                    </li>
                  )}
                </For>
              </ul>
            </aside>

            <aside class={styles.aside}>
              <h3 class={`${styles.h3} ${styles.legendTitle}`}>Lesson steps</h3>
              <ul class={styles.legend}>
                <For each={LESSON_STEPS}>
                  {(s) => (
                    <li class={styles.legendItem}>
                      <span class={styles.legendIcon}>
                        <StepIcon step={s.key} size={20} stroke={1.8} />
                      </span>
                      {s.name}
                    </li>
                  )}
                </For>
              </ul>
            </aside>
          </div>

          {/* The sign-up prompt is for visitors; members have no lesson pages to start yet. */}
          <Show when={!user()}>
            <div class={styles.foot}>
              <span class={styles.access}>
                {props.course.isFree ? 'Free course. Sign up to start.' : 'Included with the subscription.'}
              </span>
              <span class={styles.spacer} />
              <Button variant="primary" size="md" href={props.course.isFree ? '/login' : SUBSCRIBE_HREF}>
                {props.course.isFree ? 'Start for free →' : 'Subscribe →'}
              </Button>
            </div>
          </Show>
        </div>
      </div>
    </Portal>
  )
}

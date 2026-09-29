import { For, Show, createEffect, on, onCleanup, onMount } from 'solid-js'
import { Portal } from 'solid-js/web'
import { DOMAIN_BY_ID, domainDot, formatHours, plural, type Course } from '../../data/catalog'
import { LESSON_STEPS, STEP_BY_KEY } from '../../data/lessonSteps'
import Button from '../Button'
import Critter from '../Critter'
import styles from './CourseModal.module.css'

type CourseModalProps = {
  course: Course
  position: string
  onClose: () => void
  onPrev: () => void
  onNext: () => void
}

const FOCUSABLE = 'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])'

export default function CourseModal(props: CourseModalProps) {
  let dialog!: HTMLDivElement
  let body!: HTMLDivElement

  const domain = () => DOMAIN_BY_ID[props.course.domain]
  const hasSyllabus = () => props.course.modules.some((m) => m.lessons)

  const kpis = () => [
    { label: 'Level', value: props.course.level },
    { label: 'Length', value: formatHours(props.course.hours) },
    { label: 'Lessons', value: props.course.lessons },
    { label: 'Break-its', value: props.course.breakIts.length },
  ]

  const moduleMeta = (m: Course['modules'][number]) =>
    m.lessons
      ? `${plural(m.lessons.length, 'lesson')} · ${m.lessons.reduce((sum, l) => sum + l.minutes, 0)} min`
      : plural(m.lessonCount, 'lesson')

  onMount(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return props.onClose()
      if (e.key === 'ArrowRight') return props.onNext()
      if (e.key === 'ArrowLeft') return props.onPrev()
      if (e.key !== 'Tab') return
      // Keep keyboard focus inside the dialog.
      const items = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)]
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
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

  // Start each course at the top of its syllabus.
  createEffect(on(() => props.course.id, () => (body.scrollTop = 0), { defer: true }))

  return (
    <Portal>
      <div class={styles.scrim} onClick={props.onClose}>
        <div
          ref={dialog}
          class={styles.dialog}
          role="dialog"
          aria-modal="true"
          aria-labelledby="course-modal-title"
          tabindex="-1"
          onClick={(e) => e.stopPropagation()}
        >
          <div class={styles.head}>
            <div class={styles.bar}>
              <span class={styles.dot} style={{ background: domainDot(props.course.domain) }} />
              <span class={styles.domain}>{domain().name}</span>
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
                <h2 id="course-modal-title" class={styles.title}>
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
                <h3 class={styles.h3}>Syllabus</h3>
                <span class={styles.small}>
                  {plural(props.course.modules.length, 'module')}
                  {hasSyllabus() ? '' : ' · lesson list after sign-up'}
                </span>
              </div>
              <For each={props.course.modules}>
                {(m, i) => (
                  <div class={styles.module}>
                    <div class={styles.moduleHead}>
                      <span class={styles.small}>{String(i() + 1).padStart(2, '0')}</span>
                      <span class={styles.moduleTitle}>{m.title}</span>
                      <span class={styles.small}>{moduleMeta(m)}</span>
                    </div>
                    <For each={m.lessons}>
                      {(l) => (
                        <div class={styles.lesson}>
                          <span class={styles.small}>{l.code}</span>
                          <span class={styles.lessonTitle}>{l.title}</span>
                          <span class={styles.glyphs} aria-label={l.steps.map((s) => STEP_BY_KEY[s].legend).join(', ')}>
                            <For each={l.steps}>
                              {(s) => (
                                <span classList={{ [styles.breakGlyph]: s === 'break' }} aria-hidden="true">
                                  {STEP_BY_KEY[s].glyph}
                                </span>
                              )}
                            </For>
                          </span>
                          <span class={styles.duration}>{l.minutes} min</span>
                        </div>
                      )}
                    </For>
                  </div>
                )}
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
              <h3 class={`${styles.h3} ${styles.legendTitle}`}>Lesson steps</h3>
              <ul class={styles.legend}>
                <For each={LESSON_STEPS}>
                  {(s) => (
                    <li>
                      <span class={styles.legendGlyph}>{s.glyph}</span>
                      {s.legend}
                    </li>
                  )}
                </For>
              </ul>
            </aside>
          </div>

          <div class={styles.foot}>
            <span class={styles.access}>
              {props.course.isFree ? 'Free course. Sign up to start.' : 'Included with the subscription, $24/month.'}
            </span>
            <span class={styles.spacer} />
            <Button variant="ghost" size="md">
              Log in
            </Button>
            <Button variant="primary" size="md">
              Sign up to enroll →
            </Button>
          </div>
        </div>
      </div>
    </Portal>
  )
}

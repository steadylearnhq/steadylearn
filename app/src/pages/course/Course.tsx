import { A, useParams } from '@solidjs/router'
import { createEffect, createMemo, createResource, createSignal, For, Match, on, Show, Switch } from 'solid-js'
import Button from '../../components/Button'
import Critter from '../../components/Critter'
import StepIcon from '../../components/StepIcon'
import {
  domainDot,
  formatLength,
  levelLabel,
  plural,
  type Course,
  type CourseDetail,
  type Lesson,
  type Module,
  type Outcome,
} from '../../data/catalog'
import { STEP_BY_KEY, type LessonStepKey } from '../../data/lessonSteps'
import { ApiError } from '../../lib/api'
import { fetchCatalog, fetchCourse } from '../../lib/catalog'
import { enroll, leaveFeedback, setLessonDone, type CourseEnrollment, type Feedback } from '../../lib/enrollments'
import { usePageTitle } from '../../lib/title'
import NotFound from '../NotFound'
import styles from './Course.module.css'
import FeedbackDialog from './FeedbackDialog'

/** Watching and reading are how every lesson starts; the other steps are its practice. */
const practice = (steps: LessonStepKey[]) => steps.filter((s) => s !== 'watch' && s !== 'read')

/** How many of a module's lessons use each practice step, in order of first use. */
const practiceMix = (lessons: Lesson[]) => {
  const counts = new Map<LessonStepKey, number>()
  for (const l of lessons) for (const s of practice(l.steps)) counts.set(s, (counts.get(s) ?? 0) + 1)
  return [...counts]
}

/** A module's lessons and length; for an enrolled member, how many of its lessons they've done. */
const moduleMeta = (m: Module, done?: ReadonlySet<string>) => {
  if (!m.lessons) return plural(m.lessonCount, 'lesson')
  const minutes = m.lessons.reduce((sum, l) => sum + l.minutes, 0)
  return done
    ? `${m.lessons.filter((l) => done.has(l.code)).length} of ${m.lessons.length} done · ${minutes} min`
    : `${plural(m.lessons.length, 'lesson')} · ${minutes} min`
}

const allLessons = (c: CourseDetail) => c.modules.flatMap((m) => m.lessons ?? [])

// Break-its don't carry a critter of their own, so each takes the next hue in turn.
const BREAK_HUES = [255, 165, 85, 205, 290, 35]

const Check = (props: { size: number }) => (
  <svg width={props.size} height={props.size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
)

const Chevron = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M9 6l6 6-6 6" />
  </svg>
)

/**
 * A course's own page, as a member sees it: before enrolling, what the course
 * covers and the button to enroll; after, their progress through it.
 */
export default function CoursePage() {
  const params = useParams<{ id: string }>()
  const [course, { mutate: setCourse, refetch }] = createResource(() => params.id, fetchCourse)
  const [catalog] = createResource(fetchCatalog)
  // Reading an errored resource throws, so the page reads these instead.
  const loaded = () => (course.state === 'ready' ? course() : undefined)
  const listed = () => (catalog.state === 'ready' ? catalog() : undefined)
  const notFound = () => course.error instanceof ApiError && course.error.status === 404

  usePageTitle(() => loaded()?.title ?? '')

  // The course carries the member's enrollment, so it is known as soon as the page is.
  const enrolled = () => loaded()?.enrollment
  const doneCodes = createMemo<ReadonlySet<string>>(() => new Set(enrolled()?.completedLessons))
  /** The first lesson, in syllabus order, the enrolled member hasn't done. */
  const upNext = () => {
    const c = loaded()
    return c && enrolled() ? allLessons(c).find((l) => !doneCodes().has(l.code))?.code : undefined
  }
  const unlocked = (o: Outcome) => !!o.lesson && doneCodes().has(o.lesson)
  const setEnrollment = (enrollment: CourseEnrollment) =>
    setCourse((prev) => prev && { ...prev, enrollment })
  const [enrolling, setEnrolling] = createSignal(false)
  const [enrollFailed, setEnrollFailed] = createSignal(false)
  const startCourse = async () => {
    const courseId = params.id
    setEnrolling(true)
    setEnrollFailed(false)
    try {
      const made = await enroll(courseId)
      if (courseId === params.id) setEnrollment(made)
    } catch {
      if (courseId === params.id) setEnrollFailed(true)
    } finally {
      setEnrolling(false)
    }
  }

  // Each change answers with the whole enrollment, so changes are sent one at a
  // time: an older answer arriving last would otherwise undo a newer one.
  let changes = Promise.resolve()
  const [marking, setMarking] = createSignal<ReadonlySet<string>>(new Set())
  const [markFailed, setMarkFailed] = createSignal(false)
  const markDone = (code: string, done: boolean) => {
    const courseId = params.id
    setMarking((prev) => new Set(prev).add(code))
    setMarkFailed(false)
    changes = changes.then(async () => {
      try {
        const changed = await setLessonDone(courseId, code, done)
        if (courseId === params.id) setEnrollment(changed)
      } catch {
        if (courseId === params.id) setMarkFailed(true)
      } finally {
        setMarking((prev) => {
          const next = new Set(prev)
          next.delete(code)
          return next
        })
      }
    })
  }

  const [feedbackOpen, setFeedbackOpen] = createSignal(false)
  const sendFeedback = async (feedback: Feedback) => {
    const courseId = params.id
    const changed = await leaveFeedback(courseId, feedback)
    if (courseId === params.id) setEnrollment(changed)
    setFeedbackOpen(false)
  }

  const domainName = (id: string) => listed()?.domains.find((d) => d.id === id)?.name ?? ''
  const findCourse = (id: string) => listed()?.courses.find((c) => c.id === id)
  const prerequisites = () =>
    (loaded()?.prerequisites ?? []).flatMap((p) => {
      const c = findCourse(p.id)
      return c ? [{ course: c, optional: p.optional }] : []
    })
  const followUps = () =>
    (loaded()?.followUps ?? []).flatMap((id) => {
      const c = findCourse(id)
      return c ? [c] : []
    })

  // Every module starts open for a member who isn't enrolled; one who is starts
  // with only the module of their next lesson open. This is settled when the
  // course or the enrollment arrives, not as lessons are ticked off, so ticking
  // the last lesson of a module doesn't fold it away.
  // Keyed on a string, which only changes with the course or with enrolling;
  // the course itself changes with every lesson ticked off.
  const [open, setOpen] = createSignal<ReadonlySet<number>>(new Set())
  const openKey = createMemo(() => (loaded() ? `${loaded()!.id}:${!!enrolled()}` : ''))
  createEffect(
    on(openKey, (key) => {
      const c = loaded()
      if (!key || !c) return
      const next = upNext()
      setOpen(new Set(c.modules.flatMap((m, i) => (!enrolled() || m.lessons?.some((l) => l.code === next) ? [i] : []))))
    }),
  )
  const toggle = (i: number) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (!next.delete(i)) next.add(i)
      return next
    })

  /** The side column once enrolled: outcomes as the member unlocks them, and their feedback. */
  const EnrolledPanels = () => (
    <>
      <Show when={loaded()?.outcomes.length}>
        <div class={styles.panel}>
          <div class={styles.panelHead}>
            <h2 class={styles.sectionTitle}>Outcomes</h2>
            <span class={styles.panelNote}>
              {loaded()!.outcomes.filter(unlocked).length} of {loaded()!.outcomes.length} unlocked
            </span>
          </div>
          <ul class={styles.numbered}>
            <For each={loaded()!.outcomes}>
              {(o) => (
                <li class={styles.outcome} classList={{ [styles.unlocked]: unlocked(o) }}>
                  <span class={styles.ring}>
                    <Check size={12} />
                  </span>
                  <span class={styles.outcomeText}>
                    <Show when={unlocked(o)}>
                      <span class="visually-hidden">Unlocked: </span>
                    </Show>
                    {o.statement}
                  </span>
                  <Show when={o.lesson}>
                    <span class={styles.where}>
                      {unlocked(o) ? 'via' : 'in'} {o.lesson}
                    </span>
                  </Show>
                </li>
              )}
            </For>
          </ul>
        </div>
      </Show>

      <div class={styles.panel}>
        <div class={`${styles.panelHead} ${styles.tight}`}>
          <h2 class={styles.sectionTitle}>Leave a feedback</h2>
          <Show when={enrolled()?.feedback}>
            <span class={styles.panelNote}>sent</span>
          </Show>
        </div>
        <p class={styles.feedbackBlurb}>
          <Show when={enrolled()?.feedback} fallback="Tell the course author what is working and what is not. It takes a minute.">
            {(f) => `You rated this course ${f().rating} of 5. Thanks, it goes straight to the course author.`}
          </Show>
        </p>
        <Button variant="outline" size="md" class={styles.feedbackButton} onClick={() => setFeedbackOpen(true)}>
          {enrolled()?.feedback ? 'Edit feedback' : 'Leave a feedback'}
        </Button>
      </div>
    </>
  )

  return (
    <Switch>
      <Match when={notFound()}>
        <NotFound />
      </Match>
      <Match when={course.error}>
        <main class={styles.page}>
          <div class={styles.status} role="alert">
            <span class={styles.statusTitle}>This course didn't load.</span>
            <button type="button" class={styles.retry} onClick={() => void refetch()}>
              Try again
            </button>
          </div>
        </main>
      </Match>
      <Match when={!loaded()}>
        <main class={styles.page}>
          <div class={styles.status} aria-busy="true">
            <span class={styles.loading}>Loading the course…</span>
          </div>
        </main>
      </Match>
      <Match when={loaded()}>
        {(c) => (
          <main class={styles.page}>
            <section class={styles.head}>
              <div class={styles.headText}>
                <nav class={styles.crumbs} aria-label="Breadcrumb">
                  <A href="/catalog" class={styles.crumb}>
                    Catalog
                  </A>
                  <span aria-hidden="true">/</span>
                  <A href={`/catalog?domain=${c().domain}`} class={styles.crumb}>
                    <span class={styles.dot} style={{ background: domainDot(c().domain) }} />
                    {domainName(c().domain)}
                  </A>
                </nav>
                <h1 class={styles.title}>{c().title}</h1>
                <p class={styles.overview}>{c().overview || c().description}</p>
              </div>
              <div class={styles.cta}>
                <Show when={!enrolled()}>
                  <Button variant="primary" size="md" disabled={enrolling()} onClick={() => void startCourse()}>
                    {enrolling() ? 'Enrolling…' : 'Enroll →'}
                  </Button>
                  <Show when={enrollFailed()}>
                    <span class={styles.ctaNote} role="alert">
                      That didn't go through. Try again.
                    </span>
                  </Show>
                </Show>
                {/* Resume opens the next lesson in the lesson player; until that exists, it does nothing. */}
                <Show when={upNext()}>
                  {(code) => (
                    <Button variant="primary" size="md" class={styles.resume}>
                      Resume {code()} →
                    </Button>
                  )}
                </Show>
              </div>
            </section>

            <section class={styles.stats}>
              <Show when={enrolled()}>
                {(e) => (
                  <div class={styles.stat}>
                    <span class={styles.statLabel}>Progress</span>
                    <span class={styles.statValue}>
                      {e().lessonsDone} of {c().lessonCount}
                    </span>
                    <span class={styles.progress}>
                      <span>{e().progress}%</span>
                      <span class={styles.bar} aria-hidden="true">
                        <For each={allLessons(c())}>
                          {(l) => <span classList={{ [styles.barDone]: doneCodes().has(l.code) }} />}
                        </For>
                      </span>
                    </span>
                  </div>
                )}
              </Show>
              {/* Enrolled, the design's other stats (points, vs par, calibration, next review) wait for data. */}
              <Show when={!enrolled()}>
                <div class={styles.stat}>
                  <span class={styles.statLabel}>Level</span>
                  <span class={styles.statValue}>{levelLabel(c().level)}</span>
                  <Show when={c().assumes}>
                    <span class={styles.statSub}>{c().assumes}</span>
                  </Show>
                </div>
                <div class={styles.stat}>
                  <span class={styles.statLabel}>Length</span>
                  <span class={styles.statValue}>{formatLength(c().minutes)}</span>
                  <span class={styles.statSub}>
                    {plural(c().lessonCount, 'lesson')} · {plural(c().modules.length, 'section')}
                  </span>
                </div>
              </Show>
            </section>

            <section class={styles.body}>
              <div class={styles.syllabus}>
                <div class={styles.syllabusHead}>
                  <h2 class={styles.sectionTitle}>Syllabus</h2>
                  <Show when={markFailed()}>
                    <span class={styles.syllabusNote} role="alert">
                      That didn't save. Try again.
                    </span>
                  </Show>
                </div>
                <For each={c().modules}>
                  {(m, i) => {
                    const isOpen = () => open().has(i())
                    const panel = `module-${i()}`
                    return (
                      <div class={styles.module} classList={{ [styles.open]: isOpen() }}>
                        <button
                          type="button"
                          class={styles.moduleHead}
                          aria-expanded={isOpen()}
                          aria-controls={panel}
                          onClick={() => toggle(i())}
                        >
                          <span class={styles.chevron}>
                            <Chevron />
                          </span>
                          <span class={styles.code}>{String(i() + 1).padStart(2, '0')}</span>
                          <span class={styles.moduleTitle}>{m.title}</span>
                          <span class={styles.moduleMeta}>
                            <Show when={!isOpen() && m.lessons && practiceMix(m.lessons).length}>
                              <span class={styles.mix}>
                                <For each={practiceMix(m.lessons!)}>
                                  {([step, n]) => (
                                    <span class={styles.mixItem} title={STEP_BY_KEY[step].name}>
                                      <StepIcon step={step} size={14} stroke={2.2} />
                                      {n}
                                    </span>
                                  )}
                                </For>
                              </span>
                              <span class={styles.rule} />
                            </Show>
                            <span>{moduleMeta(m, enrolled() ? doneCodes() : undefined)}</span>
                          </span>
                        </button>
                        <Show when={isOpen() && m.lessons?.length}>
                          <ul id={panel} class={styles.lessons}>
                            <For each={m.lessons}>
                              {(l) => {
                                const done = () => doneCodes().has(l.code)
                                const next = () => upNext() === l.code
                                return (
                                  <li class={styles.lesson} classList={{ [styles.enrolledLesson]: !!enrolled() }}>
                                    <span />
                                    <Show when={enrolled()}>
                                      <button
                                        type="button"
                                        role="checkbox"
                                        aria-checked={done()}
                                        aria-label={`${done() ? 'Mark not done' : 'Mark done'}: ${l.title}`}
                                        class={styles.checkbox}
                                        classList={{ [styles.checked]: done(), [styles.upNext]: next() }}
                                        disabled={marking().has(l.code)}
                                        onClick={() => markDone(l.code, !done())}
                                      >
                                        <Check size={12} />
                                      </button>
                                    </Show>
                                    <span class={styles.code}>{l.code}</span>
                                    <span class={styles.lessonName}>
                                      <span class={styles.lessonTitle} classList={{ [styles.doneTitle]: done(), [styles.nextTitle]: next() }}>
                                        {l.title}
                                      </span>
                                      <Show when={next()}>
                                        <span class={styles.upNextLabel}>Up next</span>
                                      </Show>
                                    </span>
                                    <span class={styles.steps}>
                                      <For each={practice(l.steps)}>
                                        {(s) => (
                                          <span title={STEP_BY_KEY[s].name}>
                                            <StepIcon step={s} size={16} stroke={1.8} />
                                            <span class="visually-hidden">{STEP_BY_KEY[s].name}</span>
                                          </span>
                                        )}
                                      </For>
                                    </span>
                                    <span class={styles.duration}>{l.minutes} min</span>
                                  </li>
                                )
                              }}
                            </For>
                          </ul>
                        </Show>
                      </div>
                    )
                  }}
                </For>
              </div>

              <aside class={styles.aside}>
                <Show when={!enrolled()} fallback={<EnrolledPanels />}>
                  <Show when={c().requirements.length}>
                    <div class={styles.panel}>
                      <h2 class={styles.sectionTitle}>What you need to know</h2>
                      <ol class={styles.numbered}>
                        <For each={c().requirements}>
                          {(r, i) => (
                            <li class={styles.numberedItem}>
                              <span class={styles.number}>{String(i() + 1).padStart(2, '0')}</span>
                              <span title={r.detail || undefined}>{r.title}</span>
                            </li>
                          )}
                        </For>
                      </ol>
                    </div>
                  </Show>

                  <Show when={c().outcomes.length}>
                    <div class={styles.panel}>
                      <h2 class={styles.sectionTitle}>You'll be able to</h2>
                      <ol class={styles.numbered}>
                        <For each={c().outcomes}>
                          {(o, i) => (
                            <li class={styles.numberedItem}>
                              <span class={styles.number}>{String(i() + 1).padStart(2, '0')}</span>
                              <span>{o.statement}</span>
                            </li>
                          )}
                        </For>
                      </ol>
                    </div>
                  </Show>

                  <Show when={c().breakItDetails.length}>
                    <div class={styles.panel}>
                      <h2 class={styles.sectionTitle}>You'll break</h2>
                      <ul class={styles.breaks}>
                        <For each={c().breakItDetails}>
                          {(b, i) => (
                            <li class={styles.break}>
                              <Critter kind="circle" hue={BREAK_HUES[i() % BREAK_HUES.length]} size={30} track={false} />
                              <span class={styles.breakText}>
                                <span class={styles.breakName}>{b.name}</span>
                                <Show when={b.description}>
                                  <span class={styles.breakDescription}>{b.description}</span>
                                </Show>
                              </span>
                              <Show when={b.par}>
                                <span class={styles.par}>par {b.par}</span>
                              </Show>
                            </li>
                          )}
                        </For>
                      </ul>
                    </div>
                  </Show>
                </Show>
              </aside>
            </section>

            <Show when={!enrolled() && prerequisites().length}>
              <section class={styles.related}>
                <div class={styles.relatedHead}>
                  <h2 class={styles.sectionTitle}>Before you start</h2>
                  <span class={styles.relatedNote}>courses that make this one easier</span>
                </div>
                <div class={styles.cards}>
                  <For each={prerequisites()}>
                    {(p) => <RelatedCard course={p.course} domainName={domainName(p.course.domain)} tag={p.optional ? 'optional' : 'recommended'} />}
                  </For>
                </div>
              </section>
            </Show>

            <Show when={enrolled() && followUps().length}>
              <section class={styles.related}>
                <div class={styles.relatedHead}>
                  <h2 class={styles.sectionTitle}>We also recommend</h2>
                  <span class={styles.relatedNote}>courses that build on this one</span>
                </div>
                <div class={styles.cards}>
                  <For each={followUps()}>
                    {(f) => <RelatedCard course={f} domainName={domainName(f.domain)} tag="next step" />}
                  </For>
                </div>
              </section>
            </Show>

            <Show when={feedbackOpen() && enrolled()}>
              {(e) => (
                <FeedbackDialog
                  courseTitle={c().title}
                  current={e().feedback}
                  onClose={() => setFeedbackOpen(false)}
                  onSend={sendFeedback}
                />
              )}
            </Show>
          </main>
        )}
      </Match>
    </Switch>
  )
}

function RelatedCard(props: { course: Course; domainName: string; tag: string }) {
  return (
    <A href={`/courses/${props.course.id}`} class={styles.card}>
      <div class={styles.cardMeta}>
        <span class={styles.dot} style={{ background: domainDot(props.course.domain) }} />
        <span>{props.domainName}</span>
        <span class={styles.spacer} />
        <span class={styles.tag}>{props.tag}</span>
      </div>
      <span class={styles.cardTitle}>{props.course.title}</span>
      <span class={styles.cardDescription}>{props.course.description}</span>
      <div class={styles.cardFacts}>
        <span class={styles.level}>{levelLabel(props.course.level)}</span>
        <span>{formatLength(props.course.minutes)}</span>
        <span>{props.course.lessonCount} lessons</span>
      </div>
    </A>
  )
}

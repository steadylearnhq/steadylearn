import { A, useParams } from '@solidjs/router'
import { createEffect, createMemo, createResource, createSignal, For, Match, on, onMount, Show, Switch } from 'solid-js'
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
import { canTake, CHECKOUT_HREF, loadBilling } from '../../lib/billing'
import { fetchCatalog, fetchCourse } from '../../lib/catalog'
import { enroll, leaveFeedback, setLessonDone, type CourseEnrollment, type Feedback } from '../../lib/enrollments'
import { usePageTitle } from '../../lib/title'
import NotFound from '../NotFound'
import styles from './Course.module.css'
import FeedbackDialog, { RATINGS } from './FeedbackDialog'

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

/** The API's answer to a change on a course that needs a subscription the member doesn't have. */
const paymentRequired = (error: unknown) => error instanceof ApiError && error.status === 402

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

  // A course that isn't free needs a subscription. Until the member's billing
  // state is known nothing shows locked; if it can't be had, the page offers
  // what it would without the lock and leaves the API to say no. A 402 means
  // billing changed since it loaded, so it is asked for again.
  const [billingFailed, setBillingFailed] = createSignal(false)
  const refreshBilling = (fresh = false) =>
    void loadBilling(fresh).then(
      () => setBillingFailed(false),
      () => setBillingFailed(true),
    )
  onMount(() => refreshBilling())
  /** Whether the member may take the course; undefined until that's known. */
  const access = () => {
    const c = loaded()
    if (!c) return undefined
    return billingFailed() || canTake(c)
  }
  /** An enrolled member keeps their progress here, but can't change it until they subscribe. */
  const locked = () => access() === false
  // A lesson shows as done or not the moment it is marked; until every change
  // sent for it has been answered, its mark wins over the enrollment. Marks are
  // keyed by course too, so an answer arriving after the member has moved on
  // still clears its own.
  const [marks, setMarks] = createSignal<ReadonlyMap<string, { done: boolean; sending: number }>>(new Map())
  const markKey = (courseId: string, code: string) => `${courseId}/${code}`
  const doneCodes = createMemo<ReadonlySet<string>>(() => {
    const c = loaded()
    const done = new Set(c?.enrollment?.completedLessons)
    for (const l of c ? allLessons(c) : []) {
      const mark = marks().get(markKey(params.id, l.code))
      if (mark?.done) done.add(l.code)
      else if (mark) done.delete(l.code)
    }
    return done
  })
  /** Lessons done as a percentage, rounded down, as the enrollment counts it. */
  const progress = () => {
    const count = loaded()?.lessonCount
    return count ? Math.floor((doneCodes().size * 100) / count) : 0
  }
  /** The first lesson, in syllabus order, the enrolled member hasn't done. */
  const nextLesson = () => {
    const c = loaded()
    return c && enrolled() ? allLessons(c).find((l) => !doneCodes().has(l.code)) : undefined
  }
  const upNext = () => nextLesson()?.code
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
    } catch (error) {
      if (paymentRequired(error)) refreshBilling(true)
      if (courseId === params.id) setEnrollFailed(true)
    } finally {
      setEnrolling(false)
    }
  }

  // Each change answers with the whole enrollment, so changes are sent one at a
  // time: an older answer arriving last would otherwise undo a newer one. A
  // change that fails drops its mark once nothing newer is queued for the
  // lesson, so the checkbox falls back to the last enrollment the API sent.
  let changes = Promise.resolve()
  const [markFailed, setMarkFailed] = createSignal(false)
  const markDone = (code: string, done: boolean) => {
    const courseId = params.id
    const key = markKey(courseId, code)
    setMarks((prev) => new Map(prev).set(key, { done, sending: (prev.get(key)?.sending ?? 0) + 1 }))
    setMarkFailed(false)
    changes = changes.then(async () => {
      try {
        const changed = await setLessonDone(courseId, code, done)
        if (courseId === params.id) setEnrollment(changed)
      } catch (error) {
        if (paymentRequired(error)) refreshBilling(true)
        if (courseId === params.id) setMarkFailed(true)
      } finally {
        setMarks((prev) => {
          const mark = prev.get(key)!
          const next = new Map(prev)
          if (mark.sending > 1) next.set(key, { ...mark, sending: mark.sending - 1 })
          else next.delete(key)
          return next
        })
      }
    })
  }

  const [feedbackOpen, setFeedbackOpen] = createSignal(false)
  const sendFeedback = async (feedback: Feedback) => {
    const courseId = params.id
    try {
      const changed = await leaveFeedback(courseId, feedback)
      if (courseId === params.id) setEnrollment(changed)
    } catch (error) {
      if (!paymentRequired(error)) throw error
      refreshBilling(true) // the page turns locked, which takes the feedback with it
    }
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
  // with the modules they haven't finished open. This is settled when the
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
      const finished = (m: Module) => !!enrolled() && !!m.lessons?.every((l) => doneCodes().has(l.code))
      setOpen(new Set(c.modules.flatMap((m, i) => (finished(m) ? [] : [i]))))
    }),
  )
  const toggle = (i: number) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (!next.delete(i)) next.add(i)
      return next
    })

  /** The side column once enrolled: progress, counted from the marks so it moves with the checkboxes, outcomes as the member unlocks them, and their feedback. */
  const EnrolledPanels = () => (
    <>
      <div class={styles.panel}>
        <div class={styles.progressHead}>
          <span class={styles.statLabel}>Progress</span>
          <span class={styles.progressRow}>
            <span class={styles.statValue}>
              {doneCodes().size} of {loaded()!.lessonCount}
            </span>
            <span class={styles.statSub}>{progress()}%</span>
          </span>
          <span class={styles.bar} aria-hidden="true">
            <For each={allLessons(loaded()!)}>{(l) => <span classList={{ [styles.barDone]: doneCodes().has(l.code) }} />}</For>
          </span>
        </div>
      </div>

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

      <Show when={!locked() || enrolled()?.feedback}>
        <div class={styles.panel}>
          <div class={`${styles.panelHead} ${styles.tight}`}>
            <h2 class={styles.sectionTitle}>{enrolled()?.feedback ? 'Your feedback' : 'Leave a feedback'}</h2>
            <Show when={enrolled()?.feedback && !locked()}>
              <button type="button" class={styles.edit} onClick={() => setFeedbackOpen(true)}>
                Edit
              </button>
            </Show>
          </div>
          <Show
            when={enrolled()?.feedback}
            fallback={
              <>
                <p class={styles.feedbackBlurb}>Tell the course author what is working and what is not. It takes a minute.</p>
                <Button variant="outline" size="md" class={styles.feedbackButton} onClick={() => setFeedbackOpen(true)}>
                  Leave a feedback
                </Button>
              </>
            }
          >
            {/* The design dates the feedback beside its rating, which waits for the API to send when it was left. */}
            {(f) => (
              <div class={styles.sent}>
                <div class={styles.sentRating}>
                  <span class={styles.sentStars} role="img" aria-label={`${f().rating} of 5 stars`}>
                    <For each={RATINGS}>{(_, i) => <span classList={{ [styles.lit]: i() < f().rating }}>★</span>}</For>
                  </span>
                  <span class={styles.sentLabel}>{RATINGS[f().rating - 1]}</span>
                </div>
                <Show when={f().message.trim()} fallback={<span class={styles.noMessage}>No message added.</span>}>
                  <p class={styles.sentMessage}>{f().message}</p>
                </Show>
              </div>
            )}
          </Show>
        </div>
      </Show>
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
                  <Switch>
                    <Match when={access() === true}>
                      <Button variant="primary" size="md" disabled={enrolling()} onClick={() => void startCourse()}>
                        {enrolling() ? 'Enrolling…' : 'Enroll →'}
                      </Button>
                      <Show when={enrollFailed()}>
                        <span class={styles.ctaNote} role="alert">
                          That didn't go through. Try again.
                        </span>
                      </Show>
                    </Match>
                    <Match when={locked()}>
                      <Button variant="primary" size="md" href={CHECKOUT_HREF}>
                        Subscribe →
                      </Button>
                      <span class={styles.ctaNote}>Included with the subscription.</span>
                    </Match>
                  </Switch>
                </Show>
              </div>
            </section>

            {/* The design's rating and enrolled count wait for the API to send them. */}
            <Show when={!enrolled()}>
              <section class={styles.stats}>
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
              </section>
            </Show>

            <Show when={enrolled() && locked()}>
              <section class={styles.upNextBand}>
                <Critter kind="circle" hue={255} size={48} />
                <div class={styles.upNextText}>
                  <span class={styles.upNextMeta}>Included with the subscription</span>
                  <span class={`${styles.upNextTitle} ${styles.lockedTitle}`}>Subscribe to pick up where you left off</span>
                </div>
                <Button variant="primary" size="md" class={styles.resume} href={CHECKOUT_HREF}>
                  Subscribe →
                </Button>
              </section>
            </Show>

            {/* Resume opens the lesson once there is a lesson player; until then it does nothing. */}
            <Show when={enrolled() && !locked() && nextLesson()}>
              {(l) => (
                <section class={styles.upNextBand}>
                  <Critter kind="circle" hue={255} size={48} />
                  <div class={styles.upNextText}>
                    <span class={styles.upNextMeta}>
                      Up next · {STEP_BY_KEY[l().steps[0]]?.name ?? 'Lesson'} · {l().minutes} min
                    </span>
                    <span class={styles.upNextTitle}>
                      {l().code} {l().title}
                    </span>
                  </div>
                  <Button variant="primary" size="md" class={styles.resume}>
                    Resume lesson →
                  </Button>
                </section>
              )}
            </Show>

            <section class={styles.body}>
              <div class={styles.syllabus}>
                <div class={styles.syllabusHead}>
                  <h2 class={styles.sectionTitle}>Syllabus</h2>
                  <Show when={markFailed() && !locked()}>
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
                                        disabled={locked()}
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

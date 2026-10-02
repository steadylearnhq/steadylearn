import { A, useParams } from '@solidjs/router'
import { createResource, createSignal, For, Match, Show, Switch } from 'solid-js'
import Button from '../../components/Button'
import Critter from '../../components/Critter'
import StepIcon from '../../components/StepIcon'
import { domainDot, formatLength, levelLabel, plural, type Course, type Lesson, type Module } from '../../data/catalog'
import { STEP_BY_KEY, type LessonStepKey } from '../../data/lessonSteps'
import { ApiError } from '../../lib/api'
import { fetchCatalog, fetchCourse } from '../../lib/catalog'
import { enroll } from '../../lib/enrollments'
import { usePageTitle } from '../../lib/title'
import NotFound from '../NotFound'
import styles from './Course.module.css'

/** Watching and reading are how every lesson starts; the other steps are its practice. */
const practice = (steps: LessonStepKey[]) => steps.filter((s) => s !== 'watch' && s !== 'read')

/** How many of a module's lessons use each practice step, in order of first use. */
const practiceMix = (lessons: Lesson[]) => {
  const counts = new Map<LessonStepKey, number>()
  for (const l of lessons) for (const s of practice(l.steps)) counts.set(s, (counts.get(s) ?? 0) + 1)
  return [...counts]
}

const moduleMeta = (m: Module) =>
  m.lessons
    ? `${plural(m.lessons.length, 'lesson')} · ${m.lessons.reduce((sum, l) => sum + l.minutes, 0)} min`
    : plural(m.lessonCount, 'lesson')

// Break-its don't carry a critter of their own, so each takes the next hue in turn.
const BREAK_HUES = [255, 165, 85, 205, 290, 35]

const Chevron = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M9 6l6 6-6 6" />
  </svg>
)

/** A course's own page, as a member sees it, with the button to enroll in it. */
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
  const doneCodes = () => new Set(enrolled()?.completedLessons)
  const [enrolling, setEnrolling] = createSignal(false)
  const [enrollFailed, setEnrollFailed] = createSignal(false)
  const startCourse = async () => {
    const courseId = params.id
    setEnrolling(true)
    setEnrollFailed(false)
    try {
      const made = await enroll(courseId)
      if (courseId === params.id) setCourse((prev) => prev && { ...prev, enrollment: made })
    } catch {
      if (courseId === params.id) setEnrollFailed(true)
    } finally {
      setEnrolling(false)
    }
  }

  const domainName = (id: string) => listed()?.domains.find((d) => d.id === id)?.name ?? ''
  const prerequisites = () =>
    (loaded()?.prerequisites ?? []).flatMap((p) => {
      const c = listed()?.courses.find((c) => c.id === p.id)
      return c ? [{ course: c, optional: p.optional }] : []
    })

  // Modules start open; these are the ones the member has folded.
  const [folded, setFolded] = createSignal<ReadonlySet<number>>(new Set())
  const toggle = (i: number) =>
    setFolded((prev) => {
      const next = new Set(prev)
      if (!next.delete(i)) next.add(i)
      return next
    })

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
              {/* Enrolled, the design resumes the course here, which waits for the lesson player. */}
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
                        <For each={c().modules.flatMap((m) => m.lessons ?? [])}>
                          {(l) => <span classList={{ [styles.barDone]: doneCodes().has(l.code) }} />}
                        </For>
                      </span>
                    </span>
                  </div>
                )}
              </Show>
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

            <section class={styles.body}>
              <div class={styles.syllabus}>
                <h2 class={styles.sectionTitle}>Syllabus</h2>
                <For each={c().modules}>
                  {(m, i) => {
                    const open = () => !folded().has(i())
                    const panel = `module-${i()}`
                    return (
                      <div class={styles.module} classList={{ [styles.open]: open() }}>
                        <button
                          type="button"
                          class={styles.moduleHead}
                          aria-expanded={open()}
                          aria-controls={panel}
                          onClick={() => toggle(i())}
                        >
                          <span class={styles.chevron}>
                            <Chevron />
                          </span>
                          <span class={styles.code}>{String(i() + 1).padStart(2, '0')}</span>
                          <span class={styles.moduleTitle}>{m.title}</span>
                          <span class={styles.moduleMeta}>
                            <Show when={!open() && m.lessons && practiceMix(m.lessons).length}>
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
                            <span>{moduleMeta(m)}</span>
                          </span>
                        </button>
                        <Show when={open() && m.lessons?.length}>
                          <ul id={panel} class={styles.lessons}>
                            <For each={m.lessons}>
                              {(l) => (
                                <li class={styles.lesson}>
                                  <span />
                                  <span class={styles.code}>{l.code}</span>
                                  <span class={styles.lessonTitle}>{l.title}</span>
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
                              )}
                            </For>
                          </ul>
                        </Show>
                      </div>
                    )
                  }}
                </For>
              </div>

              <aside class={styles.aside}>
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
                            <span>{o}</span>
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
              </aside>
            </section>

            <Show when={prerequisites().length}>
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

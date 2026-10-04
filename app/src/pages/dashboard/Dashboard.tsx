import { A } from '@solidjs/router'
import { createResource, createSignal, For, Match, Show, Switch } from 'solid-js'
import Button from '../../components/Button'
import Critter from '../../components/Critter'
import { domainDot, domainName, domainStyle, formatLength, levelLabel } from '../../data/catalog'
import { BOARDS, KPIS, RECOMMENDED, UP_NEXT } from '../../data/dashboard'
import { STEP_BY_KEY } from '../../data/lessonSteps'
import { user } from '../../lib/auth'
import { loadMyCourses } from '../../lib/myCourses'
import { usePageTitle } from '../../lib/title'
import styles from './Dashboard.module.css'

const courseHref = (id: string) => `/courses/${id}`

const greeting = (hour: number) => (hour < 5 ? 'Good evening' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening')

/** ISO 8601 week number: weeks start on Monday and week 1 holds the year's first Thursday. */
function isoWeek(date: Date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1)
  return Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7)
}

export default function Dashboard() {
  usePageTitle('Home')
  const now = new Date()
  const today = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
  // Without a name on the account, `name` falls back to the email, which reads oddly in a greeting.
  const firstName = () => {
    const name = user()?.name ?? ''
    return name.includes('@') ? '' : name.split(' ')[0]
  }

  // The courses the member has started and not finished, most recently enrolled first.
  const [mine, { refetch }] = createResource(() => user()?.id, loadMyCourses)
  const inProgress = () => (mine.state === 'ready' ? mine().filter((m) => !m.finished).slice(0, 3) : undefined)

  const [board, setBoard] = createSignal<'following' | 'all'>('following')
  const upNext = UP_NEXT
  const upNextDomain = domainStyle(upNext.course.domain)

  return (
    <main class={styles.page}>
      <section class={styles.head}>
        <h1 class={styles.title}>
          {greeting(now.getHours())}
          {firstName() ? `, ${firstName()}` : ''}
        </h1>
        <span class={styles.date}>
          {today} · week {isoWeek(now)}
        </span>
      </section>

      <section class={styles.upNext}>
        <div class={styles.upNextLesson}>
          <Critter kind={upNextDomain.kind} hue={upNextDomain.hue} size={56} />
          <div class={styles.upNextText}>
            <span class={styles.upNextMeta}>
              Up next · {STEP_BY_KEY[upNext.step].name} · {upNext.course.title} · {upNext.minutes} min
            </span>
            <span class={styles.upNextTitle}>
              {upNext.code} {upNext.title}
            </span>
          </div>
        </div>
        <Button variant="primary" size="lg" class={styles.resume} href={courseHref(upNext.course.id)}>
          Resume lesson →
        </Button>
      </section>

      <section class={styles.kpis} aria-label="This week">
        <For each={KPIS}>
          {(k) => (
            <div class={styles.kpi}>
              <span class={styles.kpiLabel}>{k.label}</span>
              <span class={styles.kpiValue}>{k.value}</span>
              <span class={styles.kpiSub} classList={{ [styles.highlight]: k.highlight }}>
                {k.sub}
              </span>
            </div>
          )}
        </For>
      </section>

      <section class={styles.split}>
        <div class={styles.continue}>
          <div class={styles.sectionHead}>
            <h2 class={styles.sectionTitle}>Continue learning</h2>
            <A href="/my-courses" class={styles.more}>
              My courses →
            </A>
          </div>
          <Switch>
            <Match when={mine.error}>
              <div class={styles.continueEmpty} role="alert">
                <span>Your courses didn't load.</span>
                <button type="button" class={styles.continueAction} onClick={() => void refetch()}>
                  Try again
                </button>
              </div>
            </Match>
            <Match when={inProgress()?.length === 0}>
              <div class={styles.continueEmpty}>
                <span>Nothing in progress.</span>
                <A href="/catalog" class={styles.continueAction}>
                  Find a course →
                </A>
              </div>
            </Match>
          </Switch>
          <ul class={styles.continueList} aria-busy={!inProgress() && !mine.error}>
            <For each={inProgress()}>
              {(m) => {
                const domain = domainStyle(m.course.domain)
                return (
                  <li class={styles.continueRow}>
                    <Critter kind={domain.kind} hue={domain.hue} size={32} />
                    <div class={styles.continueText}>
                      <span class={styles.continueTitle}>{m.course.title}</span>
                      <span class={styles.continueNext}>
                        {m.next ? `Next: ${m.next.code} ${m.next.title} · ${m.next.minutes} min` : ''}
                      </span>
                    </div>
                    <span
                      class={styles.progressTrack}
                      role="progressbar"
                      aria-label={`${m.course.title} progress`}
                      aria-valuenow={m.enrollment.progress}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <span class={styles.progressFill} style={{ width: `${m.enrollment.progress}%` }} />
                    </span>
                    <Button variant="outline" size="sm" class={styles.continueCta} href={courseHref(m.course.id)}>
                      {m.next ? `Resume ${m.next.code} →` : 'Resume →'}
                    </Button>
                  </li>
                )
              }}
            </For>
          </ul>
        </div>

        <aside class={styles.board}>
          <div class={styles.sectionHead}>
            <h2 class={styles.sectionTitle}>Leaderboard</h2>
            <div class={styles.toggle} role="radiogroup" aria-label="Leaderboard">
              <For each={[['following', 'Following'], ['all', 'All']] as const}>
                {([value, label]) => (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={board() === value}
                    class={styles.toggleOption}
                    onClick={() => setBoard(value)}
                  >
                    {label}
                  </button>
                )}
              </For>
            </div>
          </div>
          <ol class={styles.boardList}>
            <For each={BOARDS[board()]}>
              {(p) => (
                <li class={styles.boardRow} classList={{ [styles.you]: p.you }}>
                  <span class={styles.rank}>{p.rank}</span>
                  <span class={styles.avatar} style={{ background: `oklch(var(--avL) 0.1 ${p.hue})` }}>
                    {p.you ? initials(user()?.name) : p.initials}
                  </span>
                  <span class={styles.boardName}>{p.name}</span>
                  <span class={styles.points}>{p.points}</span>
                </li>
              )}
            </For>
          </ol>
        </aside>
      </section>

      <section class={styles.recs}>
        <div class={styles.sectionHead}>
          <h2 class={styles.sectionTitle}>Broaden your T-shape</h2>
          <A href="/catalog" class={styles.more}>
            Full catalog →
          </A>
        </div>
        <div class={styles.recGrid}>
          <For each={RECOMMENDED}>
            {(c) => (
              <A href={courseHref(c.id)} class={styles.rec}>
                <div class={styles.recMeta}>
                  <span class={styles.dot} style={{ background: domainDot(c.domain) }} />
                  <span>{domainName(c.domain)}</span>
                  <span class={styles.spacer} />
                  <Show when={c.isNew}>
                    <span class={styles.badge}>new</span>
                  </Show>
                </div>
                <span class={styles.recTitle}>{c.title}</span>
                <span class={styles.recDescription}>{c.description}</span>
                <div class={styles.recFacts}>
                  <span class={styles.level}>{levelLabel(c.level)}</span>
                  <span>{formatLength(c.minutes)}</span>
                  <span>{c.lessonCount} lessons</span>
                </div>
              </A>
            )}
          </For>
        </div>
      </section>
    </main>
  )
}

const initials = (name = '') =>
  name.includes('@')
    ? name[0].toUpperCase()
    : name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0].toUpperCase())
        .join('')

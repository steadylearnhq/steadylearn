import { createResource, createSignal, For, Match, Show, Switch } from 'solid-js'
import Button from '../../components/Button'
import { COURSES, plural } from '../../data/catalog'
import { user } from '../../lib/auth'
import {
  daysUntil,
  formatBillingDate,
  formatDay,
  formatDayLong,
  formatMonth,
  formatShortDate,
  type Payment,
  type Subscription as Sub,
} from '../../lib/billing'
import { fetchCatalog } from '../../lib/catalog'
import PaymentRows from './PaymentRows'
import PaymentsDrawer from './PaymentsDrawer'
import { CHARGE, FREE_COURSE, PERIOD, PRICE } from './plans'
import styles from './Membership.module.css'

/** The states of a subscription that this part of the page shows. */
export type MemberView = 'active' | 'ending' | 'pastDue' | 'paused'

export type BillingAction = 'cancel' | 'resume' | 'portal'

type MembershipProps = {
  view: MemberView
  subscription: Sub
  /** Undefined while loading; null when they couldn't be loaded. */
  payments: Payment[] | null | undefined
  onRetryPayments: () => void
  busy: BillingAction | null
  askCancel: boolean
  setAskCancel: (open: boolean) => void
  failure: string
  act: (action: BillingAction) => void
}

/** One cell of the facts row; `dot` colours the status, `danger` its value. */
type Fact = { key: string; value: string; sub: string; dot?: string; danger?: boolean }

/** How many payments the history shows before the drawer. */
const RECENT = 3

/** The failed payments since the last that went through, newest first. */
export const declinedPayments = (payments: Payment[] | null | undefined) => {
  const declined: Payment[] = []
  for (const p of payments ?? []) {
    if (p.status === 'paid') break
    if (p.status === 'failed') declined.push(p)
  }
  return declined
}

const ordinal = (n: number) => {
  const tens = n % 100
  const suffix = tens >= 11 && tens <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'
  return `${n}${suffix}`
}

/** A list in a sentence: a, b and c. */
const listed = (items: string[]) =>
  items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`

/** Days payments were declined, oldest first: "14, 21 and 28 September" when they share a month. */
const declinedDays = (payments: Payment[]) => {
  const dates = payments.map((p) => new Date(p.date)).reverse()
  const month = (d: Date) => d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  if (dates.every((d) => month(d) === month(dates[0]))) {
    const last = dates[dates.length - 1].toLocaleDateString('en-GB', { month: 'long' })
    return `${listed(dates.map((d) => String(d.getDate())))} ${last}`
  }
  return listed(dates.map((d) => formatDayLong(d.toISOString())))
}

const monthBefore = (date: Date) => {
  const start = new Date(date)
  start.setMonth(start.getMonth() - 1)
  return start
}

/**
 * A subscriber's side of the Subscription page: what their subscription
 * stands at, the current period, the way to the billing portal, their
 * payments, and cancelling or resuming.
 */
export default function Membership(props: MembershipProps) {
  const [drawer, setDrawer] = createSignal(false)
  const [catalog] = createResource(fetchCatalog)

  const sub = () => props.subscription
  const end = () => sub().currentPeriodEnd
  const busy = () => !!props.busy
  const paidCount = () => props.payments?.filter((p) => p.status === 'paid').length
  const declined = () => declinedPayments(props.payments)

  const facts = (): Fact[] => {
    const price = { key: 'price', value: PRICE, sub: PERIOD }
    const count = paidCount()
    const member = {
      key: 'member since',
      value: formatMonth(sub().memberSince),
      sub: count === undefined ? '' : plural(count, 'payment'),
    }
    switch (props.view) {
      case 'active':
        return [
          { key: 'status', value: 'Active', sub: 'renews automatically', dot: 'var(--ok)' },
          { key: 'next charge', value: sub().nextChargeAt ? formatShortDate(sub().nextChargeAt!) : '—', sub: CHARGE },
          price,
          member,
        ]
      case 'ending':
        return [
          { key: 'status', value: 'Ending', sub: 'won’t renew', dot: 'var(--tomato)' },
          {
            key: 'access until',
            value: end() ? formatShortDate(end()!) : '—',
            sub: end() ? `${plural(daysUntil(end()!), 'day')} left` : '',
          },
          price,
          member,
        ]
      case 'pastDue': {
        const times = declined().length
        const until = sub().nextChargeAt ?? end()
        return [
          {
            key: 'status',
            value: 'Payment failed',
            sub: times > 1 ? `declined ${times} times` : 'declined',
            dot: 'var(--err)',
            danger: true,
          },
          { key: 'access until', value: until ? formatShortDate(until) : '—', sub: 'if the next retry fails' },
          price,
          member,
        ]
      }
      case 'paused':
        return [
          { key: 'status', value: 'Paused', sub: 'won’t renew', dot: 'var(--muted)' },
          { key: 'next charge', value: '—', sub: 'when you resume' },
          price,
          member,
        ]
    }
  }

  // The current period, and where today falls in it. A failed payment's
  // period runs to the next retry. A subscription stored before the API kept
  // the period's start is taken to have started a month before it ends.
  const period = () => {
    if (props.view === 'paused') return undefined
    const endIso = props.view === 'pastDue' ? (sub().nextChargeAt ?? end()) : end()
    if (!endIso) return undefined
    const to = new Date(endIso)
    const from = sub().currentPeriodStart ? new Date(sub().currentPeriodStart!) : monthBefore(new Date(end() ?? endIso))
    const now = new Date()
    const span = to.getTime() - from.getTime()
    const pct = span > 0 ? Math.min(100, Math.max(0, ((now.getTime() - from.getTime()) / span) * 100)) : 100
    const label = { active: 'renews', ending: 'access ends', pastDue: 'next retry' }[props.view]
    return { from: formatDay(from), to: `${formatDay(to)} · ${label}`, today: formatDay(now), pct }
  }

  const billingDay = () => {
    const iso = end() ?? sub().currentPeriodStart
    return iso ? `Charged on the ${ordinal(new Date(iso).getDate())} of each month. ` : ''
  }

  const portalRow = () =>
    props.view === 'pastDue'
      ? {
          title: 'Update your payment method',
          desc: `${declined().length ? `Declined on ${declinedDays(declined())}.` : 'Your last payment was declined.'} Change your card on our payment provider’s secure page.`,
        }
      : {
          title: 'Billing portal',
          desc: 'Change your payment method and billing details on our payment provider’s secure page.',
        }

  // A cancelled subscription has no row here: the heading already offers to resume it.
  const endRow = () => {
    switch (props.view) {
      case 'ending':
        return undefined
      case 'paused':
        return { title: 'Resume subscription', desc: `Open every course again, for ${PRICE} a month.` }
      case 'pastDue':
        return { title: 'Cancel subscription', desc: 'Stops the retries. Paid courses lock right away; your progress is kept.' }
      default:
        return {
          title: 'Cancel subscription',
          desc: end() ? `No further charges. You keep access until ${formatBillingDate(end())}.` : 'No further charges.',
        }
    }
  }

  // Paid courses the member has made progress in, to say it is kept.
  const coursesInProgress = () => {
    const c = catalog.state === 'ready' ? catalog() : undefined
    if (!c) return []
    return (c.enrollments ?? [])
      .filter((e) => e.lessonsDone > 0)
      .map((e) => c.courses.find((course) => course.id === e.courseId))
      .filter((course) => course && !course.isFree)
      .map((course) => course!.title)
  }

  const cancelWarning = () => {
    if (props.view === 'pastDue')
      return `Paid courses lock right away. Your progress and bets are kept, and ${FREE_COURSE.title} stays open.`
    const access = end() ? `Your access continues until ${formatBillingDate(end())}. After that, ` : 'When the period ends, '
    const locked = `${COURSES.length - 1} courses lock again`
    const kept = coursesInProgress()
    return kept.length
      ? `${access}${locked}. Progress in ${listed(kept)} is kept, and ${FREE_COURSE.title} stays open.`
      : `${access}${locked}. Your progress is kept, and ${FREE_COURSE.title} stays open.`
  }

  const portal = () => props.act('portal')

  return (
    <>
      <section class={styles.facts}>
        <For each={facts()}>
          {(f) => (
            <div class={styles.fact}>
              <span class={styles.factKey}>{f.key}</span>
              <div class={styles.factValueLine}>
                <Show when={f.dot}>
                  {(dot) => <span class={styles.factDot} style={{ background: dot() }} aria-hidden="true" />}
                </Show>
                <span class={styles.factValue} classList={{ [styles.danger]: !!f.danger }}>
                  {f.value}
                </span>
              </div>
              <span class={styles.factSub}>{f.sub}</span>
            </div>
          )}
        </For>
      </section>

      <Show when={period()}>
        {(p) => (
          <section class={styles.period} aria-label="Current period">
            <div class={styles.periodEnds}>
              <span>current period · {p().from}</span>
              <span classList={{ [styles.endsSoon]: props.view === 'ending', [styles.danger]: props.view === 'pastDue' }}>
                {p().to}
              </span>
            </div>
            <div class={styles.track} classList={{ [styles.trackDanger]: props.view === 'pastDue' }}>
              <span class={styles.fill} style={{ width: `${p().pct}%` }} />
              <span class={styles.marker} style={{ left: `${p().pct}%` }} />
            </div>
            <div class={styles.todayLine}>
              <span
                class={styles.today}
                classList={{ [styles.todayStart]: p().pct < 8, [styles.todayEnd]: p().pct > 92 }}
                style={{ left: `${p().pct}%` }}
              >
                today · {p().today}
              </span>
            </div>
          </section>
        )}
      </Show>

      {/* With nothing below them, the columns close the page: their divider runs down to the footer. */}
      <div class={styles.columns} classList={{ [styles.columnsLast]: !endRow() }}>
        <section class={styles.column}>
          <h2 class={styles.heading}>Manage subscription</h2>
          <span class={styles.headingNote}>
            {billingDay()}
            {user()?.email ? `Receipts go to ${user()!.email}.` : ''}
          </span>
          <div class={styles.portalRow} classList={{ [styles.portalRowDanger]: props.view === 'pastDue' }}>
            <div class={styles.portalText}>
              <span class={styles.portalTitle}>{portalRow().title}</span>
              <span class={styles.portalDesc} classList={{ [styles.danger]: props.view === 'pastDue' }}>
                {portalRow().desc}
              </span>
            </div>
            <Button
              variant={props.view === 'pastDue' ? 'primary' : 'outline'}
              size="xs"
              class={styles.rowButton}
              disabled={busy()}
              onClick={portal}
            >
              {props.busy === 'portal' ? 'Opening…' : 'Open ↗'}
            </Button>
          </div>
          <Show when={!endRow() && props.failure}>
            <p class={styles.columnFailure} role="alert">
              {props.failure}
            </p>
          </Show>
        </section>

        <section class={styles.column}>
          <div class={styles.historyHead}>
            <h2 class={styles.heading}>Billing history</h2>
            <Show when={(props.payments?.length ?? 0) > RECENT}>
              <button type="button" class={styles.allPayments} onClick={() => setDrawer(true)}>
                All {props.payments!.length} payments →
              </button>
            </Show>
          </div>
          <span class={styles.headingNote}>Amounts include VAT.</span>
          <Switch>
            <Match when={props.payments === null}>
              <div class={styles.historyNote}>
                <span>We couldn’t load your payments.</span>
                <Button variant="outline" size="xs" onClick={() => props.onRetryPayments()}>
                  Try again
                </Button>
              </div>
            </Match>
            <Match when={props.payments === undefined}>
              <span class={styles.historyNote}>Loading payments…</span>
            </Match>
            <Match when={props.payments!.length === 0}>
              <span class={styles.historyNote}>No payments yet.</span>
            </Match>
            <Match when={true}>
              <PaymentRows payments={props.payments!.slice(0, RECENT)} disabled={busy()} onPortal={portal} />
            </Match>
          </Switch>
        </section>
      </div>

      <Show when={endRow()}>
        {(row) => (
          <section class={styles.end}>
            <div class={styles.endRow}>
              <div class={styles.portalText}>
                <span class={styles.portalTitle}>{row().title}</span>
                <span class={styles.endDesc}>{row().desc}</span>
              </div>
              <Switch>
                <Match when={props.view === 'paused'}>
                  <Button variant="primary" size="xs" class={styles.rowButton} disabled={busy()} onClick={() => props.act('resume')}>
                    {props.busy === 'resume' ? 'Resuming…' : 'Resume subscription'}
                  </Button>
                </Match>
                <Match when={true}>
                  <Button
                    variant="dangerOutline"
                    size="xs"
                    class={styles.rowButton}
                    disabled={busy()}
                    onClick={() => props.setAskCancel(true)}
                  >
                    Cancel subscription
                  </Button>
                </Match>
              </Switch>
            </div>
            <Show when={props.askCancel && (props.view === 'active' || props.view === 'pastDue')}>
              <div class={styles.cancelPanel}>
                <p class={styles.cancelWarning}>{cancelWarning()}</p>
                <div class={styles.cancelActions}>
                  <Button variant="outline" size="xs" disabled={busy()} onClick={() => props.setAskCancel(false)}>
                    Keep subscription
                  </Button>
                  <Button variant="danger" size="xs" disabled={busy()} onClick={() => props.act('cancel')}>
                    {props.busy === 'cancel' ? 'Cancelling…' : 'Cancel subscription'}
                  </Button>
                </div>
              </div>
            </Show>
            <Show when={props.failure}>
              <p class={styles.failure} role="alert">
                {props.failure}
              </p>
            </Show>
          </section>
        )}
      </Show>

      <Show when={drawer() && props.payments}>
        {(all) => <PaymentsDrawer payments={all()} disabled={busy()} onPortal={portal} onClose={() => setDrawer(false)} />}
      </Show>
    </>
  )
}

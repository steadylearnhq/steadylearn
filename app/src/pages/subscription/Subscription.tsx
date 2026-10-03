import { A, useNavigate, useSearchParams } from '@solidjs/router'
import { createEffect, createSignal, For, on, onCleanup, onMount, Show, type JSX } from 'solid-js'
import Button from '../../components/Button'
import Critter, { type CritterMood } from '../../components/Critter'
import { HOME } from '../../components/RouteGuards'
import Toast from '../../components/Toast'
import { COURSES, DOMAINS } from '../../data/catalog'
import { ApiError } from '../../lib/api'
import {
  billing,
  cancelSubscription,
  daysUntil,
  formatBillingDate,
  formatDayLong,
  loadBilling,
  loadPayments,
  openPortal,
  payments,
  preloadPortal,
  resumeSubscription,
  syncSubscription,
  type Billing,
  type Subscription as Sub,
} from '../../lib/billing'
import { usePageTitle } from '../../lib/title'
import Membership, { declinedPayments, type BillingAction, type MemberView } from './Membership'
import { FREE_COURSE, FREE_DESCRIPTION, FREE_FEATURES, PERIOD, PRICE, SUBSCRIPTION_FEATURES, type Feature } from './plans'
import styles from './Subscription.module.css'

function Features(props: { items: Feature[] }) {
  return (
    <ul class={styles.features}>
      <For each={props.items}>
        {(f) => (
          <li class={styles.feature}>
            <span class={styles.featureLabel}>{f.label}</span>
            <span class={styles.featureMeta}>{f.meta}</span>
          </li>
        )}
      </For>
    </ul>
  )
}

/**
 * Which of the page's states a subscription puts the member in. A subscription
 * that no longer gives access, whatever Creem calls it, leaves them on the free
 * plan with the way to subscribe again.
 */
type View = 'free' | 'ended' | 'active' | 'ending' | 'pastDue' | 'paused'

function viewOf(subscription: Sub | null): View {
  if (!subscription) return 'free'
  switch (subscription.status) {
    case 'active':
    case 'trialing':
      return 'active'
    case 'past_due':
    case 'unpaid':
      return 'pastDue'
    case 'paused':
      return 'paused'
    case 'scheduled_cancel':
      return subscription.entitled ? 'ending' : 'ended'
    default:
      return 'ended'
  }
}

/** Waits between tries at confirming a payment, so a slow webhook or Creem gets time to catch up. */
const CONFIRM_DELAYS = [0, 2000, 4000, 8000]

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** What a failed billing call tells the member. */
const FAILURE = 'Billing is unavailable right now. Try again in a minute.'

/** How long a confirmation stays up. */
const TOAST_MS = 2600

const isMember = (view: View): view is MemberView => view !== 'free' && view !== 'ended'

/** How the critters by the heading feel about the member's plan. */
const critterMood = (view: View, kind: string, i: number): CritterMood => {
  switch (view) {
    case 'active':
      return i % 2 ? 'awake' : 'happy'
    case 'ending':
      return i % 2 ? 'asleep' : 'awake'
    case 'pastDue':
    case 'paused':
      return 'awake'
    default:
      return kind === 'die' ? 'happy' : 'asleep'
  }
}

/**
 * The member's plan. On the free plan, the free and subscription plans side by
 * side; with a subscription, where it stands, the current period, the billing
 * portal, their payments, and cancelling or resuming. Coming back from Creem's
 * checkout (?checkout=success), it confirms the payment first.
 */
export default function Subscription() {
  usePageTitle('Subscription')
  const navigate = useNavigate()
  const [params] = useSearchParams<{ checkout?: string; subscription_id?: string }>()

  const [failed, setFailed] = createSignal(false)
  const [confirming, setConfirming] = createSignal<'no' | 'waiting' | 'slow'>(params.checkout === 'success' ? 'waiting' : 'no')
  const [busy, setBusy] = createSignal<BillingAction | null>(null)
  const [askCancel, setAskCancel] = createSignal(false)
  const [failure, setFailure] = createSignal('')
  const [paymentsFailed, setPaymentsFailed] = createSignal(false)
  const [toast, setToast] = createSignal<string>()

  let gone = false
  let toastTimer: ReturnType<typeof setTimeout> | undefined
  onCleanup(() => {
    gone = true
    clearTimeout(toastTimer)
  })

  const flash = (message: string) => {
    clearTimeout(toastTimer)
    setToast(message)
    toastTimer = setTimeout(() => setToast(undefined), TOAST_MS)
  }

  const load = () => {
    setFailed(false)
    loadBilling().catch(() => setFailed(true))
  }

  // Creem sends the member back once they've paid, with the subscription's id.
  // Syncing it reads the subscription straight from Creem, so this is usually
  // confirmed on the first try; the webhook catches up either way.
  const confirm = async () => {
    setConfirming('waiting')
    const subscriptionId = params.subscription_id
    for (const delay of CONFIRM_DELAYS) {
      if (delay) await sleep(delay)
      if (gone) return
      try {
        const state: Billing = subscriptionId ? await syncSubscription(subscriptionId) : await loadBilling(true)
        if (state.subscription?.entitled) {
          setConfirming('no')
          navigate('/subscription', { replace: true })
          flash('Subscription started · every course is open')
          return
        }
      } catch (error) {
        // Not the member's subscription, or not one Creem knows: retrying won't change that.
        if (error instanceof ApiError && error.status === 404) break
      }
    }
    if (gone) return
    setConfirming('slow')
    load()
  }

  onMount(() => (params.checkout === 'success' ? void confirm() : load()))

  const subscription = () => billing()?.subscription ?? null
  const view = () => viewOf(subscription())
  const periodEnd = () => formatBillingDate(subscription()?.currentPeriodEnd ?? null)

  // A subscriber's payments come from the payment provider, so they load after
  // the plan, and only for a member who has one.
  const fetchPayments = (fresh = false) => {
    setPaymentsFailed(false)
    loadPayments(fresh).catch(() => setPaymentsFailed(true))
  }
  createEffect(
    on(
      () => billing() && confirming() === 'no' && isMember(view()),
      (member) => member && fetchPayments(),
    ),
  )
  const memberPayments = () => (paymentsFailed() ? null : payments())

  // Anyone who has subscribed has the portal a click away, so its link is asked
  // for ahead and the click redirects at once.
  createEffect(
    on(
      () => billing() && confirming() === 'no' && view() !== 'free',
      (subscriber) => subscriber && preloadPortal(),
    ),
  )

  // The portal opens in another tab, where the member may change their card or
  // cancel; coming back to this one shows what they did.
  let leftForPortal = false
  const onReturn = () => {
    if (document.visibilityState !== 'visible' || !leftForPortal) return
    leftForPortal = false
    loadBilling(true).catch(() => {})
    fetchPayments(true)
  }
  document.addEventListener('visibilitychange', onReturn)
  onCleanup(() => document.removeEventListener('visibilitychange', onReturn))

  const openBillingPortal = async () => {
    setFailure('')
    leftForPortal = true
    const opening = openPortal()
    if (!opening) return
    setBusy('portal')
    try {
      await opening
    } catch {
      leftForPortal = false
      setFailure(FAILURE)
    }
    setBusy(null)
  }

  const act = async (action: BillingAction) => {
    if (action === 'portal') return openBillingPortal()
    setFailure('')
    setBusy(action)
    try {
      await (action === 'cancel' ? cancelSubscription() : resumeSubscription())
      setAskCancel(false)
      flash(action === 'cancel' ? 'Subscription canceled' : 'Subscription resumed')
    } catch (error) {
      // The subscription changed elsewhere, in the portal or another tab: show it as it is now.
      if (error instanceof ApiError && error.status === 409) {
        setAskCancel(false)
        await loadBilling(true).catch(() => {})
      } else {
        setFailure(FAILURE)
      }
    }
    setBusy(null)
  }

  const heading = (): { title: string; lede: JSX.Element; cta?: { label: string; action: BillingAction } } => {
    if (confirming() === 'waiting') return { title: 'Confirming your payment…', lede: 'This takes a few seconds.' }
    if (confirming() === 'slow')
      return {
        title: 'This is taking longer than usual.',
        lede: 'We’ll show your subscription as soon as the payment is confirmed. Check again in a minute.',
      }
    if (failed()) return { title: 'Your subscription', lede: 'We couldn’t load your plan.' }
    if (!billing()) return { title: 'Your subscription', lede: 'Loading your plan…' }
    const free = `${FREE_COURSE.title} is fully open. Subscribe for the other ${COURSES.length - 1} courses and everything we release next.`
    switch (view()) {
      case 'free':
      case 'ended':
        return { title: 'You’re on the free plan.', lede: free }
      case 'active': {
        const next = subscription()?.nextChargeAt ?? null
        return {
          title: 'Your subscription is active.',
          lede: next ? `Every course is open. It renews on ${formatBillingDate(next)} for ${PRICE}.` : 'Every course is open.',
        }
      }
      case 'ending': {
        const end = subscription()?.currentPeriodEnd ?? null
        const days = end ? daysUntil(end) : undefined
        return {
          title:
            days === undefined
              ? 'Your subscription is cancelled.'
              : days === 0
                ? 'Your subscription ends today.'
                : days === 1
                  ? 'Your subscription ends tomorrow.'
                  : `Your subscription ends in ${days} days.`,
          lede: end
            ? `You have full access until ${periodEnd()}. After that the paid courses lock again; your progress and bets are kept.`
            : 'After the current period the paid courses lock again; your progress and bets are kept.',
          cta: { label: busy() === 'resume' ? 'Resuming…' : 'Resume subscription', action: 'resume' },
        }
      }
      case 'pastDue': {
        const failed = declinedPayments(payments())[0]
        const next = subscription()?.nextChargeAt ?? null
        const declined = failed ? `The ${PRICE} payment due ${formatDayLong(failed.date)} was declined.` : `Your last ${PRICE} payment was declined.`
        return {
          title: 'We couldn’t charge your card.',
          lede: next
            ? `${declined} We’ll try again on ${formatDayLong(next)}. Update your card before then to keep every course open.`
            : `${declined} Update your card to keep every course open.`,
          cta: { label: busy() === 'portal' ? 'Opening…' : 'Update card', action: 'portal' },
        }
      }
      case 'paused':
        return {
          title: 'Your subscription is paused.',
          lede: 'Resume it to open every course again.',
          cta: { label: busy() === 'resume' ? 'Resuming…' : 'Resume subscription', action: 'resume' },
        }
    }
  }

  return (
    <main class={styles.page}>
      <section class={styles.head}>
        <div class={styles.headText}>
          <nav class={styles.crumbs} aria-label="Breadcrumb">
            <A href={HOME} class={styles.crumb}>
              home
            </A>
            <span aria-hidden="true">/</span>
            <span class={styles.here} aria-current="page">
              subscription
            </span>
          </nav>
          <h1 class={styles.title} aria-live="polite">
            {heading().title}
          </h1>
          <p class={styles.lede}>{heading().lede}</p>
          <Show when={confirming() === 'no' && heading().cta}>
            {(cta) => (
              <Button variant="primary" size="lg" class={styles.cta} disabled={!!busy()} onClick={() => void act(cta().action)}>
                {cta().label}
              </Button>
            )}
          </Show>
          <Show when={confirming() === 'slow'}>
            <Button variant="outline" size="md" onClick={() => void confirm()}>
              Check again
            </Button>
          </Show>
          <Show when={failed() && confirming() === 'no'}>
            <Button variant="outline" size="md" onClick={load}>
              Try again
            </Button>
          </Show>
        </div>
        <div class={styles.critters} aria-hidden="true">
          <For each={DOMAINS}>
            {(d, i) => (
              <Critter kind={d.kind} hue={d.hue} size={44} mood={critterMood(billing() ? view() : 'free', d.kind, i())} track={false} />
            )}
          </For>
        </div>
      </section>

      {/* Hidden while a payment is being confirmed, so nobody pays twice. */}
      <Show when={billing() && confirming() === 'no'}>
        <Show
          when={isMember(view()) && subscription()}
          fallback={
            <section class={styles.plans}>
              <div class={styles.plan}>
                <div class={styles.planHead}>
                  <h2 class={styles.planName}>Base</h2>
                  <Critter kind="die" hue={290} size={44} mood="happy" />
                </div>
                <div class={styles.priceBlock}>
                  <div class={styles.priceLine}>
                    <span class={styles.price}>Free</span>
                    <span class={styles.period}>forever</span>
                  </div>
                  <span class={styles.planDescription}>{FREE_DESCRIPTION}</span>
                </div>
                <span class={styles.current}>Current plan</span>
                <Features items={FREE_FEATURES} />
              </div>

              <div class={styles.plan}>
                <div class={styles.planHead}>
                  <h2 class={styles.planName}>Subscription</h2>
                </div>
                <div class={styles.priceBlock}>
                  <div class={styles.priceLine}>
                    <span class={styles.price}>{PRICE}</span>
                    <span class={styles.period}>{PERIOD}</span>
                  </div>
                  <span class={styles.planDescription}>Every course in the catalog, including the ones we release next.</span>
                </div>
                <div class={styles.actions}>
                  <Button variant="primary" size="lg" href="/subscription/checkout">
                    {view() === 'ended' ? 'Subscribe again →' : 'Subscribe →'}
                  </Button>
                  {/* A past subscriber still has invoices to download. */}
                  <Show when={view() === 'ended'}>
                    <Button variant="outline" size="lg" disabled={!!busy()} onClick={() => void act('portal')}>
                      Manage billing
                    </Button>
                  </Show>
                </div>
                <Show when={failure()}>
                  <p class={styles.failure} role="alert">
                    {failure()}
                  </p>
                </Show>
                <Features items={SUBSCRIPTION_FEATURES} />
              </div>
            </section>
          }
        >
          {(sub) => (
            <Membership
              view={view() as MemberView}
              subscription={sub()}
              payments={memberPayments()}
              onRetryPayments={() => fetchPayments(true)}
              busy={busy()}
              askCancel={askCancel()}
              setAskCancel={setAskCancel}
              failure={failure()}
              act={(action) => void act(action)}
            />
          )}
        </Show>
      </Show>
      <Toast message={toast()} />
    </main>
  )
}

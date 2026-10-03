import { A, useNavigate, useSearchParams } from '@solidjs/router'
import { createSignal, For, Match, onCleanup, onMount, Show, Switch, type JSX } from 'solid-js'
import Button from '../../components/Button'
import Critter from '../../components/Critter'
import { HOME } from '../../components/RouteGuards'
import { COURSES, DOMAINS } from '../../data/catalog'
import { ApiError } from '../../lib/api'
import {
  billing,
  cancelSubscription,
  formatBillingDate,
  loadBilling,
  openPortal,
  resumeSubscription,
  syncSubscription,
  type Billing,
  type Subscription as Sub,
} from '../../lib/billing'
import { usePageTitle } from '../../lib/title'
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

/**
 * The member's plan: the free and subscription plans side by side, with the
 * one they're on marked, and what they can do about it. Coming back from
 * Creem's checkout (?checkout=success), it confirms the payment first.
 */
export default function Subscription() {
  usePageTitle('Subscription')
  const navigate = useNavigate()
  const [params] = useSearchParams<{ checkout?: string; subscription_id?: string }>()

  const [failed, setFailed] = createSignal(false)
  const [confirming, setConfirming] = createSignal<'no' | 'waiting' | 'slow'>(params.checkout === 'success' ? 'waiting' : 'no')
  const [busy, setBusy] = createSignal<'cancel' | 'resume' | 'portal' | null>(null)
  const [askCancel, setAskCancel] = createSignal(false)
  const [failure, setFailure] = createSignal('')

  let gone = false
  onCleanup(() => (gone = true))

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
  const onFreePlan = () => view() === 'free' || view() === 'ended'
  const periodEnd = () => formatBillingDate(subscription()?.currentPeriodEnd ?? null)

  const act = async (action: 'cancel' | 'resume' | 'portal') => {
    setFailure('')
    setBusy(action)
    try {
      if (action === 'portal') {
        await openPortal()
        return // leaving for Creem
      }
      await (action === 'cancel' ? cancelSubscription() : resumeSubscription())
      setAskCancel(false)
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

  const heading = (): { title: string; lede: JSX.Element } => {
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
      case 'active':
        return {
          title: 'You’re subscribed.',
          lede: periodEnd() ? `Every course is open. Your subscription renews on ${periodEnd()}.` : 'Every course is open.',
        }
      case 'ending':
        return {
          title: periodEnd() ? `Your subscription ends on ${periodEnd()}.` : 'Your subscription is cancelled.',
          lede: 'You keep every course until then. Resume it to keep going after that.',
        }
      case 'pastDue':
        return {
          title: 'Your last payment didn’t go through.',
          lede: 'You still have every course while we retry it. Update your card to keep your subscription.',
        }
      case 'paused':
        return { title: 'Your subscription is paused.', lede: 'Resume it to open every course again.' }
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
            {(d) => (
              <Critter
                kind={d.kind}
                hue={d.hue}
                size={44}
                mood={d.kind === 'die' || (billing() && !onFreePlan()) ? 'happy' : 'asleep'}
                track={false}
              />
            )}
          </For>
        </div>
      </section>

      {/* Hidden while a payment is being confirmed, so nobody pays twice. */}
      <Show when={billing() && confirming() === 'no'}>
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
            <Show when={onFreePlan()}>
              <span class={styles.current}>Current plan</span>
            </Show>
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

            <Switch>
              <Match when={onFreePlan()}>
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
              </Match>
              <Match when={askCancel()}>
                <div class={styles.confirmCancel}>
                  <p class={styles.confirmText}>
                    {periodEnd()
                      ? `Cancel your subscription? You keep every course until ${periodEnd()}, and you won’t be charged again.`
                      : 'Cancel your subscription? You keep every course until the end of the period, and you won’t be charged again.'}
                  </p>
                  <div class={styles.actions}>
                    <Button variant="outline" size="lg" disabled={!!busy()} onClick={() => void act('cancel')}>
                      {busy() === 'cancel' ? 'Cancelling…' : 'Yes, cancel'}
                    </Button>
                    <Button variant="ghost" size="lg" disabled={!!busy()} onClick={() => setAskCancel(false)}>
                      Keep it
                    </Button>
                  </div>
                </div>
              </Match>
              <Match when={true}>
                <span class={styles.current}>Current plan</span>
                <div class={styles.actions}>
                  <Show when={view() === 'ending' || view() === 'paused'}>
                    <Button variant="primary" size="lg" disabled={!!busy()} onClick={() => void act('resume')}>
                      {busy() === 'resume' ? 'Resuming…' : 'Resume subscription'}
                    </Button>
                  </Show>
                  <Button
                    variant={view() === 'pastDue' ? 'primary' : 'outline'}
                    size="lg"
                    disabled={!!busy()}
                    onClick={() => void act('portal')}
                  >
                    {view() === 'pastDue' ? 'Update your card' : 'Manage billing'}
                  </Button>
                  <Show when={view() === 'active' || view() === 'pastDue'}>
                    <Button variant="ghost" size="lg" disabled={!!busy()} onClick={() => setAskCancel(true)}>
                      Cancel subscription
                    </Button>
                  </Show>
                </div>
              </Match>
            </Switch>
            <Show when={failure()}>
              <p class={styles.failure} role="alert">
                {failure()}
              </p>
            </Show>

            <Features items={SUBSCRIPTION_FEATURES} />
          </div>
        </section>
      </Show>
    </main>
  )
}

import { A, Navigate, useNavigate } from '@solidjs/router'
import { createSignal, For, onMount, Show } from 'solid-js'
import Button from '../../components/Button'
import Logo from '../../components/Logo'
import { ApiError } from '../../lib/api'
import { loadBilling, startCheckout, subscribed } from '../../lib/billing'
import { usePageTitle } from '../../lib/title'
import { PERIOD, PRICE, SUBSCRIPTION_FEATURES } from './plans'
import styles from './Checkout.module.css'

/**
 * The review before payment: what the subscription costs and gives, and the
 * way on to Creem's payment page. It stands alone, without the header and
 * footer. A member who already has access is sent back to their subscription.
 */
export default function Checkout() {
  usePageTitle('Review your subscription')
  const navigate = useNavigate()
  const [leaving, setLeaving] = createSignal(false)
  const [failure, setFailure] = createSignal('')

  onMount(() => void loadBilling().catch(() => {}))

  const pay = async () => {
    setFailure('')
    setLeaving(true)
    try {
      await startCheckout()
    } catch (error) {
      setLeaving(false)
      // Already subscribed, perhaps in another tab: their plan says so.
      if (error instanceof ApiError && error.status === 409) {
        navigate('/subscription', { replace: true })
        return
      }
      setFailure('Payments are unavailable right now. Try again in a minute.')
    }
  }

  return (
    <main class={styles.page}>
      <Show when={subscribed()}>
        <Navigate href="/subscription" />
      </Show>
      <div class={styles.column}>
        <div class={styles.top}>
          <A href="/subscription" class={styles.back}>
            ← back
          </A>
          <Logo class={styles.logo} />
        </div>

        <div class={styles.summary}>
          <span class={styles.eyebrow}>review and confirm</span>
          <h1 class={styles.title}>Monthly subscription</h1>
          <div class={styles.priceLine}>
            <span class={styles.price}>{PRICE}</span>
            <span class={styles.period}>{PERIOD}</span>
          </div>
        </div>

        <div>
          <h2 class={styles.listTitle}>what you get</h2>
          <ul class={styles.features}>
            <For each={SUBSCRIPTION_FEATURES}>
              {(f) => (
                <li class={styles.feature}>
                  <span class={styles.check} aria-hidden="true">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                      <path d="M4 10.5l4 4 8-9" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                  </span>
                  <span class={styles.featureLabel}>{f.label}</span>
                  <span class={styles.featureMeta}>{f.meta}</span>
                </li>
              )}
            </For>
          </ul>
        </div>

        <div class={styles.pay}>
          <Button variant="primary" size="lg" class={styles.payButton} disabled={leaving()} onClick={() => void pay()}>
            {leaving() ? 'Opening payment…' : 'Continue to payment →'}
          </Button>
          <Show when={failure()}>
            <p class={styles.failure} role="alert">
              {failure()}
            </p>
          </Show>
          <p class={styles.note}>
            You’ll enter your card on our payment provider’s secure page.
            <br />
            Renews monthly until you cancel.
          </p>
        </div>
      </div>
    </main>
  )
}

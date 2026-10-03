import { onCleanup, onMount } from 'solid-js'
import { Portal } from 'solid-js/web'
import { plural } from '../../data/catalog'
import { formatMonth, type Payment } from '../../lib/billing'
import PaymentRows from './PaymentRows'
import styles from './PaymentsDrawer.module.css'

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Every payment, in a panel that slides in from the right. */
export default function PaymentsDrawer(props: { payments: Payment[]; disabled: boolean; onPortal: () => void; onClose: () => void }) {
  let panel!: HTMLDivElement

  const since = () => {
    const oldest = props.payments[props.payments.length - 1]
    return oldest ? ` since ${formatMonth(oldest.date, true)}` : ''
  }

  onMount(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panel.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return props.onClose()
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

  return (
    <Portal>
      <div class={styles.scrim} onClick={() => props.onClose()}>
        <div
          ref={panel}
          class={styles.panel}
          role="dialog"
          aria-modal="true"
          aria-labelledby="payments-title"
          tabindex="-1"
          onClick={(e) => e.stopPropagation()}
        >
          <div class={styles.head}>
            <h2 id="payments-title" class={styles.title}>
              Billing history
            </h2>
            <button type="button" class={styles.close} aria-label="Close" onClick={() => props.onClose()}>
              ×
            </button>
          </div>
          <div class={styles.body}>
            <p class={styles.intro}>
              {plural(props.payments.length, 'payment')}
              {since()}. Amounts include VAT.
            </p>
            <PaymentRows payments={props.payments} disabled={props.disabled} onPortal={props.onPortal} />
          </div>
        </div>
      </div>
    </Portal>
  )
}

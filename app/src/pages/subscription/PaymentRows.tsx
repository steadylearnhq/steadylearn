import { For, Show } from 'solid-js'
import { formatAmount, formatShortDate, type Payment } from '../../lib/billing'
import styles from './PaymentRows.module.css'

const STATUS: Record<string, string> = { paid: 'Paid', failed: 'Failed', refunded: 'Refunded', pending: 'Pending' }

/**
 * Payments as the billing history lists them: date, amount, status, and what
 * can be done about it. Creem gives no links to receipts, so both actions open
 * its portal.
 */
export default function PaymentRows(props: { payments: Payment[]; disabled: boolean; onPortal: () => void }) {
  return (
    <ul class={styles.rows}>
      <For each={props.payments}>
        {(p) => (
          <li class={styles.row}>
            <span class={styles.date}>{formatShortDate(p.date)}</span>
            <span class={styles.amount}>{formatAmount(p.amount, p.currency)}</span>
            <span class={styles.status} classList={{ [styles.failed]: p.status === 'failed' }}>
              <span class={styles.dot} aria-hidden="true" />
              {STATUS[p.status] ?? STATUS.pending}
            </span>
            <Show when={p.status === 'paid'}>
              <button
                type="button"
                class={styles.action}
                disabled={props.disabled}
                aria-label={`Receipt for ${formatShortDate(p.date)}, on our payment provider’s page`}
                onClick={() => props.onPortal()}
              >
                PDF ↓
              </button>
            </Show>
            <Show when={p.status === 'failed'}>
              <button
                type="button"
                class={styles.action}
                classList={{ [styles.failed]: true }}
                disabled={props.disabled}
                onClick={() => props.onPortal()}
              >
                Pay now
              </button>
            </Show>
          </li>
        )}
      </For>
    </ul>
  )
}

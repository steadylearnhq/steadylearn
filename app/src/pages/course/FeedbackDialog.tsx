import { createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { Portal } from 'solid-js/web'
import Button from '../../components/Button'
import type { Feedback } from '../../lib/enrollments'
import styles from './FeedbackDialog.module.css'

const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input, [tabindex]:not([tabindex="-1"])'
/** What each rating, from 1 to 5, stands for. */
export const RATINGS = ['Poor', 'Fair', 'Good', 'Great', 'Excellent']

type Props = {
  courseTitle: string
  /** The member's feedback so far, which the form starts from. */
  current?: Feedback
  onClose: () => void
  /** Saves the feedback; the dialog stays open, saying so, if it fails. */
  onSend: (feedback: Feedback) => Promise<void>
}

/** The dialog an enrolled member rates a course in, with an optional message for its author. */
export default function FeedbackDialog(props: Props) {
  let panel!: HTMLDivElement
  const [rating, setRating] = createSignal(props.current?.rating ?? 0)
  const [hover, setHover] = createSignal(0)
  const [message, setMessage] = createSignal(props.current?.message ?? '')
  const [sending, setSending] = createSignal(false)
  const [failed, setFailed] = createSignal(false)
  const shown = () => hover() || rating()

  const send = async () => {
    if (!rating() || sending()) return
    setSending(true)
    setFailed(false)
    try {
      await props.onSend({ rating: rating(), message: message().trim() })
    } catch {
      setFailed(true)
    } finally {
      setSending(false)
    }
  }

  onMount(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panel.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return props.onClose()
      if (e.key !== 'Tab') return
      // Keep keyboard focus inside the dialog.
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
          class={styles.dialog}
          role="dialog"
          aria-modal="true"
          aria-labelledby="feedback-title"
          tabindex="-1"
          onClick={(e) => e.stopPropagation()}
        >
          <div class={styles.head}>
            <span id="feedback-title" class={styles.title}>
              {props.current ? 'Edit feedback' : 'Leave a feedback'}
            </span>
            <button type="button" class={styles.close} aria-label="Close" onClick={() => props.onClose()}>
              ×
            </button>
          </div>
          <form
            class={styles.body}
            onSubmit={(e) => {
              e.preventDefault()
              void send()
            }}
          >
            <div class={styles.field}>
              <span class={styles.label}>How is {props.courseTitle} going? Only the course author sees this.</span>
              <div class={styles.rating}>
                <div role="radiogroup" aria-label="Rating" class={styles.stars} onMouseLeave={() => setHover(0)}>
                  <For each={RATINGS}>
                    {(_, i) => {
                      const n = i() + 1
                      return (
                        <button
                          type="button"
                          role="radio"
                          aria-checked={rating() === n}
                          aria-label={n === 1 ? '1 star' : `${n} stars`}
                          class={styles.star}
                          classList={{ [styles.lit]: n <= shown() }}
                          onClick={() => setRating(n)}
                          onMouseEnter={() => setHover(n)}
                        >
                          ★
                        </button>
                      )
                    }}
                  </For>
                </div>
                <span class={styles.rateLabel}>{shown() ? RATINGS[shown() - 1] : 'Pick a rating'}</span>
              </div>
            </div>
            <label class={styles.field}>
              <span class={styles.label}>
                Message <span class={styles.optional}>(optional)</span>
              </span>
              <textarea
                class={styles.message}
                rows={5}
                maxLength={2000}
                placeholder="What worked, what didn't, what you'd change"
                value={message()}
                onInput={(e) => setMessage(e.currentTarget.value)}
              />
            </label>
            <div class={styles.actions}>
              <Show when={failed()}>
                <span class={styles.error} role="alert">
                  That didn't send. Try again.
                </span>
              </Show>
              <Button variant="outline" size="lg" class={styles.action} onClick={() => props.onClose()}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="lg" class={styles.action} disabled={!rating() || sending()}>
                {sending() ? 'Sending…' : props.current ? 'Save changes' : 'Send feedback'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </Portal>
  )
}

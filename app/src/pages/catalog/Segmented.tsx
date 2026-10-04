import { For, Show, createEffect, createSignal, on, onCleanup, onMount } from 'solid-js'
import styles from './Segmented.module.css'

/** `count`, when given, follows the label, e.g. how many items the option shows. */
type Option<T> = { value: T; label: string; count?: number }

type SegmentedProps<T> = {
  label: string
  /** Names the group for screen readers only. */
  hideLabel?: boolean
  options: Option<T>[]
  /** `sm` sits in the catalog's filter bar; `md` stands on its own in a page head. */
  size?: 'sm' | 'md'
  value: T
  onChange: (value: T) => void
}

/**
 * A labelled pill group where exactly one option is selected. The selection
 * is drawn as one pill that slides to the chosen option, rather than as each
 * option's own background.
 */
export default function Segmented<T>(props: SegmentedProps<T>) {
  let group!: HTMLDivElement
  const [thumb, setThumb] = createSignal<{ left: number; width: number }>()
  // The first placement snaps into position; only later changes slide.
  const [animated, setAnimated] = createSignal(false)

  const measure = () => {
    const selected = group.querySelector<HTMLElement>('[aria-checked="true"]')
    setThumb(selected ? { left: selected.offsetLeft, width: selected.offsetWidth } : undefined)
  }

  onMount(() => {
    measure()
    // Option widths change as the web font loads and at the narrow breakpoint.
    const observer = new ResizeObserver(measure)
    observer.observe(group)
    const frame = requestAnimationFrame(() => setAnimated(true))
    onCleanup(() => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    })
  })

  // Runs after the options' aria-checked has been updated.
  createEffect(on(() => props.value, measure, { defer: true }))

  return (
    <div class={styles.field}>
      <span class={props.hideLabel ? 'visually-hidden' : styles.label}>{props.label}</span>
      <div
        ref={group}
        class={styles.group}
        classList={{ [styles.md]: props.size === 'md' }}
        role="radiogroup"
        aria-label={props.label}
      >
        <Show when={thumb()}>
          {(t) => (
            <span
              class={styles.thumb}
              classList={{ [styles.animated]: animated() }}
              style={{ width: `${t().width}px`, transform: `translateX(${t().left}px)` }}
              aria-hidden="true"
            />
          )}
        </Show>
        <For each={props.options}>
          {(o) => (
            <button
              type="button"
              role="radio"
              aria-checked={props.value === o.value}
              class={styles.option}
              onClick={() => props.onChange(o.value)}
            >
              {o.label}
              <Show when={o.count !== undefined}>
                <span class={styles.count}>{o.count}</span>
              </Show>
            </button>
          )}
        </For>
      </div>
    </div>
  )
}

import { For } from 'solid-js'
import styles from './Segmented.module.css'

type Option<T> = { value: T; label: string }

type SegmentedProps<T> = {
  label: string
  options: Option<T>[]
  value: T
  onChange: (value: T) => void
}

/** A labelled pill group where exactly one option is selected. */
export default function Segmented<T>(props: SegmentedProps<T>) {
  return (
    <div class={styles.field}>
      <span class={styles.label}>{props.label}</span>
      <div class={styles.group} role="radiogroup" aria-label={props.label}>
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
            </button>
          )}
        </For>
      </div>
    </div>
  )
}

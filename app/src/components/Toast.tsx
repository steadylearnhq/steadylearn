import { Show } from 'solid-js'
import { Portal } from 'solid-js/web'
import styles from './Toast.module.css'

/** A short confirmation pinned to the bottom of the window, shown while `message` is set. */
export default function Toast(props: { message: string | undefined }) {
  return (
    <Portal>
      <Show when={props.message}>
        <div class={styles.toast} role="status">
          {props.message}
        </div>
      </Show>
    </Portal>
  )
}

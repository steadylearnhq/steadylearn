import { A } from '@solidjs/router'
import { For, Show } from 'solid-js'
import Button from '../../components/Button'
import styles from './LessonFooter.module.css'

/** A way to move: a link when it only goes somewhere, a click when it does something first. */
export type LessonAction = { label: string; href?: string; onClick?: () => void }

/** Where the member is in the lesson, stage by stage. */
export type StepState = 'done' | 'current' | 'upcoming'

export type LessonStep = { label: string; state: StepState; href: string }

type LessonFooterProps = {
  /** Left out at the start of the course. */
  prev?: LessonAction
  next?: LessonAction
  steps: LessonStep[]
  /** Whether there's more of the body below, which shows the top border. */
  more: boolean
}

/** The lesson's own footer: back, the lesson's stages, and on. */
export default function LessonFooter(props: LessonFooterProps) {
  return (
    <footer class={styles.footer} classList={{ [styles.edge]: props.more }}>
      <div class={styles.side}>
        <Show when={props.prev}>
          {(prev) => (
            <Button variant="outline" class={styles.prev} href={prev().href} onClick={prev().onClick}>
              {prev().label}
            </Button>
          )}
        </Show>
      </div>
      <nav class={styles.steps} aria-label="Lesson stages">
        <For each={props.steps}>
          {(step) => (
            <A
              href={step.href}
              class={`${styles.step} ${styles[step.state]}`}
              aria-current={step.state === 'current' ? 'step' : undefined}
            >
              <span class={styles.dot} aria-hidden="true" />
              <span class={styles.label}>{step.label}</span>
            </A>
          )}
        </For>
      </nav>
      <div class={`${styles.side} ${styles.end}`}>
        <Show when={props.next}>
          {(next) => (
            <Button variant="primary" class={styles.next} href={next().href} onClick={next().onClick}>
              {next().label}
            </Button>
          )}
        </Show>
      </div>
    </footer>
  )
}

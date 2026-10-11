import { createSignal, For, Show } from 'solid-js'
import type { StageOf } from '../../../lib/lessons'
import Placeholder from './Placeholder'
import styles from './LearnStage.module.css'

type Mode = StageOf<'learn'>['steps'][number]

const MODE_LABELS: Record<Mode, string> = { watch: 'Watch', read: 'Read' }

/** A video's length as m:ss, and a text's as a reading time. */
function length(mode: Mode, minutes: number) {
  if (mode === 'read') return `${Math.max(1, Math.round(minutes))} min`
  const seconds = Math.round(minutes * 60)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

type LearnStageProps = {
  /** The lesson's title, which heads its learning. */
  title: string
  stage: StageOf<'learn'>
}

/**
 * The lesson's video or text. The modes are the stage's steps, in their
 * order; with both, the member picks one, starting on the first.
 */
export default function LearnStage(props: LearnStageProps) {
  // A stage always has one; reading is the fallback a lesson without either gets.
  const modes = (): Mode[] => (props.stage.steps.length ? props.stage.steps : ['read'])
  const [mode, setMode] = createSignal(modes()[0])

  const minutes = (m: Mode) => props.stage.content[m]?.minutes
  const name = (m: Mode) => (
    <>
      {MODE_LABELS[m]}
      <Show when={minutes(m)}>{(n) => <span class={styles.length}>{length(m, n())}</span>}</Show>
    </>
  )

  return (
    <div class={styles.stage}>
      <div class={styles.head}>
        <h1 class={styles.title}>{props.title}</h1>
        <Show
          when={modes().length > 1}
          fallback={<span class={`${styles.tab} ${styles.current}`}>{name(modes()[0])}</span>}
        >
          <div class={styles.tabs} role="tablist" aria-label="How to learn">
            <For each={modes()}>
              {(m) => (
                <button
                  type="button"
                  role="tab"
                  id={`learn-${m}`}
                  aria-selected={mode() === m}
                  aria-controls="learn-body"
                  class={styles.tab}
                  classList={{ [styles.current]: mode() === m }}
                  onClick={() => setMode(m)}
                >
                  {name(m)}
                </button>
              )}
            </For>
          </div>
        </Show>
      </div>
      <div
        id="learn-body"
        role={modes().length > 1 ? 'tabpanel' : undefined}
        aria-labelledby={modes().length > 1 ? `learn-${mode()}` : undefined}
      >
        <Show when={mode() === 'watch'} fallback={<Placeholder label="Text" class={styles.read} />}>
          <Placeholder label="Video" class={styles.watch} />
        </Show>
      </div>
    </div>
  )
}

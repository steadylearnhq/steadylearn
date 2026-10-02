import { For, Show, createSignal } from 'solid-js'
import styles from './ChoiceBet.module.css'

type Confidence = 60 | 75 | 90

/** Points for [right, wrong] at each confidence level. */
const POINTS: Record<Confidence, [number, number]> = { 60: [10, -10], 75: [20, -25], 90: [30, -45] }
const CONFIDENCES: Confidence[] = [60, 75, 90]
const LETTERS = 'ABCD'

type ChoiceBetProps = {
  question: string
  options: string[]
  /** Index of the correct option. */
  answer: number
  explanation: string
  /** Drop the outer rules, for a bet that sits on its own tinted band. */
  flush?: boolean
  onScore?: (points: number) => void
}

export default function ChoiceBet(props: ChoiceBetProps) {
  const [pick, setPick] = createSignal<number | null>(null)
  const [conf, setConf] = createSignal<Confidence>(75)
  const [checked, setChecked] = createSignal(false)

  const right = () => pick() === props.answer
  const points = () => POINTS[conf()][right() ? 0 : 1]

  const feedbackTitle = () => {
    if (right()) return conf() === 90 ? 'Right, and you knew it.' : 'Right. You could have bet higher.'
    return conf() === 90 ? 'Wrong, and confidently. That one hurts.' : 'Not this time.'
  }

  const lock = () => {
    if (checked()) {
      setChecked(false)
      setPick(null)
      return
    }
    if (pick() == null) return
    setChecked(true)
    props.onScore?.(points())
  }

  return (
    <div class={styles.bet} classList={{ [styles.flush]: props.flush }}>
      <p class={styles.question}>{props.question}</p>
      <div class={styles.body}>
        <div class={styles.options} role="radiogroup" aria-label="Answer">
          <For each={props.options}>
            {(label, i) => (
              <button
                type="button"
                role="radio"
                aria-checked={pick() === i()}
                class={styles.option}
                disabled={checked()}
                onClick={() => setPick(i())}
              >
                <span class={styles.letter} classList={{ [styles.selected]: pick() === i() }}>
                  {LETTERS[i()]}
                </span>
                <span class={styles.optionLabel}>{label}</span>
                <span class={styles.note} classList={{ [styles.correct]: i() === props.answer }}>
                  {checked() && i() === props.answer ? 'correct' : checked() && pick() === i() ? 'your pick' : ''}
                </span>
              </button>
            )}
          </For>
        </div>

        <div class={styles.stake}>
          <span id="bet-confidence" class={styles.stakeTitle}>How sure are you?</span>
          <div class={styles.confs} role="radiogroup" aria-labelledby="bet-confidence">
            <For each={CONFIDENCES}>
              {(c) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={conf() === c}
                  class={styles.conf}
                  classList={{ [styles.selected]: conf() === c }}
                  disabled={checked()}
                  onClick={() => setConf(c)}
                >
                  {c}%
                </button>
              )}
            </For>
          </div>
          <span class={styles.stakes}>
            Right at {conf()}%: +{POINTS[conf()][0]}. Wrong: {POINTS[conf()][1]}. Your confidence also goes on
            your calibration chart.
          </span>
          <button
            type="button"
            class={styles.lock}
            classList={{ [styles.lockReady]: pick() != null && !checked(), [styles.lockDone]: checked() }}
            aria-disabled={pick() == null && !checked()}
            onClick={lock}
          >
            {checked() ? 'Bet again' : 'Lock the bet'}
          </button>
        </div>
      </div>

      <Show when={checked()}>
        <div class={styles.result} aria-live="polite">
          <div class={styles.score}>
            <span class={styles.points} classList={{ [styles.lost]: points() < 0 }}>
              {points() > 0 ? '+' : ''}
              {points()}
            </span>
            <span class={styles.scoreSub}>
              {right() ? 'right' : 'wrong'} at {conf()}%
            </span>
          </div>
          <div class={styles.feedback}>
            <span class={styles.feedbackTitle}>{feedbackTitle()}</span>
            <p class={styles.explanation}>{props.explanation}</p>
          </div>
        </div>
      </Show>
    </div>
  )
}

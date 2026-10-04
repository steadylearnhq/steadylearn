import ChoiceBet from '../../components/ChoiceBet'
import shared from './shared.module.css'
import styles from './TryOne.module.css'

const SAMPLE = {
  question:
    'Your team runs N = 5 with W = 2 to keep writes fast. What is the smallest R that guarantees every read overlaps the latest successful write?',
  options: ['R = 2', 'R = 3', 'R = 4', 'R = 5'],
  answer: 2,
  explanation:
    'R + W must exceed N, so R > 3. With R = 3 a read can pick exactly the three replicas that missed the write.',
}

export default function TryOne() {
  return (
    <section class={styles.section}>
      <div class={`${shared.split} ${styles.split}`}>
        <div class={shared.intro}>
          <span class={shared.eyebrow}>try one</span>
          <h2 class={shared.h2}>Every answer comes with a confidence.</h2>
          <p class={shared.lede}>
            Pick an answer and say how sure you are. Being right at 90% pays more; being wrong at 90% costs more. Over
            time your bets become a calibration score, so you know which topics you actually know.
          </p>
          <span class={styles.source}>from lesson 2.2 · Quorums and R + W &gt; N</span>
        </div>
        <ChoiceBet {...SAMPLE} flush />
      </div>
    </section>
  )
}

import { For } from 'solid-js'
import shared from './shared.module.css'
import styles from './Facts.module.css'

const FACTS = [
  { label: 'Courses', value: '14', sub: 'across 6 domains' },
  { label: 'Lesson formats', value: '8', sub: 'from video to simulation' },
  { label: 'Typical lesson', value: '15 min', sub: 'video, read, do, bet' },
  { label: 'Calibration', value: 'Scored', sub: 'every bet, every lesson' },
]

export default function Facts() {
  return (
    <section class={`${shared.bleedRules} ${styles.facts}`}>
      <For each={FACTS}>
        {(f) => (
          <div class={styles.fact}>
            <span class={styles.label}>{f.label}</span>
            <span class={styles.value}>{f.value}</span>
            <span class={styles.sub}>{f.sub}</span>
          </div>
        )}
      </For>
    </section>
  )
}

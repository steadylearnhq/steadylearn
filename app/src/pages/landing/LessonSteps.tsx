import { For } from 'solid-js'
import StepIcon from '../../components/StepIcon'
import { LESSON_STEPS } from '../../data/lessonSteps'
import shared from './shared.module.css'
import styles from './LessonSteps.module.css'

export default function LessonSteps() {
  return (
    <section class={styles.section}>
      <div class={shared.split}>
        <div class={shared.intro}>
          <span class={shared.eyebrow}>how a lesson works</span>
          <h2 class={shared.h2}>Fifteen minutes, mostly with your hands on it.</h2>
          <p class={shared.lede}>
            Lessons are built from a small set of steps. A short video or reading sets up the idea, then you build,
            trace, estimate or break something before you move on.
          </p>
        </div>
        <ul class={styles.steps}>
          <For each={LESSON_STEPS}>
            {(step) => (
              <li class={styles.step}>
                <span class={styles.icon}>
                  <StepIcon step={step.key} />
                </span>
                <div class={styles.text}>
                  <span class={styles.name}>{step.name}</span>
                  <span class={styles.description}>{step.description}</span>
                </div>
              </li>
            )}
          </For>
        </ul>
      </div>
    </section>
  )
}

import type { StageOf } from '../../../lib/lessons'
import Placeholder from './Placeholder'
import column from './column.module.css'
import styles from './QuestionsStage.module.css'

/** The lesson's questions, answered with a confidence. Drawn from its content once the first real ones exist. */
export default function QuestionsStage(_props: { stage: StageOf<'questions'> }) {
  return (
    <div class={column.frame}>
      <div class={column.column}>
        <h1 class={column.title}>Questions</h1>
        <Placeholder label="Questions" class={styles.questions} />
      </div>
    </div>
  )
}

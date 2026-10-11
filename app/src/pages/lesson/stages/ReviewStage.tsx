import type { StageOf } from '../../../lib/lessons'
import Placeholder from './Placeholder'
import column from './column.module.css'
import styles from './ReviewStage.module.css'

/** What to keep from the lesson. Its takeaways replace the placeholder once they're written. */
export default function ReviewStage(_props: { stage: StageOf<'review'> }) {
  return (
    <div class={column.frame}>
      <div class={column.column}>
        <h1 class={column.title}>What to keep</h1>
        <Placeholder label="Review" class={styles.review} />
      </div>
    </div>
  )
}

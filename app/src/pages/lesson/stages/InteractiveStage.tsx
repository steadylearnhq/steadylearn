import { Dynamic } from 'solid-js/web'
import type { StageOf } from '../../../lib/lessons'
import { labFor } from './labs'
import styles from './InteractiveStage.module.css'

/** A lab: its title beside the panel its component draws in. */
export default function InteractiveStage(props: { stage: StageOf<'interactive'> }) {
  return (
    <div class={styles.stage}>
      <div class={styles.side}>
        <h1 class={styles.title}>{props.stage.content.title ?? 'Lab'}</h1>
      </div>
      <div class={styles.panel}>
        <Dynamic component={labFor(props.stage.content.component)} content={props.stage.content} />
      </div>
    </div>
  )
}

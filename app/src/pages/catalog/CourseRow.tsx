import { A } from '@solidjs/router'
import { Show } from 'solid-js'
import { domainDot, formatLength, levelLabel, type Course } from '../../data/catalog'
import styles from './CourseRow.module.css'

export default function CourseRow(props: { course: Course; domainName: string; href: string }) {
  return (
    <A href={props.href} noScroll class={styles.row}>
      <div class={styles.main}>
        <div class={styles.meta}>
          <span class={styles.dot} style={{ background: domainDot(props.course.domain) }} />
          <span class={styles.domain}>{props.domainName}</span>
          <Show when={props.course.isNew}>
            <span class={styles.badge}>new</span>
          </Show>
        </div>
        <span class={styles.title}>{props.course.title}</span>
        <span class={styles.description}>{props.course.description}</span>
      </div>
      <div class={styles.facts}>
        <span class={styles.level}>{levelLabel(props.course.level)}</span>
        <span>{formatLength(props.course.minutes)}</span>
        <span>{props.course.lessonCount} lessons</span>
      </div>
    </A>
  )
}

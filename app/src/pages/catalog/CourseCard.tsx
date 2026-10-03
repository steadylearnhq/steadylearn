import { A } from '@solidjs/router'
import { Show } from 'solid-js'
import { domainDot, formatLength, levelLabel, type Course } from '../../data/catalog'
import styles from './CourseCard.module.css'

const Lock = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
)

/**
 * A course in the members' catalog grid, with the member's progress once
 * they've enrolled, 0% included. A member without a subscription sees which
 * course is free and which are locked.
 */
export default function CourseCard(props: {
  course: Course
  domainName: string
  href: string
  progress?: number
  free?: boolean
  locked?: boolean
}) {
  return (
    <A href={props.href} class={styles.card}>
      <div class={styles.meta}>
        <span class={styles.dot} style={{ background: domainDot(props.course.domain) }} />
        <span class={styles.domain}>{props.domainName}</span>
        <span class={styles.spacer} />
        <Show when={props.course.isNew}>
          <span class={styles.badge}>new</span>
        </Show>
        <Show when={props.free}>
          <span class={styles.tag}>free</span>
        </Show>
        <Show when={props.locked}>
          <span class={styles.lock} title="Included with the subscription">
            <Lock />
            <span class="visually-hidden">Included with the subscription</span>
          </span>
        </Show>
      </div>
      <span class={styles.title}>{props.course.title}</span>
      <span class={styles.description}>{props.course.description}</span>
      <div class={styles.facts}>
        <span class={styles.level}>{levelLabel(props.course.level)}</span>
        <span>{formatLength(props.course.minutes)}</span>
        <span>{props.course.lessonCount} lessons</span>
        <span class={styles.spacer} />
        <Show when={props.progress !== undefined}>
          <span class={styles.progress}>
            <span class={styles.track} aria-hidden="true">
              <span class={styles.fill} style={{ width: `${props.progress}%` }} />
            </span>
            {props.progress}%<span class="visually-hidden"> done</span>
          </span>
        </Show>
      </div>
    </A>
  )
}

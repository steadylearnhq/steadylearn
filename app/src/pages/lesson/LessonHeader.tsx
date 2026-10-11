import { A } from '@solidjs/router'
import Logo from '../../components/Logo'
import styles from './LessonHeader.module.css'

type LessonHeaderProps = {
  courseTitle: string
  code: string
  title: string
  /** Where the close button goes: the course's page. */
  closeHref: string
  /** Whether the body has scrolled down, which shows the bottom border. */
  scrolled: boolean
}

/** The lesson's own header, in place of the site's: the wordmark, where the lesson sits, and a way out. */
export default function LessonHeader(props: LessonHeaderProps) {
  return (
    <header class={styles.header} classList={{ [styles.edge]: props.scrolled }}>
      <Logo class={styles.logo} />
      <div class={styles.place}>
        <span class={styles.course}>{props.courseTitle}</span>
        <span class={styles.slash} aria-hidden="true">
          /
        </span>
        <span class={styles.code}>{props.code}</span>
        <span class={styles.title}>{props.title}</span>
      </div>
      <A href={props.closeHref} class={styles.close} aria-label="Close lesson">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </A>
    </header>
  )
}

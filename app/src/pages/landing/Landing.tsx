import ClosingCta from './ClosingCta'
import Domains from './Domains'
import Facts from './Facts'
import Hero from './Hero'
import LessonSteps from './LessonSteps'
import TryOne from './TryOne'
import styles from './Landing.module.css'

export default function Landing() {
  return (
    <main class={styles.page}>
      <Hero />
      <Facts />
      <LessonSteps />
      <TryOne />
      <Domains />
      <ClosingCta />
    </main>
  )
}

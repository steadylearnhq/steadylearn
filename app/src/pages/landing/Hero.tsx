import Button from '../../components/Button'
import HeroCluster from './HeroCluster'
import shared from './shared.module.css'
import styles from './Hero.module.css'

export default function Hero() {
  return (
    <section class={styles.hero}>
      <div class={styles.copy}>
        <span class={shared.eyebrow}>for working software engineers</span>
        <h1 class={styles.title}>The parts of the stack you were never taught.</h1>
        <p class={styles.lede}>
          Steadylearn teaches distributed systems, databases and the rest of the stack in short, hands-on lessons:
          watch, read, build, trace and estimate, then bet on what you actually remember.
        </p>
        <div class={styles.actions}>
          <Button variant="primary" size="lg" href="/login">
            Start free →
          </Button>
          <Button variant="outline" size="lg" href="/catalog">
            Browse the catalog
          </Button>
        </div>
      </div>
      <HeroCluster />
    </section>
  )
}

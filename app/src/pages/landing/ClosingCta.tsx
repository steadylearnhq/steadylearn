import Button from '../../components/Button'
import Critter from '../../components/Critter'
import styles from './ClosingCta.module.css'

export default function ClosingCta() {
  return (
    <section class={styles.section}>
      <Critter kind="circle" hue={255} size={72} mood="happy" />
      <h2 class={styles.title}>Start with one lesson. It takes fifteen minutes.</h2>
      <div class={styles.actions}>
        <Button variant="primary" size="lg" href="/signup">
          Sign up free →
        </Button>
        <Button variant="outline" size="lg" href="/catalog">
          Browse the catalog
        </Button>
      </div>
    </section>
  )
}

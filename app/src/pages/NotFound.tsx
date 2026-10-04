import Button from '../components/Button'
import Critter from '../components/Critter'
import { useNoCookieBanner } from '../lib/consent'
import { usePageTitle } from '../lib/title'
import styles from './NotFound.module.css'

export default function NotFound() {
  usePageTitle('Page not found')
  useNoCookieBanner()

  return (
    <main class={styles.page}>
      <Critter kind="circle" hue={255} size={72} mood="asleep" fill="var(--line2)" track={false} />
      <h1 class={styles.title}>No heartbeat from this page.</h1>
      <p class={styles.lede}>The address may be mistyped, or the page has moved.</p>
      <Button variant="outline" size="lg" href="/">
        Back to the overview
      </Button>
    </main>
  )
}

import Logo from './Logo'
import styles from './Footer.module.css'

export default function Footer() {
  return (
    <footer class={styles.footer}>
      <div class={styles.inner}>
        <Logo size="sm" />
        <span class={styles.spacer} />
        <nav class={styles.links} aria-label="Footer">
          <a href="/catalog">Catalog</a>
          <a href="/pricing">Pricing</a>
          <span>For teams</span>
          <span>Privacy</span>
        </nav>
      </div>
    </footer>
  )
}

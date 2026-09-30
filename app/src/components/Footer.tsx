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
          <a href="/terms">Terms &amp; Conditions</a>
          <a href="/privacy">Privacy Policy</a>
        </nav>
      </div>
    </footer>
  )
}

import { useLocation } from '@solidjs/router'
import { For } from 'solid-js'
import { theme, toggleTheme } from '../lib/theme'
import Button from './Button'
import Logo from './Logo'
import styles from './Header.module.css'

const NAV = [
  { label: 'Overview', href: '/' },
  { label: 'Catalog', href: '/catalog' },
  { label: 'Pricing', href: '/pricing' },
]

export default function Header() {
  const location = useLocation()

  return (
    <header class={styles.header}>
      <div class={styles.inner}>
        <Logo />
        <nav class={styles.nav} aria-label="Main">
          <For each={NAV}>
            {(item) => (
              <a
                href={item.href}
                class={styles.navItem}
                aria-current={location.pathname === item.href ? 'page' : undefined}
              >
                {item.label}
              </a>
            )}
          </For>
        </nav>
        <span class={styles.spacer} />
        <div class={styles.actions}>
          <button type="button" class={styles.themeToggle} onClick={toggleTheme}>
            <span class={styles.themeIcon} aria-hidden="true" />
            <span class={styles.themeLabel}>{theme() === 'dark' ? 'Light' : 'Dark'}</span>
            <span class="visually-hidden"> theme</span>
          </button>
          <Button variant="ghost" size="sm" class={styles.login}>
            Log in
          </Button>
          <Button variant="primary" size="sm">
            Sign up free
          </Button>
        </div>
      </div>
    </header>
  )
}

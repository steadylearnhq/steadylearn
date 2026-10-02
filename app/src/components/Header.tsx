import { useLocation, useNavigate } from '@solidjs/router'
import { For, Show } from 'solid-js'
import { authReady, signOut, user } from '../lib/auth'
import { theme, toggleTheme } from '../lib/theme'
import Button from './Button'
import Logo from './Logo'
import { HOME } from './RouteGuards'
import styles from './Header.module.css'

const NAV = [
  { label: 'Overview', href: '/' },
  { label: 'Catalog', href: '/catalog' },
  { label: 'Pricing', href: '/pricing' },
]

// Signed-in visitors can't open the public pages, so until members get their
// own header they only have the dashboard to go to.
const MEMBER_NAV = [{ label: 'Home', href: HOME }]

export default function Header() {
  const location = useLocation()
  const navigate = useNavigate()

  // Replace, so Back doesn't return to the members-only page just left. Google
  // sessions never get here: Amplify sends the browser through Cognito's
  // /logout, which returns to VITE_COGNITO_OAUTH_REDIRECT_SIGN_OUT (/login).
  const logOut = () => signOut().then(() => navigate('/login', { replace: true }))

  return (
    <header class={styles.header}>
      <div class={styles.inner}>
        <Logo />
        <nav class={styles.nav} aria-label="Main">
          <For each={authReady() && user() ? MEMBER_NAV : NAV}>
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
          {/* Nothing until the stored session is read, so a signed-in visitor never sees the sign-up button flash. */}
          <Show when={authReady()}>
            <Show
              when={user()}
              fallback={
                <Button variant="primary" size="sm" href="/login">
                  Start for free →
                </Button>
              }
            >
              {(u) => (
                <>
                  <span class={styles.userName}>{u().name}</span>
                  <Button variant="outline" size="sm" onClick={() => void logOut()}>
                    Log out
                  </Button>
                </>
              )}
            </Show>
          </Show>
        </div>
      </div>
    </header>
  )
}

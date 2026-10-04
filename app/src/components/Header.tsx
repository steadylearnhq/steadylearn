import { useLocation, useNavigate } from '@solidjs/router'
import { createEffect, createMemo, createSignal, For, on, onCleanup, onMount, Show } from 'solid-js'
import { authReady, signOut, user } from '../lib/auth'
import { navSection } from '../lib/nav'
import { theme, toggleTheme } from '../lib/theme'
import AccountMenu from './AccountMenu'
import Button from './Button'
import Logo from './Logo'
import { HOME } from './RouteGuards'
import styles from './Header.module.css'

const NAV = [
  { label: 'Overview', href: '/' },
  { label: 'Catalog', href: '/catalog' },
  { label: 'Pricing', href: '/pricing' },
]

// Signed-in visitors can't open the landing or pricing pages; the catalog is
// open to both.
const MEMBER_NAV = [
  { label: 'Home', href: HOME },
  { label: 'Catalog', href: '/catalog' },
  { label: 'My courses', href: '/my-courses' },
]

export default function Header() {
  const location = useLocation()
  const navigate = useNavigate()

  // Replace, so Back doesn't return to the members-only page just left. Google
  // sessions never get here: Amplify sends the browser through Cognito's
  // /logout, which returns to VITE_COGNITO_OAUTH_REDIRECT_SIGN_OUT (/login).
  const logOut = () => signOut().then(() => navigate('/login', { replace: true }))

  // The current page is marked by one pill that slides between items as the
  // member moves around, the way Segmented's thumb does. A page outside the
  // nav is marked under the item it says it belongs to (see lib/nav.ts), and
  // without one has no pill.
  let nav!: HTMLElement
  const member = () => authReady() && !!user()
  const items = () => (member() ? MEMBER_NAV : NAV)
  // A course says where it belongs only once it has loaded; until then the
  // item already marked stays marked, so the pill slides on from there.
  const current = createMemo<string | undefined>((prev) => {
    const path = location.pathname
    if (items().some((item) => item.href === path)) return path
    return navSection() ?? (path.startsWith('/courses/') ? prev : undefined)
  })
  const [pill, setPill] = createSignal<{ left: number; width: number }>()
  // The first placement snaps into position; only later changes slide.
  const [animated, setAnimated] = createSignal(false)

  const measure = () => {
    const marked = nav.querySelector<HTMLElement>('[aria-current]')
    setPill(marked ? { left: marked.offsetLeft, width: marked.offsetWidth } : undefined)
  }

  onMount(() => {
    measure()
    // Item widths change as the web font loads.
    const observer = new ResizeObserver(measure)
    observer.observe(nav)
    const frame = requestAnimationFrame(() => setAnimated(true))
    onCleanup(() => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    })
  })

  // Runs after the items' aria-current, and the items themselves on signing in or out, have been updated.
  createEffect(on([current, member], measure, { defer: true }))

  // Below 860px the nav and the theme toggle fold into a menu under the bar.
  // It closes on leaving the page, on Escape and on a click outside the header;
  // above 860px it is hidden by CSS, so widening the window puts it away too.
  let header!: HTMLElement
  const [menuOpen, setMenuOpen] = createSignal(false)
  createEffect(on(() => location.pathname, () => setMenuOpen(false), { defer: true }))
  createEffect(() => {
    if (!menuOpen()) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false)
    const onPointer = (e: PointerEvent) => !header.contains(e.target as Node) && setMenuOpen(false)
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    onCleanup(() => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    })
  })

  const themeToggle = (cls?: string) => (
    <button type="button" class={`${styles.themeToggle} ${cls ?? ''}`} onClick={toggleTheme}>
      <span class={styles.themeIcon} aria-hidden="true" />
      {theme() === 'dark' ? 'Light' : 'Dark'}
      <span class="visually-hidden"> theme</span>
    </button>
  )

  return (
    <header ref={header} class={styles.header}>
      <div class={styles.inner}>
        <Logo />
        <nav ref={nav} class={styles.nav} aria-label="Main">
          <Show when={pill()}>
            {(p) => (
              <span
                class={styles.pill}
                classList={{ [styles.animated]: animated() }}
                style={{ width: `${p().width}px`, transform: `translateX(${p().left}px)` }}
                aria-hidden="true"
              />
            )}
          </Show>
          <For each={items()}>
            {(item) => (
              <a
                href={item.href}
                class={styles.navItem}
                // "page" when it is this page; "true" when this page sits under it.
                aria-current={current() === item.href ? (location.pathname === item.href ? 'page' : 'true') : undefined}
              >
                {item.label}
              </a>
            )}
          </For>
        </nav>
        <span class={styles.spacer} />
        <div class={styles.actions}>
          {themeToggle(styles.wide)}
          {/* Nothing until the stored session is read, so a signed-in visitor never sees the sign-up button flash. */}
          <Show when={authReady()}>
            <Show
              when={user()}
              fallback={
                <>
                  <Button variant="primary" size="sm" href="/login" class={styles.wide}>
                    Start for free →
                  </Button>
                  <Button variant="primary" href="/login" class={`${styles.compact} ${styles.compactCta}`}>
                    Start free
                  </Button>
                </>
              }
            >
              {(u) => <AccountMenu user={u()} onSignOut={() => void logOut()} />}
            </Show>
          </Show>
          <button
            type="button"
            class={`${styles.compact} ${styles.menuButton}`}
            classList={{ [styles.menuButtonOpen]: menuOpen() }}
            aria-label="Menu"
            aria-expanded={menuOpen()}
            aria-controls="site-menu"
            onClick={() => setMenuOpen((o) => !o)}
          >
            <span class={styles.bar} />
            <span class={styles.bar} />
          </button>
        </div>
      </div>
      <Show when={menuOpen()}>
        <div id="site-menu" class={styles.menu}>
          <nav class={styles.menuNav} aria-label="Main">
            <For each={items()}>
              {(item) => (
                <a
                  href={item.href}
                  class={styles.menuItem}
                  aria-current={current() === item.href ? (location.pathname === item.href ? 'page' : 'true') : undefined}
                  onClick={() => setMenuOpen(false)}
                >
                  {item.label}
                  <span class={styles.menuDot} aria-hidden="true" />
                </a>
              )}
            </For>
          </nav>
          <div class={styles.menuRow}>
            <span class={styles.menuLabel}>Appearance</span>
            {themeToggle(styles.menuTheme)}
          </div>
        </div>
      </Show>
    </header>
  )
}

import { useLocation } from '@solidjs/router'
import { createEffect, createSignal, on, onCleanup, Show } from 'solid-js'
import type { User } from '../lib/auth'
import styles from './AccountMenu.module.css'

/** Up to two initials from the member's name, as the design's avatar shows them. */
const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?'

/**
 * The signed-in member's avatar. In the design it opens their profile, where
 * they sign out; until that page exists, it opens this menu instead.
 */
export default function AccountMenu(props: { user: User; onSignOut: () => void }) {
  const location = useLocation()
  const [open, setOpen] = createSignal(false)
  let root!: HTMLDivElement
  let avatar!: HTMLButtonElement

  // Closes when the page changes, on Escape, and on a click or focus anywhere else.
  createEffect(on(() => location.pathname, () => setOpen(false), { defer: true }))
  createEffect(() => {
    if (!open()) return
    const onPointer = (e: PointerEvent) => {
      if (!root.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      avatar.focus()
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    onCleanup(() => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    })
  })

  return (
    <div
      ref={root}
      class={styles.root}
      onFocusOut={(e) => {
        if (!root.contains(e.relatedTarget as Node | null)) setOpen(false)
      }}
    >
      <button
        ref={avatar}
        type="button"
        class={styles.avatar}
        aria-label="Account"
        aria-expanded={open()}
        aria-controls="account-menu"
        onClick={() => setOpen((o) => !o)}
      >
        {initials(props.user.name)}
      </button>
      <Show when={open()}>
        <div id="account-menu" class={styles.menu}>
          <div class={styles.who}>
            <span class={styles.name}>{props.user.name}</span>
            <Show when={props.user.email !== props.user.name}>
              <span class={styles.email}>{props.user.email}</span>
            </Show>
          </div>
          <span class={styles.rule} />
          <button type="button" class={styles.item} onClick={() => props.onSignOut()}>
            Sign out
          </button>
        </div>
      </Show>
    </div>
  )
}

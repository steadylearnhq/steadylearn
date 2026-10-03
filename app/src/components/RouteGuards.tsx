import { Navigate, useLocation, useSearchParams, type RouteSectionProps } from '@solidjs/router'
import { createMemo, Show } from 'solid-js'
import { authReady, user } from '../lib/auth'

/** Where signed-in visitors start, and where they're sent from public pages. */
export const HOME = '/dashboard'

// Each guard renders nothing until the stored session is read, so no page
// flashes before its redirect.

/** Wraps members-only routes: visitors without a session log in first and come back after. */
export function RequireAuth(props: RouteSectionProps) {
  const location = useLocation()
  const login = () => `/login?redirect=${encodeURIComponent(location.pathname + location.search)}`

  return (
    <Show when={authReady()}>
      <Show when={user()} fallback={<Navigate href={login()} />}>
        {props.children}
      </Show>
    </Show>
  )
}

/** Wraps the public marketing routes, which signed-in visitors skip for their dashboard. */
export function GuestOnly(props: RouteSectionProps) {
  return (
    <Show when={authReady()}>
      <Show when={!user()} fallback={<Navigate href={HOME} />}>
        {props.children}
      </Show>
    </Show>
  )
}

/**
 * Wraps the log in and sign up pages, which signed-in visitors skip for their
 * dashboard (or the page that sent them). Decided once on arrival: signing up
 * on the page itself keeps the visitor there for its welcome screen.
 */
export function GuestOnArrival(props: RouteSectionProps) {
  const [params] = useSearchParams<{ redirect?: string }>()
  // Once settled, the memo stops reading `user`, so later sign-ins don't re-run it.
  const signedIn = createMemo<boolean | undefined>((prev) => prev ?? (authReady() ? !!user() : undefined))

  return (
    <Show when={signedIn() !== undefined}>
      <Show when={!signedIn()} fallback={<Navigate href={safeRedirect(params.redirect, HOME)} />}>
        {props.children}
      </Show>
    </Show>
  )
}

/** A same-site path from ?redirect=, so a crafted link can't send people off-site after logging in. */
export const safeRedirect = (value: unknown, fallback: string) =>
  typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : fallback

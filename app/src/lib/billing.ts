import { createRoot, createSignal } from 'solid-js'
import { apiGet, apiPost } from './api'
import { session, user } from './auth'
import { theme } from './theme'

/** A member's subscription as the API reports it. */
export type Subscription = {
  /** Creem's status: active, trialing, past_due, unpaid, scheduled_cancel, paused or canceled. Anything else is no access. */
  status: string
  /** Whether it gives access now. */
  entitled: boolean
  /** A cancelled subscription that runs until currentPeriodEnd. */
  cancelAtPeriodEnd: boolean
  currentPeriodEnd: string | null
  canceledAt: string | null
}

/** The member's billing state: their current subscription, or null if they've never subscribed. */
export type Billing = { subscription: Subscription | null }

/** Where a visitor's Subscribe goes: sign up first, then the review before payment. */
export const SUBSCRIBE_HREF = '/signup?redirect=/subscription/checkout'

// The member's billing state is fetched once per page load and kept in one
// app-wide signal, so the account menu and the Subscription page agree. Every
// change answers with the new state, which replaces it. It is kept with the
// member it belongs to, so signing out or in mid-visit never shows someone
// else's.
const store = createRoot(() => {
  const [state, setState] = createSignal<{ userId: string; billing: Billing }>()
  return { state, setState }
})

let pending: { userId: string; request: Promise<Billing> } | undefined

/** The signed-in member's billing state, once loaded; undefined before that and when signed out. */
export function billing(): Billing | undefined {
  const state = store.state()
  return state && state.userId === user()?.id ? state.billing : undefined
}

/** Whether the signed-in member has access through a subscription; false until their billing state has loaded. */
export const subscribed = () => billing()?.subscription?.entitled ?? false

/** Loads the member's billing state, asking the API once per page load unless `fresh`. */
export async function loadBilling(fresh = false): Promise<Billing> {
  const member = await session()
  if (!member) throw new Error('Not signed in')
  if (fresh || pending?.userId !== member.userId) {
    const request = apiGet<Billing>('/v1/billing/subscription', member.token)
    pending = { userId: member.userId, request }
    request.catch(() => {
      if (pending?.request === request) pending = undefined
    })
  }
  const value = await pending.request
  store.setState({ userId: member.userId, billing: value })
  return value
}

/** Sends a billing change and keeps the state it answers with. */
async function change(path: string, body?: unknown): Promise<Billing> {
  const member = await session()
  const value = await apiPost<Billing>(path, member?.token, body)
  if (member) {
    store.setState({ userId: member.userId, billing: value })
    pending = { userId: member.userId, request: Promise.resolve(value) }
  }
  return value
}

/** Stores the subscription Creem returned the member with after checkout, and answers with their billing state. */
export const syncSubscription = (subscriptionId: string) => change('/v1/billing/sync', { subscriptionId })

/** Cancels at the end of the period the member paid for; they keep access until then. */
export const cancelSubscription = () => change('/v1/billing/cancel')

/** Undoes a cancellation that hasn't taken effect yet, or a pause. */
export const resumeSubscription = () => change('/v1/billing/resume')

/** Starts a checkout and leaves for Creem's payment page, in the app's theme. */
export async function startCheckout() {
  const { checkoutUrl } = await apiPost<{ checkoutUrl: string }>('/v1/billing/checkout', (await session())?.token)
  const url = new URL(checkoutUrl)
  url.searchParams.set('theme', theme())
  window.location.assign(url.toString())
}

/** Leaves for Creem's customer portal, where the member changes their card and downloads invoices. */
export async function openPortal() {
  const { url } = await apiPost<{ url: string }>('/v1/billing/portal', (await session())?.token)
  window.location.assign(url)
}

/** A subscription date as the design writes dates: 3 November 2026. */
export const formatBillingDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : ''

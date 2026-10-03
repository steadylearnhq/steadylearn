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
  /** Null for a subscription stored before the API kept it. */
  currentPeriodStart: string | null
  currentPeriodEnd: string | null
  /** The renewal, or the next retry of a failed payment; null when it won't renew. */
  nextChargeAt: string | null
  canceledAt: string | null
  /** When the member first subscribed, across every subscription they've had. */
  memberSince: string
}

/** The member's billing state: their current subscription, or null if they've never subscribed. */
export type Billing = { subscription: Subscription | null }

/** One charge of the member's subscription, or one that was tried. Amount is in cents, VAT included. */
export type Payment = {
  id: string
  date: string
  amount: number
  currency: string
  /** paid, failed, refunded or pending; anything else reads as pending. */
  status: string
  periodStart: string | null
  periodEnd: string | null
}

/** Where a visitor's Subscribe goes: sign up first, then the review before payment. */
export const SUBSCRIBE_HREF = '/signup?redirect=/subscription/checkout'

// The member's billing state is fetched once per page load and kept in one
// app-wide signal, so the account menu and the Subscription page agree. Every
// change answers with the new state, which replaces it. It is kept with the
// member it belongs to, so signing out or in mid-visit never shows someone
// else's.
const store = createRoot(() => {
  const [state, setState] = createSignal<{ userId: string; billing: Billing }>()
  const [history, setHistory] = createSignal<{ userId: string; payments: Payment[] }>()
  return { state, setState, history, setHistory }
})

let pending: { userId: string; request: Promise<Billing> } | undefined
let pendingPayments: { userId: string; request: Promise<Payment[]> } | undefined

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

/** The signed-in member's payments, newest first, once loaded; undefined before that and when signed out. */
export function payments(): Payment[] | undefined {
  const history = store.history()
  return history && history.userId === user()?.id ? history.payments : undefined
}

/** Loads the member's payments, asking the API once per page load unless `fresh`. */
export async function loadPayments(fresh = false): Promise<Payment[]> {
  const member = await session()
  if (!member) throw new Error('Not signed in')
  if (fresh || pendingPayments?.userId !== member.userId) {
    const request = apiGet<{ payments: Payment[] }>('/v1/billing/payments', member.token).then((r) => r.payments)
    pendingPayments = { userId: member.userId, request }
    request.catch(() => {
      if (pendingPayments?.request === request) pendingPayments = undefined
    })
  }
  const value = await pendingPayments.request
  store.setHistory({ userId: member.userId, payments: value })
  return value
}

/** Sends a billing change and keeps the state it answers with. A checkout synced may have brought a payment, so payments are asked for again next time. */
async function change(path: string, body?: unknown): Promise<Billing> {
  const member = await session()
  const value = await apiPost<Billing>(path, member?.token, body)
  if (member) {
    store.setState({ userId: member.userId, billing: value })
    pending = { userId: member.userId, request: Promise.resolve(value) }
    pendingPayments = undefined
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

// A portal link signs the member in to Creem's portal. It is asked for when the
// Subscription page opens, so the portal opens in a new tab the moment it's
// clicked. Creem doesn't say how long a link lasts, so one older than
// PORTAL_LINK_MAX_AGE is asked for again, and each is used for one trip.
const PORTAL_LINK_MAX_AGE = 5 * 60_000

let portalLink: { userId: string; at: number; request: Promise<string>; url?: string } | undefined

const freshLink = (userId: string | undefined) =>
  portalLink && portalLink.userId === userId && Date.now() - portalLink.at <= PORTAL_LINK_MAX_AGE ? portalLink : undefined

/** The member's portal link: the one asked for ahead if it's still fresh, otherwise a new one. */
async function portalUrl(): Promise<string> {
  const member = await session()
  if (!member) throw new Error('Not signed in')
  const fresh = freshLink(member.userId)
  if (fresh) return fresh.request
  const link: NonNullable<typeof portalLink> = {
    userId: member.userId,
    at: Date.now(),
    request: apiPost<{ url: string }>('/v1/billing/portal', member.token).then((r) => (link.url = r.url)),
  }
  portalLink = link
  link.request.catch(() => {
    if (portalLink === link) portalLink = undefined
  })
  return link.request
}

/** Asks for the member's portal link ahead of a click. A failure is quiet: the click asks again. */
export const preloadPortal = () => void portalUrl().catch(() => {})

/**
 * Opens Creem's customer portal, where the member changes their card and
 * downloads invoices, in a new tab. The tab has to open within the click or the
 * browser blocks it, so with a link at hand it opens at once and this returns
 * undefined. Otherwise a blank tab opens now and follows the link once it
 * arrives; the promise settles then, and rejects if the link couldn't be had.
 * Either way the next link is asked for, ready for the next click.
 */
export function openPortal(): Promise<void> | undefined {
  const ready = freshLink(user()?.id)?.url
  if (ready) {
    portalLink = undefined
    window.open(ready, '_blank', 'noopener')
    preloadPortal()
    return undefined
  }
  const tab = window.open('', '_blank')
  if (tab) tab.opener = null
  return portalUrl().then(
    (url) => {
      portalLink = undefined
      if (tab) tab.location.href = url
      else window.location.assign(url) // the browser blocked the tab
      preloadPortal()
    },
    (error: unknown) => {
      tab?.close()
      throw error
    },
  )
}

/** A subscription date as the design writes dates: 3 November 2026. */
export const formatBillingDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : ''

// Short months as the design writes them; en-GB would write September as "Sept".
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** A date in a fact or a payment row: 3 Nov 2026. */
export const formatShortDate = (iso: string) => {
  const d = new Date(iso)
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

/** A day of the period bar: 3 Nov. */
export const formatDay = (date: Date | string) => {
  const d = new Date(date)
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}

/** A day in a sentence: 3 November. */
export const formatDayLong = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })

/** A month: Mar 2026, or March 2026 when `long`. */
export const formatMonth = (iso: string, long = false) => {
  const d = new Date(iso)
  return long
    ? d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    : `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

/** An amount in cents in its currency: $24.00. */
export const formatAmount = (cents: number, currency: string) => {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100)
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}` // a currency code Intl doesn't know
  }
}

/** Whole days from now until `iso`, never below 0. */
export const daysUntil = (iso: string) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000))

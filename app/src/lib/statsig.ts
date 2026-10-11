import { StableID, StatsigClient, type StatsigUser } from '@statsig/js-client'
import { createEffect, createRoot, createSignal, untrack } from 'solid-js'
import { authReady, user } from './auth'
import { analyticsAllowed } from './consent'

const CLIENT_KEY = import.meta.env.VITE_STATSIG_CLIENT_KEY ?? ''
const TIER = import.meta.env.VITE_STATSIG_ENVIRONMENT || 'development'

// How long a guest page may wait for values before showing its defaults.
const READY_CAP_MS = 1500

// Statsig is off without a client key. A key that isn't one, such as the
// __VITE_…__ placeholder left in an image started without it, counts as none.
const enabled = CLIENT_KEY.startsWith('client-')

const identify = (id: string | undefined): StatsigUser => (id ? { userID: id } : {})

// Everything the SDK keeps in localStorage starts with this: the stableID,
// cached values and events waiting to be sent.
const STORAGE_PREFIX = 'statsig.'

function clearStoredStatsig() {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(STORAGE_PREFIX)) localStorage.removeItem(key)
    }
  } catch {
    // Storage can be unavailable; then nothing was stored either.
  }
}

// One app-wide Statsig client, made once auth has settled so a signed-in member
// is never first evaluated as anonymous. Flags are evaluated with or without
// analytics consent; without it nothing is stored and nothing is logged.
// Statsig must never break a screen, so its failures are swallowed and every
// reader falls back to the caller's defaults.
const store = createRoot(() => {
  const [client, setClient] = createSignal<StatsigClient | null>(null)
  const [ready, setReady] = createSignal(!enabled)
  // Bumped whenever the client's values change, so readers re-run.
  const [values, setValues] = createSignal(0)

  if (!enabled) return { client, ready, values }

  setTimeout(() => setReady(true), READY_CAP_MS)

  let identified: string | undefined

  createEffect(() => {
    if (!authReady()) return
    const id = user()?.id
    untrack(() => {
      const current = client()
      if (!current) {
        start(id)
      } else if (id !== identified) {
        identified = id
        current.updateUserAsync(identify(id)).catch(() => {})
      }
    })
  })

  function start(id: string | undefined) {
    try {
      const allowed = untrack(analyticsAllowed)
      const created = new StatsigClient(CLIENT_KEY, identify(id), {
        environment: { tier: TIER },
        disableStorage: !allowed,
        loggingEnabled: allowed ? 'browser-only' : 'disabled',
      })
      created.on('values_updated', ({ status }) => {
        setValues((n) => n + 1)
        if (status === 'Ready') setReady(true)
      })
      identified = id
      setClient(created)
      created.initializeAsync().catch(() => {})
    } catch {
      setReady(true)
    }
  }

  // Consent can change at any time, from the cookie sheet.
  createEffect(() => {
    const allowed = analyticsAllowed()
    const current = client()
    if (!current) {
      if (!allowed) clearStoredStatsig()
      return
    }
    try {
      if (allowed) {
        // Storage first, so the stableID the visitor was bucketed by this visit
        // is kept, and logging after, so nothing queued before consent is sent.
        current.updateRuntimeOptions({ disableStorage: false })
        const stableID = current.getContextHandle().stableID
        if (stableID) StableID.setOverride(stableID, CLIENT_KEY)
        current.updateRuntimeOptions({ loggingEnabled: 'browser-only' })
      } else {
        current.updateRuntimeOptions({ loggingEnabled: 'disabled', disableStorage: true })
        clearStoredStatsig()
      }
    } catch {
      // Leave the client as it was.
    }
  })

  return { client, ready, values }
})

/** True once Statsig's values have loaded, or after a short wait, or at once when Statsig is off. A guest page can wait on it to avoid flashing its defaults. */
export const statsigReady = store.ready

/** The visitor's Statsig stableID, for the API to bucket them alike; undefined without analytics consent or when Statsig is off. */
export function stableId(): string | undefined {
  const current = store.client()
  if (!current || !analyticsAllowed()) return undefined
  try {
    return current.getContextHandle().stableID ?? undefined
  } catch {
    return undefined
  }
}

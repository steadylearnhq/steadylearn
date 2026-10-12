import { type Experiment, StableID, StatsigClient, type StatsigUser } from '@statsig/js-client'
import { createEffect, createRoot, createSignal, getOwner, untrack } from 'solid-js'
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

// Every request the SDK makes passes through here. Without consent only the
// initialize call, which evaluates the flags, may reach Statsig. The SDK holds
// events back itself while logging is disabled, but it still sends its own
// count of reads that skipped exposure logging, with the stableID and the
// page, on its flush cycle and when the page hides. Overriding the network
// also turns off the SDK's sendBeacon path, so those go through here too, and
// a 202 tells it they were sent, so they are dropped rather than retried.
function sendUnlessUnconsented(url: string, args: RequestInit): Promise<Response> {
  if (!url.includes('/initialize') && !analyticsAllowed()) {
    return Promise.resolve(new Response(null, { status: 202 }))
  }
  return fetch(url, args)
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
        networkConfig: { networkOverrideFunc: sendUnlessUnconsented },
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

/**
 * Logs the custom event name with its metadata, adding the caller's
 * auth_state (`anonymous` or `signed_in`). Without analytics consent, or with
 * Statsig off, the event is dropped: the SDK would otherwise keep it and send
 * it once the visitor consents.
 */
export function track(name: string, metadata: Record<string, string> = {}) {
  const current = store.client()
  if (!current || !analyticsAllowed()) return
  try {
    current.logEvent({ eventName: name, metadata: { ...metadata, auth_state: user() ? 'signed_in' : 'anonymous' } })
  } catch {
    // An event is never worth breaking a screen for.
  }
}

// Readers. Each tracks the client and its values, so a component re-renders
// when values load or the user changes. Without a client they return the
// caller's defaults, which are always the control.

/** The parameter key of values, or def when it is missing or of another type than def. */
function typed<T>(values: Record<string, unknown> | undefined, key: string, def: T): T {
  const value = values?.[key]
  if (value == null || typeof value !== typeof def || Array.isArray(value) !== Array.isArray(def)) return def
  return value as T
}

/** The current client, read so the caller re-runs when it or its values change. */
function tracked(): StatsigClient | null {
  store.values()
  return store.client()
}

/** Whether the feature gate name passes for the current user; false when Statsig is off. */
export function gate(name: string): boolean {
  const client = tracked()
  if (!client) return false
  try {
    return client.checkGate(name)
  } catch {
    return false
  }
}

export type Values = { get<T>(key: string, def: T): T }

/** The dynamic config name for the current user. */
export function config(name: string): Values {
  return {
    get(key, def) {
      const client = tracked()
      if (!client) return def
      try {
        return typed(client.getDynamicConfig(name).value, key, def)
      } catch {
        return def
      }
    },
  }
}

export type Assignment = Values & {
  /** The group the user is in; undefined when Statsig is off or they are in none. */
  group(): string | undefined
  /** Counts the user in the experiment, once they have consented and values have loaded. */
  logExposure(): void
}

export type ExposureMode = 'auto' | 'manual'

/**
 * The current user's assignment in the experiment name. Reading it never logs
 * an exposure. With `auto`, used inside a component, the exposure is logged
 * once per assigned group; with `manual`, the caller calls logExposure() where
 * the variant actually shows.
 */
export function experiment(name: string, { exposure = 'auto' }: { exposure?: ExposureMode } = {}): Assignment {
  const read = (): { client: StatsigClient; value: Experiment } | null => {
    const client = tracked()
    if (!client) return null
    try {
      return { client, value: client.getExperiment(name, { disableExposureLog: true }) }
    } catch {
      return null
    }
  }

  // What the exposure would be logged for, or null when it may not be: before
  // values load, without consent, or for a user with no id of the
  // experiment's unit type.
  const exposureKey = (): string | null => {
    const current = read()
    if (!current || !analyticsAllowed()) return null
    const { client, value } = current
    if (client.loadingStatus !== 'Ready' || !value.idType) return null
    try {
      const context = client.getContextHandle()
      const unit =
        value.idType === 'userID'
          ? context.user.userID
          : value.idType === 'stableID'
            ? context.stableID
            : context.user.customIDs?.[value.idType]
      return unit ? `${value.idType}:${unit}:${value.ruleID}:${value.groupName ?? ''}` : null
    } catch {
      return null
    }
  }

  const logExposure = () => {
    if (!untrack(exposureKey)) return
    try {
      // v3 has no manual exposure call: a read with exposure logging on logs it.
      untrack(tracked)?.getExperiment(name)
    } catch {
      // An exposure that can't be logged is only a missed count.
    }
  }

  if (exposure === 'auto' && getOwner()) {
    let logged: string | null = null
    createEffect(() => {
      const key = exposureKey()
      if (key && key !== logged) {
        logged = key
        logExposure()
      }
    })
  }

  return {
    get: (key, def) => typed(read()?.value.value, key, def),
    group: () => read()?.value.groupName ?? undefined,
    logExposure,
  }
}

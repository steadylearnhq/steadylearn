import { createRoot, createSignal, onCleanup } from 'solid-js'

/** `all` allows analytics; `essential` keeps only what the site needs to work. */
export type Consent = 'all' | 'essential'

const STORAGE_KEY = 'sl-cookies'

function readStoredConsent(): Consent | undefined {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'all' || stored === 'essential') return stored
  } catch {
    // Storage can be unavailable (private mode, blocked site data).
  }
  return undefined
}

// One app-wide record of the visitor's cookie choice, and whether the cookie
// sheet was asked for from the footer.
const store = createRoot(() => {
  const [consent, setConsentSignal] = createSignal<Consent | undefined>(readStoredConsent())
  const [settingsOpen, setSettingsOpen] = createSignal(false)
  const [suppressed, setSuppressed] = createSignal(0)

  const setConsent = (next: Consent) => {
    setConsentSignal(next)
    setSettingsOpen(false)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Ignore: the choice still holds for this session.
    }
  }

  return { consent, setConsent, settingsOpen, setSettingsOpen, suppressed, setSuppressed }
})

export const consent = store.consent
export const setConsent = store.setConsent
/** Whether analytics may run. Nothing loads analytics yet; it must check this first. */
export const analyticsAllowed = () => consent() === 'all'
export const settingsOpen = store.settingsOpen
export const openCookieSettings = () => store.setSettingsOpen(true)
/** True while a mounted page keeps the sheet from showing by itself. */
export const bannerSuppressed = () => store.suppressed() > 0

/** Keeps the cookie sheet from showing by itself while the calling page is mounted. */
export function useNoCookieBanner() {
  store.setSuppressed((n) => n + 1)
  onCleanup(() => store.setSuppressed((n) => n - 1))
}

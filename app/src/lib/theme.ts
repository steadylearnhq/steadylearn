import { createRoot, createSignal } from 'solid-js'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'sl-theme'

function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // Storage can be unavailable (private mode, blocked site data).
  }
  return 'light'
}

// A single app-wide theme signal. index.html applies the stored theme before
// first paint; this keeps <html data-theme> in sync afterwards.
const store = createRoot(() => {
  const [theme, setThemeSignal] = createSignal<Theme>(readStoredTheme())

  const setTheme = (next: Theme) => {
    setThemeSignal(next)
    document.documentElement.dataset.theme = next
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Ignore: the theme still applies for this session.
    }
  }

  return { theme, setTheme }
})

export const theme = store.theme
export const setTheme = store.setTheme
export const toggleTheme = () => setTheme(theme() === 'dark' ? 'light' : 'dark')

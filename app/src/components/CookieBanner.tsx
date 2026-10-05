import { createEffect, createSignal, Show } from 'solid-js'
import { authReady, user } from '../lib/auth'
import { bannerSuppressed, consent, setConsent, settingsOpen } from '../lib/consent'
import Button from './Button'
import Critter from './Critter'
import styles from './CookieBanner.module.css'

/**
 * The cookie sheet pinned to the bottom of the window. It shows by itself to
 * signed-out visitors who haven't chosen yet, and to anyone who opens it from
 * the footer's "Cookie settings".
 */
export default function CookieBanner() {
  const visible = () => authReady() && (settingsOpen() || (!user() && !consent() && !bannerSuppressed()))

  const [open, setOpen] = createSignal(false)
  const [analytics, setAnalytics] = createSignal(true)
  // With a category switched off, the primary button accepts only what's on.
  const selectedOnly = () => open() && !analytics()

  // Each showing starts folded, with the switch on the stored choice.
  createEffect(() => {
    if (!visible()) return
    setOpen(false)
    setAnalytics(consent() !== 'essential')
  })

  return (
    <Show when={visible()}>
      <div class={styles.banner} role="region" aria-label="Cookie consent">
        <div class={styles.inner}>
          <div class={styles.row}>
            <div class={styles.intro}>
              <Critter kind="circle" hue={85} size={40} mood="happy" class={styles.critter} />
              <div class={styles.copy}>
                <span class={styles.title}>Cookies, kept to a minimum.</span>
                <span class={styles.text}>
                  We use essential cookies to keep you logged in and remember your theme, and privacy-friendly
                  analytics to see where lessons get stuck. No advertising cookies.{' '}
                  <a href="/privacy" class={styles.link}>
                    Privacy Policy
                  </a>
                </span>
              </div>
            </div>
            <div class={styles.actions}>
              <Button
                variant="ghost"
                class={styles.customize}
                aria-expanded={open()}
                onClick={() => setOpen((o) => !o)}
              >
                Customize
                <svg
                  class={styles.chevron}
                  classList={{ [styles.chevronOpen]: open() }}
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </Button>
              <Button variant="outline" class={styles.reject} onClick={() => setConsent('essential')}>
                Reject all
              </Button>
              <Button variant="primary" onClick={() => setConsent(selectedOnly() ? 'essential' : 'all')}>
                {selectedOnly() ? 'Accept selected' : 'Accept all'}
              </Button>
            </div>
          </div>
        </div>
        <Show when={open()}>
          <div class={styles.panel}>
            <div class={`${styles.inner} ${styles.categories}`}>
              <div class={styles.category}>
                <CategoryText
                  name="Essential"
                  meta="always on"
                  text="Login session, theme and your cookie choice. The site does not work without them."
                />
                <span
                  class={`${styles.switch} ${styles.on} ${styles.locked}`}
                  role="switch"
                  aria-checked="true"
                  aria-disabled="true"
                  aria-label="Essential"
                />
              </div>
              <button
                type="button"
                class={styles.category}
                role="switch"
                aria-checked={analytics()}
                aria-label="Analytics"
                onClick={() => setAnalytics((a) => !a)}
              >
                <CategoryText
                  name="Analytics"
                  meta={analytics() ? 'on' : 'off'}
                  text="Aggregated, privacy-friendly usage data. No cross-site tracking, nothing sold."
                />
                <span class={styles.switch} classList={{ [styles.on]: analytics() }} aria-hidden="true" />
              </button>
            </div>
          </div>
        </Show>
      </div>
    </Show>
  )
}

function CategoryText(props: { name: string; meta: string; text: string }) {
  return (
    <span class={styles.categoryText}>
      <span class={styles.categoryHead}>
        <span class={styles.categoryName}>{props.name}</span>
        <span class={styles.categoryMeta}>{props.meta}</span>
      </span>
      <span class={styles.categoryDesc}>{props.text}</span>
    </span>
  )
}

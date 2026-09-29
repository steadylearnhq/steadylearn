import { createEffect } from 'solid-js'

const SITE = 'Steadylearn'

/** Sets the document title while the calling page is mounted. Pass an accessor to keep it in sync. */
export function usePageTitle(title?: string | (() => string)) {
  createEffect(() => {
    const value = typeof title === 'function' ? title() : title
    document.title = value ? `${value} · ${SITE}` : SITE
  })
}

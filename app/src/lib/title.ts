import { onMount } from 'solid-js'

const SITE = 'Steadylearn'

/** Sets the document title while the calling page is mounted. */
export function usePageTitle(title?: string) {
  onMount(() => {
    document.title = title ? `${title} · ${SITE}` : SITE
  })
}

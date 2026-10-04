import { createEffect, createSignal, onCleanup } from 'solid-js'

// A page outside the header's nav can say which item it belongs under, so the
// header marks that item: a course sits under Catalog until the member enrolls,
// then under My courses. Undefined while the page doesn't know yet.
const [navSection, setNavSection] = createSignal<string>()

export { navSection }

/** Marks the nav item at `href` as current while the calling page is mounted; undefined while that isn't known. */
export function useNavSection(href: () => string | undefined) {
  createEffect(() => setNavSection(href()))
  onCleanup(() => setNavSection(undefined))
}

import { createEffect, createSignal, onCleanup, type Accessor } from 'solid-js'

/**
 * Whether a scrolling element has content above and below what it shows, kept
 * up to date as it scrolls and as it or its children change size. The lesson's
 * header and footer show their borders only then.
 */
export function createScrollEdges(element: Accessor<HTMLElement | undefined>) {
  const [above, setAbove] = createSignal(false)
  const [below, setBelow] = createSignal(false)

  createEffect(() => {
    const el = element()
    if (!el) return
    // A pixel of slack, since a fractional scrollHeight can stop a pixel short.
    const measure = () => {
      setAbove(el.scrollTop > 0)
      setBelow(el.scrollTop + el.clientHeight < el.scrollHeight - 1)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    for (const child of el.children) observer.observe(child)
    el.addEventListener('scroll', measure, { passive: true })
    measure()
    onCleanup(() => {
      observer.disconnect()
      el.removeEventListener('scroll', measure)
    })
  })

  return { above, below }
}

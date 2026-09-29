import { For, Show, createSignal, mergeProps, onCleanup, onMount, type JSX } from 'solid-js'

export type CritterKind = 'circle' | 'square' | 'triangle' | 'diamond' | 'pill' | 'die'
export type CritterMood = 'awake' | 'asleep' | 'happy'

type CritterProps = {
  kind?: CritterKind
  /** OKLCH hue of the body fill. */
  hue?: number
  /** Width and height in px. */
  size?: number
  mood?: CritterMood
  /** Overrides the hue-derived body fill. */
  fill?: string
  /** Pupils follow the pointer. */
  track?: boolean
  class?: string
}

const INK = '#141311'
const SLEEPY = '#7A756C'
const px = (v: number) => `${v.toFixed(1)}px`

export default function Critter(rawProps: CritterProps) {
  const props = mergeProps(
    { kind: 'circle' as CritterKind, hue: 255, size: 80, mood: 'awake' as CritterMood, track: true },
    rawProps,
  )
  const [look, setLook] = createSignal({ dx: 0, dy: 0 })
  let el!: HTMLDivElement

  onMount(() => {
    let raf = 0
    let last: PointerEvent | undefined
    const onMove = (e: PointerEvent) => {
      last = e
      if (raf || !props.track) return
      raf = requestAnimationFrame(() => {
        raf = 0
        if (!last) return
        const r = el.getBoundingClientRect()
        const dx = last.clientX - (r.left + r.width / 2)
        const dy = last.clientY - (r.top + r.height / 2)
        const d = Math.hypot(dx, dy) || 1
        const k = Math.min(1, d / 160)
        const nx = +((dx / d) * k).toFixed(2)
        const ny = +((dy / d) * k).toFixed(2)
        const cur = look()
        if (Math.abs(nx - cur.dx) + Math.abs(ny - cur.dy) > 0.04) setLook({ dx: nx, dy: ny })
      })
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    onCleanup(() => {
      window.removeEventListener('pointermove', onMove)
      cancelAnimationFrame(raf)
    })
  })

  // Geometry mirrors the design's critter: every measurement scales with size.
  const geo = () => {
    const { kind, size: S, mood } = props
    const fill = props.fill ?? (mood === 'asleep' ? '#E6E2DA' : `oklch(0.83 0.11 ${props.hue})`)
    const bt = S >= 48 ? 2 : 1.5
    let bx = 0, by = 0, bw = S, bh = S, radius = '50%', rot = 'none'
    if (kind === 'square') radius = '22%'
    if (kind === 'die') radius = '24%'
    if (kind === 'pill') { by = S * 0.16; bh = S * 0.68; radius = '999px' }
    if (kind === 'diamond') { bw = bh = S * 0.74; bx = by = S * 0.13; radius = '16%'; rot = 'rotate(45deg)' }
    const small = kind === 'triangle' || kind === 'diamond'
    const ew = S * (small ? 0.22 : kind === 'pill' ? 0.24 : 0.28)
    const pupil = ew * 0.42
    const eyeTop = kind === 'triangle' ? S * 0.5 : kind === 'die' ? S * 0.2 : S * 0.5 - ew * 0.62
    const off = (ew - bt * 2 - pupil) / 2
    const pips = kind === 'die' && mood !== 'asleep'
      ? [[0.26, 0.7], [0.66, 0.7], [0.46, 0.56]].map(([x, y]) => ({ x: S * x, y: S * y, s: S * 0.09 }))
      : []
    return { S, fill, bt, bx, by, bw, bh, radius, rot, small, ew, pupil, eyeTop, off, pips,
      border: `${bt}px solid ${mood === 'asleep' ? SLEEPY : INK}` }
  }

  const eye = (): JSX.Element => {
    const g = geo()
    const max = g.off * 0.95
    const { dx, dy } = props.track ? look() : { dx: 0, dy: 0 }
    if (props.mood === 'asleep') {
      return <span style={{ width: px(g.ew), height: px(Math.max(2, g.S * 0.04)), 'margin-top': px(g.ew * 0.45), 'border-radius': '3px', background: SLEEPY }} />
    }
    if (props.mood === 'happy') {
      return <span style={{ width: px(g.ew), height: px(g.ew * 0.5), 'margin-top': px(g.ew * 0.45), border: `${g.bt}px solid ${INK}`, 'border-bottom': '0', 'border-radius': '999px 999px 0 0' }} />
    }
    return (
      <span style={{ position: 'relative', width: px(g.ew), height: px(g.ew), 'border-radius': '9999px', border: `${g.bt}px solid ${INK}`, background: '#fff' }}>
        <span style={{ position: 'absolute', left: px(g.off), top: px(g.off), width: px(g.pupil), height: px(g.pupil), 'border-radius': '9999px', background: INK, transform: `translate(${px(dx * max)}, ${px(dy * max)})` }} />
      </span>
    )
  }

  return (
    <div
      ref={el}
      class={props.class}
      aria-hidden="true"
      style={{ position: 'relative', width: px(geo().S), height: px(geo().S), flex: 'none' }}
    >
      <Show
        when={props.kind === 'triangle'}
        fallback={
          <span style={{ position: 'absolute', left: px(geo().bx), top: px(geo().by), width: px(geo().bw), height: px(geo().bh), border: geo().border, 'border-radius': geo().radius, background: geo().fill, transform: geo().rot, transition: 'background .25s' }} />
        }
      >
        <span style={{ position: 'absolute', inset: '0', background: INK, 'clip-path': 'polygon(50% 0%,100% 94%,0% 94%)' }} />
        <span style={{ position: 'absolute', inset: '0', background: geo().fill, 'clip-path': 'polygon(50% 7%,94.5% 90.5%,5.5% 90.5%)', transition: 'background .25s' }} />
      </Show>
      <For each={geo().pips}>
        {(p) => <span style={{ position: 'absolute', left: px(p.x), top: px(p.y), width: px(p.s), height: px(p.s), 'border-radius': '9999px', background: INK }} />}
      </For>
      <div style={{ position: 'absolute', left: '0', right: '0', top: px(geo().eyeTop), display: 'flex', 'justify-content': 'center', gap: px(geo().S * (geo().small ? 0.05 : 0.07)) }}>
        {eye()}
        {eye()}
      </div>
    </div>
  )
}

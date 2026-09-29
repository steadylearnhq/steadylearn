import { For, Show } from 'solid-js'
import Critter from '../../components/Critter'
import styles from './HeroCluster.module.css'

// Five nodes on a pentagon inside a 520×460 box. Node 0 leads; node 3 is down.
const CENTER = { x: 260, y: 240 }
const RADIUS = 175
const HUES = [255, 165, 85, 330, 205]
const LEADER = 0
const DOWN = 3

const POINTS = HUES.map((_, i) => {
  const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5
  return { x: CENTER.x + RADIUS * Math.cos(a), y: CENTER.y + RADIUS * Math.sin(a) }
})

const NODES = POINTS.map((p, i) => {
  const lead = i === LEADER
  const down = i === DOWN
  const size = lead ? 96 : 68
  return {
    ...p,
    size,
    lead,
    down,
    hue: HUES[i],
    mood: lead ? ('happy' as const) : down ? ('asleep' as const) : ('awake' as const),
    label: down ? 'n4 · no heartbeat' : `n${i + 1}`,
    labelTop: size / 2 + 8,
  }
})

// Heartbeat links from the leader to each follower, trimmed to the node edges.
const LINKS = POINTS.filter((_, i) => i !== LEADER).map((to, j) => {
  const from = POINTS[LEADER]
  const a = Math.atan2(to.y - from.y, to.x - from.x)
  const trimFrom = 56
  const trimTo = 42
  return {
    left: from.x + trimFrom * Math.cos(a),
    top: from.y + trimFrom * Math.sin(a),
    width: Math.hypot(to.x - from.x, to.y - from.y) - trimFrom - trimTo,
    angle: (a * 180) / Math.PI,
    down: j + 1 === DOWN,
  }
})

export default function HeroCluster() {
  return (
    <div
      class={styles.cluster}
      role="img"
      aria-label="A five-node cluster: n1 is the leader in term 7, and n4 has stopped sending heartbeats."
    >
      <For each={LINKS}>
        {(l) => (
          <span
            class={styles.link}
            classList={{ [styles.linkDown]: l.down }}
            style={{ left: `${l.left}px`, top: `${l.top}px`, width: `${l.width}px`, transform: `rotate(${l.angle}deg)` }}
          />
        )}
      </For>
      <For each={NODES}>
        {(n) => (
          <div class={styles.node} style={{ left: `${n.x}px`, top: `${n.y}px` }}>
            <div class={styles.body}>
              <Show when={n.lead}>
                <span class={styles.badge}>leader · term 7</span>
              </Show>
              <Critter
                kind="circle"
                hue={n.hue}
                size={n.size}
                mood={n.mood}
                fill={n.down ? 'var(--line2)' : undefined}
                track={!n.down}
              />
            </div>
            <span class={styles.label} classList={{ [styles.labelDown]: n.down }} style={{ top: `${n.labelTop}px` }}>
              {n.label}
            </span>
          </div>
        )}
      </For>
    </div>
  )
}

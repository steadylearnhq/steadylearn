import { createSignal, onCleanup, onMount, Show } from 'solid-js'
import { Portal } from 'solid-js/web'
import type { Trailer } from '../../data/catalog'
import { track } from '../../lib/statsig'
import styles from './CoursePreview.module.css'

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
/** How far ← and → move the timeline. */
const SEEK_STEP = 5
/** How much of the trailer has played, as preview_progress counts it. */
const MARKS = [25, 50, 75, 100]

/** How a preview was closed, as preview_close reports it; `other` is the page unmounting it. */
type Via = 'button' | 'backdrop' | 'esc' | 'other'

type Props = {
  /** The course's slug, which every preview event carries. */
  courseId: string
  /** Where the preview was opened from. */
  source: 'sheet' | 'course_page'
  title: string
  /** The domain's name and dot colour, as the course sheet shows them. */
  domain: string
  dot: string
  trailer: Trailer
  onClose: () => void
}

/** 95 seconds as "1:35". */
const clock = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** An HLS manifest, judged by its path so a query string doesn't hide it. */
const isHls = (url: string) => {
  try {
    return new URL(url, location.href).pathname.endsWith('.m3u8')
  } catch {
    return false
  }
}

/**
 * The course's trailer in a modal. It opens paused at 0:00 and plays only when
 * asked. Closing it unmounts it, which stops playback and the download, so it
 * opens at 0:00 again next time. While it is open it owns the keyboard: Esc,
 * Space, Tab and the arrows never reach what lies under it, such as the course
 * sheet, which would otherwise close or change course.
 */
export default function CoursePreview(props: Props) {
  let panel!: HTMLDivElement
  let video!: HTMLVideoElement
  let timeline!: HTMLDivElement
  const [playing, setPlaying] = createSignal(false)
  const [position, setPosition] = createSignal(0)
  const [duration, setDuration] = createSignal(0)
  const [muted, setMuted] = createSignal(false)
  const [failed, setFailed] = createSignal(false)
  // The caption belongs on the striped placeholder, not over a picture.
  const [framed, setFramed] = createSignal(!!props.trailer.posterUrl)

  // The trailer's stated length until the video reports its own.
  const total = () => duration() || props.trailer.seconds
  const percent = () => `${Math.min(100, (position() / total()) * 100).toFixed(2)}%`

  // Analytics: each event once per opening, the marks as playback first passes
  // them, a seek past one included.
  const base = () => ({ course_id: props.courseId, source: props.source })
  let played = false
  let reached = 0
  let via: Via = 'other'
  const logged = new Set<number>()
  const progress = (percent: number) => {
    reached = Math.max(reached, Math.min(100, Math.round(percent)))
    for (const mark of MARKS) {
      if (percent < mark || logged.has(mark)) continue
      logged.add(mark)
      track('preview_progress', { ...base(), percent: String(mark) })
    }
  }
  const close = (how: Via) => {
    via = how
    props.onClose()
  }

  const toggle = () => {
    if (failed()) return
    if (!video.paused) return video.pause()
    if (video.ended) video.currentTime = 0
    // A play() the browser refuses leaves the video paused, which the controls already show.
    video.play().catch(() => {})
  }

  const seekTo = (seconds: number) => {
    const to = Math.max(0, Math.min(total(), seconds))
    video.currentTime = to
    setPosition(to)
  }

  const seekAt = (e: MouseEvent) => {
    const r = timeline.getBoundingClientRect()
    seekTo(((e.clientX - r.left) / r.width) * total())
  }

  let hls: { destroy(): void } | undefined
  let closed = false

  const load = async () => {
    const url = props.trailer.url
    // Safari plays HLS itself; elsewhere hls.js does, loaded only now so it
    // stays out of the main bundle. Anything else is a plain video file.
    if (!isHls(url) || video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url
      return
    }
    try {
      const { default: Hls } = await import('hls.js')
      if (closed) return
      if (!Hls.isSupported()) {
        setFailed(true)
        return
      }
      const player = new Hls()
      player.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) setFailed(true)
      })
      player.loadSource(url)
      player.attachMedia(video)
      hls = player
    } catch {
      setFailed(true)
    }
  }

  onMount(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panel.focus()
    void load()
    track('preview_open', base())

    const onKey = (e: KeyboardEvent) => {
      const key = e.key
      if (!['Escape', ' ', 'Tab', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key)) return
      e.stopPropagation()

      if (key === 'Escape') return close('esc')
      if (key === ' ') {
        // A focused button already takes Space as a press.
        if (document.activeElement instanceof HTMLButtonElement) return
        e.preventDefault()
        return toggle()
      }
      if (key !== 'Tab') {
        if (document.activeElement !== timeline) return
        e.preventDefault()
        if (key === 'Home') return seekTo(0)
        if (key === 'End') return seekTo(total())
        return seekTo(video.currentTime + (key === 'ArrowRight' ? SEEK_STEP : -SEEK_STEP))
      }
      // Keep keyboard focus inside the preview.
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)]
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    // Capturing on the window runs before any other key listener on the page.
    window.addEventListener('keydown', onKey, true)

    onCleanup(() => {
      closed = true
      track('preview_close', { ...base(), via, max_percent: String(reached) })
      window.removeEventListener('keydown', onKey, true)
      hls?.destroy()
      video.pause()
      video.removeAttribute('src')
      video.load()
      document.body.style.overflow = previousOverflow
      previousFocus?.focus()
    })
  })

  return (
    <Portal>
      <div class={styles.scrim} onClick={() => close('backdrop')}>
        <div
          ref={panel}
          class={styles.panel}
          role="dialog"
          aria-modal="true"
          aria-labelledby="course-preview-title"
          tabindex="-1"
          onClick={(e) => e.stopPropagation()}
        >
          <div class={styles.head}>
            <div class={styles.heading}>
              <div class={styles.meta}>
                <span class={styles.dot} style={{ background: props.dot }} />
                <span class={styles.label}>
                  {props.domain} · preview · {clock(total())}
                </span>
              </div>
              <h2 id="course-preview-title" class={styles.title}>
                {props.title}
              </h2>
            </div>
            <button type="button" class={styles.close} aria-label="Close preview" onClick={() => close('button')}>
              ✕
            </button>
          </div>

          <div class={styles.stage} onClick={toggle}>
            <video
              ref={video}
              class={styles.video}
              preload="metadata"
              playsinline
              poster={props.trailer.posterUrl ?? undefined}
              onPlay={() => {
                setPlaying(true)
                if (!played) track('preview_play', base())
                played = true
              }}
              onPause={() => setPlaying(false)}
              onEnded={() => {
                setPlaying(false)
                progress(100)
              }}
              onTimeUpdate={() => {
                setPosition(video.currentTime)
                if (played) progress((video.currentTime / total()) * 100)
              }}
              onLoadedData={() => setFramed(true)}
              onDurationChange={() => setDuration(Number.isFinite(video.duration) ? video.duration : 0)}
              onVolumeChange={() => setMuted(video.muted)}
              onError={() => video.getAttribute('src') && setFailed(true)}
            />
            <Show
              when={!failed()}
              fallback={
                <span class={styles.caption} role="alert">
                  The preview didn't load.
                </span>
              }
            >
              <Show when={!playing()}>
                <div class={styles.big}>
                  <span class={styles.bigPlay} aria-hidden="true">
                    ▶
                  </span>
                  <Show when={!framed()}>
                    <span class={styles.caption}>course trailer</span>
                  </Show>
                </div>
              </Show>
            </Show>
          </div>

          <div class={styles.controls}>
            <button
              type="button"
              class={styles.play}
              aria-label={playing() ? 'Pause' : 'Play'}
              disabled={failed()}
              onClick={toggle}
            >
              {playing() ? '❚❚' : '▶'}
            </button>
            <span class={styles.time}>
              {clock(position())} / {clock(total())}
            </span>
            <div
              ref={timeline}
              class={styles.timeline}
              role="slider"
              tabindex="0"
              aria-label="Seek"
              aria-valuemin={0}
              aria-valuemax={Math.round(total())}
              aria-valuenow={Math.round(position())}
              aria-valuetext={`${clock(position())} of ${clock(total())}`}
              onClick={seekAt}
            >
              <span class={styles.track}>
                <span class={styles.fill} style={{ width: percent() }} />
              </span>
              <span class={styles.thumb} style={{ left: percent() }} />
            </div>
            <button
              type="button"
              class={styles.mute}
              aria-pressed={muted()}
              onClick={() => (video.muted = !video.muted)}
            >
              {muted() ? 'unmute' : 'mute'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}

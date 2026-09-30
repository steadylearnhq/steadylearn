import { STEP_BY_KEY, type LessonStepKey } from '../data/lessonSteps'

/**
 * A lesson step's line icon, drawn in currentColor. The paths are on a 24×24
 * grid; smaller sizes scale the drawing, so thicken `stroke` to keep the line
 * weight readable.
 */
export default function StepIcon(props: { step: LessonStepKey; size?: number; stroke?: number }) {
  return (
    <svg
      width={props.size ?? 24}
      height={props.size ?? 24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width={props.stroke ?? 1.6}
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      style={{ display: 'block', overflow: 'visible', flex: 'none' }}
    >
      <path d={STEP_BY_KEY[props.step].icon} />
    </svg>
  )
}

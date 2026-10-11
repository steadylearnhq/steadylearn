import type { LessonStage } from '../../../lib/lessons'

/** How the footer names each kind of stage, and the next button that leads into one. */
export const STAGE_LABELS: Record<LessonStage['kind'], { label: string; lead: string }> = {
  // A lesson can come back to learning after a lab.
  learn: { label: 'Learn', lead: 'Continue →' },
  interactive: { label: 'Lab', lead: 'Continue to lab →' },
  questions: { label: 'Questions', lead: 'Continue to questions →' },
  review: { label: 'Review', lead: 'See review →' },
}

export type LessonStepKey = 'watch' | 'read' | 'build' | 'trace' | 'range' | 'bet' | 'break' | 'postmortem'

export type LessonStep = {
  key: LessonStepKey
  glyph: string
  name: string
  /** Short label used in the syllabus legend. */
  legend: string
  description: string
}

/** The building blocks every lesson is assembled from. */
export const LESSON_STEPS: LessonStep[] = [
  { key: 'watch', glyph: '▶', name: 'Watch', legend: 'video', description: 'Short lectures, chaptered, under twelve minutes.' },
  { key: 'read', glyph: '¶', name: 'Read', legend: 'read', description: 'One idea per page, with a diagram you can check against.' },
  { key: 'build', glyph: '⧉', name: 'Build', legend: 'build', description: 'Assemble the path a request takes, piece by piece.' },
  { key: 'trace', glyph: '{}', name: 'Trace', legend: 'trace', description: 'Read real code and predict what it prints.' },
  { key: 'range', glyph: '↔', name: 'Range bet', legend: 'range bet', description: 'Estimate a number as a range, not a guess.' },
  { key: 'bet', glyph: '?', name: 'Bet', legend: 'bet', description: 'Answer with a confidence. Scored for calibration.' },
  { key: 'break', glyph: '✕', name: 'Break it', legend: 'break it', description: 'A live simulation. Make it fail in as few moves as you can.' },
  { key: 'postmortem', glyph: '✎', name: 'Post-mortem', legend: 'post-mortem', description: 'The incident this lesson would have prevented.' },
]

export const STEP_BY_KEY = Object.fromEntries(LESSON_STEPS.map((s) => [s.key, s])) as Record<LessonStepKey, LessonStep>

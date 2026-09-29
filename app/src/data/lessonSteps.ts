export type LessonStep = {
  glyph: string
  name: string
  description: string
}

/** The building blocks every lesson is assembled from. */
export const LESSON_STEPS: LessonStep[] = [
  { glyph: '▶', name: 'Watch', description: 'Short lectures, chaptered, under twelve minutes.' },
  { glyph: '¶', name: 'Read', description: 'One idea per page, with a diagram you can check against.' },
  { glyph: '⧉', name: 'Build', description: 'Assemble the path a request takes, piece by piece.' },
  { glyph: '{}', name: 'Trace', description: 'Read real code and predict what it prints.' },
  { glyph: '↔', name: 'Range bet', description: 'Estimate a number as a range, not a guess.' },
  { glyph: '?', name: 'Bet', description: 'Answer with a confidence. Scored for calibration.' },
  { glyph: '✕', name: 'Break it', description: 'A live simulation. Make it fail in as few moves as you can.' },
  { glyph: '✎', name: 'Post-mortem', description: 'The incident this lesson would have prevented.' },
]

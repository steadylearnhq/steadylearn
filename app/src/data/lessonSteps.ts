export type LessonStepKey = 'watch' | 'read' | 'build' | 'trace' | 'range' | 'bet' | 'break' | 'postmortem'

export type LessonStep = {
  key: LessonStepKey
  /** Stroke path on a 24×24 grid, drawn by StepIcon. */
  icon: string
  name: string
  /** Short label used where the step is named in a list, e.g. a lesson's steps. */
  legend: string
  description: string
}

/** The building blocks every lesson is assembled from. */
export const LESSON_STEPS: LessonStep[] = [
  {
    key: 'watch',
    icon: 'M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM10.25 9.4v5.2L14.75 12z',
    name: 'Watch',
    legend: 'video',
    description: 'Short lectures, chaptered, under twelve minutes.',
  },
  {
    key: 'read',
    icon: 'M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM14 3v5h5M9 13h6M9 17h4',
    name: 'Read',
    legend: 'read',
    description: 'One idea per page, with a diagram you can check against.',
  },
  {
    key: 'build',
    icon: 'M10 4h4a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 1-1.5 1.5h-4a1.5 1.5 0 0 1-1.5-1.5v-4A1.5 1.5 0 0 1 10 4zM5.5 13h4a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 1-1.5 1.5h-4A1.5 1.5 0 0 1 4 18.5v-4A1.5 1.5 0 0 1 5.5 13zM14.5 13h4a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 1-1.5 1.5h-4a1.5 1.5 0 0 1-1.5-1.5v-4a1.5 1.5 0 0 1 1.5-1.5z',
    name: 'Build',
    legend: 'build',
    description: 'Assemble the path a request takes, piece by piece.',
  },
  {
    key: 'trace',
    icon: 'M8 7l-5 5 5 5M16 7l5 5-5 5M13.5 5l-3 14',
    name: 'Trace',
    legend: 'trace',
    description: 'Read real code and predict what it prints.',
  },
  {
    key: 'range',
    icon: 'M4 6v12M20 6v12M4 12h5.75M14.25 12H20M14.25 12a2.25 2.25 0 1 1-4.5 0a2.25 2.25 0 1 1 4.5 0z',
    name: 'Range bet',
    legend: 'range bet',
    description: 'Estimate a number as a range, not a guess.',
  },
  {
    key: 'bet',
    icon: 'M3 16a9 9 0 0 1 18 0M13.5 16a1.5 1.5 0 1 1-3 0a1.5 1.5 0 1 1 3 0zM12.75 14.7l2.75-4.76M5.42 12.2l1.21.7M12 8.4v1.4M18.58 12.2l-1.21.7',
    name: 'Bet',
    legend: 'bet',
    description: 'Answer with a confidence. Scored for calibration.',
  },
  {
    key: 'break',
    icon: 'M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3.5l1.5-4-2.5-3.5 2.5-4.5zM13.5 4H18a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6l1.5-4-2.5-3.5 2.5-4.5z',
    name: 'Break it',
    legend: 'break it',
    description: 'A live simulation. Make it fail in as few moves as you can.',
  },
  {
    key: 'postmortem',
    icon: 'M4.5 4.8v4.5H9M4.48 9.26A8 8 0 1 1 4.1 13.4M12 8v4l3 2',
    name: 'Post-mortem',
    legend: 'post-mortem',
    description: 'The incident this lesson would have prevented.',
  },
]

export const STEP_BY_KEY = Object.fromEntries(LESSON_STEPS.map((s) => [s.key, s])) as Record<LessonStepKey, LessonStep>

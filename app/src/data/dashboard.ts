import { courseById, type Course } from './catalog'
import type { LessonStepKey } from './lessonSteps'

// Placeholder progress for the signed-in home page, taken from the design.
// Nothing tracks lessons, points or followers yet; swap these for API data
// once it exists.

export type Kpi = { label: string; value: string; sub: string; highlight?: boolean }

export const KPIS: Kpi[] = [
  { label: 'Streak', value: '12 days', sub: 'longest 31' },
  { label: 'Points this week', value: '1,240', sub: '+180 vs last week', highlight: true },
  { label: 'Rank', value: '#4', sub: 'of 18 you follow' },
  { label: 'Calibration', value: '0.81', sub: 'right 78% at 90%' },
  { label: 'Lessons done', value: '96', sub: '14 this week' },
]

export type UpNext = { course: Course; step: LessonStepKey; code: string; title: string; minutes: number }

export const UP_NEXT: UpNext = {
  course: courseById('replication-consensus')!,
  step: 'range',
  code: '2.4',
  title: 'Raw storage per day',
  minutes: 4,
}

export type Enrollment = { course: Course; next: string; progress: number }

export const CONTINUE: Enrollment[] = [
  {
    course: UP_NEXT.course,
    next: `Next: ${UP_NEXT.code} ${UP_NEXT.title} · ${UP_NEXT.minutes} min`,
    progress: 50,
  },
  { course: courseById('storage-engines')!, next: 'Next: 2.3 Page splits and merges · 6 min', progress: 20 },
  { course: courseById('partitioning-rebalancing')!, next: 'Finished · review bet due Thursday', progress: 100 },
]

export type BoardEntry = { rank: number; initials: string; name: string; points: string; hue: number; you?: boolean }

export const BOARDS: Record<'following' | 'all', BoardEntry[]> = {
  following: [
    { rank: 1, initials: 'PR', name: 'Priya Raman', points: '1,610', hue: 165 },
    { rank: 2, initials: 'TE', name: 'Tomás Ek', points: '1,480', hue: 85 },
    { rank: 3, initials: 'AO', name: 'Ade Okafor', points: '1,355', hue: 330 },
    { rank: 4, initials: '', name: 'You', points: '1,240', hue: 255, you: true },
    { rank: 5, initials: 'LZ', name: 'Lin Zhou', points: '1,190', hue: 205 },
  ],
  all: [
    { rank: 1, initials: 'NK', name: 'Noor Khalil', points: '2,940', hue: 290 },
    { rank: 2, initials: 'JB', name: 'Jonas Berg', points: '2,715', hue: 35 },
    { rank: 3, initials: 'PR', name: 'Priya Raman', points: '1,610', hue: 165 },
    { rank: 4, initials: 'TE', name: 'Tomás Ek', points: '1,480', hue: 85 },
    { rank: 212, initials: '', name: 'You', points: '1,240', hue: 255, you: true },
  ],
}

export const RECOMMENDED: Course[] = ['storage-engines', 'tail-latency-queueing', 'applied-cryptography'].map(
  (id) => courseById(id)!,
)

/** A member's progress through a course, as a percentage, or undefined if they haven't started it. */
export const progressOf = (courseId: string) => CONTINUE.find((e) => e.course.id === courseId)?.progress

import type { CritterKind } from '../components/Critter'
import type { CourseEnrollment } from '../lib/enrollments'
import type { LessonStepKey } from './lessonSteps'

export type DomainId = 'dist' | 'db' | 'comp' | 'crypto' | 'ml' | 'prob'

/** A domain as the API lists it. The id is a slug, e.g. "dist". */
export type Domain = {
  id: string
  name: string
}

/** How a domain is drawn. This is design, so it lives here rather than in the API. */
export type DomainStyle = {
  kind: CritterKind
  hue: number
}

export const DOMAINS: (Domain & DomainStyle & { id: DomainId })[] = [
  { id: 'dist', name: 'Distributed systems', kind: 'circle', hue: 255 },
  { id: 'db', name: 'Databases', kind: 'square', hue: 165 },
  { id: 'comp', name: 'Compilers', kind: 'triangle', hue: 85 },
  { id: 'crypto', name: 'Cryptography', kind: 'diamond', hue: 205 },
  { id: 'ml', name: 'Inference', kind: 'pill', hue: 330 },
  { id: 'prob', name: 'Probability', kind: 'die', hue: 290 },
]

export const DOMAIN_BY_ID = Object.fromEntries(DOMAINS.map((d) => [d.id, d])) as Record<DomainId, (typeof DOMAINS)[number]>

/** A domain the API adds before the app has a style for it gets this one. */
const FALLBACK_STYLE: DomainStyle = { kind: 'circle', hue: 250 }

export const domainStyle = (id: string): DomainStyle => DOMAIN_BY_ID[id as DomainId] ?? FALLBACK_STYLE

/** The name from the app's own copy of the domains, for the pages the API does not serve yet. */
export const domainName = (id: string) => DOMAIN_BY_ID[id as DomainId]?.name ?? id

/** The small colored dot that marks a domain in lists. */
export const domainDot = (id: string) =>
  id in DOMAIN_BY_ID ? `oklch(0.7 0.13 ${domainStyle(id).hue})` : 'var(--faint)'

export type Level = 'foundational' | 'intermediate' | 'advanced'

export const LEVELS: { id: Level; label: string }[] = [
  { id: 'foundational', label: 'Foundational' },
  { id: 'intermediate', label: 'Intermediate' },
  { id: 'advanced', label: 'Advanced' },
]

export const levelLabel = (level: Level) => LEVELS.find((l) => l.id === level)?.label ?? level

/** A course as the catalog lists it (GET /v1/catalog), without its syllabus. */
export type Course = {
  id: string
  domain: string
  title: string
  description: string
  level: Level
  /** Advertised length, which includes time spent in the simulations. */
  minutes: number
  lessonCount: number
  isNew: boolean
  isFree: boolean
  /** Failure modes the learner triggers in the course's simulations. */
  breakIts: string[]
}

export type Catalog = {
  domains: Domain[]
  courses: Course[]
}

export type Lesson = {
  code: string
  title: string
  steps: LessonStepKey[]
  minutes: number
}

/** A syllabus module. `lessons` is null for a visitor unless the course's syllabus is open to them; members get every lesson. */
export type Module = {
  title: string
  lessonCount: number
  lessons: Lesson[] | null
}

export type Requirement = { title: string; detail: string }

/** A break-it as the course's page describes it. `par` is null when the simulation sets none. */
export type BreakIt = { name: string; description: string; par: number | null }

/** A course in the catalog that makes this one easier to take. */
export type Prerequisite = { id: string; optional: boolean }

/**
 * A course with its syllabus and the copy its own page shows (GET
 * /v1/courses/:id). A course without some of that copy has empty strings and
 * lists, and the page leaves those parts out.
 */
export type CourseDetail = Course & {
  overview: string
  assumes: string
  requirements: Requirement[]
  outcomes: string[]
  breakItDetails: BreakIt[]
  prerequisites: Prerequisite[]
  modules: Module[]
  /** The member's own, sent only when they are signed in and enrolled. */
  enrollment?: CourseEnrollment
}

// The pages the API does not serve yet (landing, pricing and the dashboard's
// placeholders) still read this copy of the catalog. The API's seed migration
// holds the same courses; retire this once those pages fetch it.
export const COURSES: Course[] = [
  {
    id: 'replication-consensus',
    domain: 'dist',
    title: 'Replication & consensus',
    description: 'Quorums, elections and leases, and the trade-offs behind each one.',
    level: 'advanced',
    minutes: 198,
    lessonCount: 12,
    isNew: false,
    isFree: false,
    breakIts: ['Lost write', 'Stale read', 'Split brain'],
  },
  {
    id: 'clocks-time-ordering',
    domain: 'dist',
    title: 'Clocks, time and ordering',
    description: 'Lamport clocks, vector clocks, hybrid logical clocks and TrueTime.',
    level: 'advanced',
    minutes: 240,
    lessonCount: 9,
    isNew: false,
    isFree: false,
    breakIts: ['Causality violation', 'Skewed reorder', 'Skipped commit wait'],
  },
  {
    id: 'partitioning-rebalancing',
    domain: 'dist',
    title: 'Partitioning and rebalancing',
    description: 'Hash vs range partitioning, hot keys, and moving data without downtime.',
    level: 'intermediate',
    minutes: 180,
    lessonCount: 8,
    isNew: false,
    isFree: false,
    breakIts: ['Hot partition', 'Lost key on move'],
  },
  {
    id: 'distributed-transactions',
    domain: 'dist',
    title: 'Distributed transactions',
    description: 'Two-phase commit, sagas, Percolator and Calvin, and when to avoid them.',
    level: 'advanced',
    minutes: 360,
    lessonCount: 14,
    isNew: false,
    isFree: false,
    breakIts: ['Blocked coordinator', 'Orphaned lock', 'Half-applied saga', 'Lost compensation', 'Heuristic abort'],
  },
  {
    id: 'failure-detection-gossip',
    domain: 'dist',
    title: 'Failure detection and gossip',
    description: 'Phi-accrual detectors, SWIM, and why "is it down?" has no crisp answer.',
    level: 'intermediate',
    minutes: 150,
    lessonCount: 7,
    isNew: false,
    isFree: false,
    breakIts: ['False-positive storm', 'Zombie member'],
  },
  {
    id: 'crdts-local-first',
    domain: 'dist',
    title: 'CRDTs and local-first',
    description: 'Merge functions that always converge, and what they cost in metadata.',
    level: 'advanced',
    minutes: 270,
    lessonCount: 10,
    isNew: true,
    isFree: false,
    breakIts: ['Tombstone bloat', 'Interleaved edits', 'Resurrected delete'],
  },
  {
    id: 'storage-engines',
    domain: 'db',
    title: 'Storage engines',
    description: 'B-trees and LSM trees from the page up: write amplification, compaction, recovery.',
    level: 'advanced',
    minutes: 420,
    lessonCount: 15,
    isNew: false,
    isFree: false,
    breakIts: ['Torn page', 'Compaction stall', 'Lost WAL tail', 'Read amplification'],
  },
  {
    id: 'isolation-honestly',
    domain: 'db',
    title: 'Isolation, honestly',
    description: 'What each isolation level actually permits, shown as anomalies you can trigger.',
    level: 'intermediate',
    minutes: 180,
    lessonCount: 8,
    isNew: false,
    isFree: false,
    breakIts: ['Dirty read', 'Lost update', 'Write skew', 'Phantom read', 'Read skew'],
  },
  {
    id: 'compilers-for-practitioners',
    domain: 'comp',
    title: 'Compilers for practitioners',
    description: 'SSA, inlining and register allocation, read through the lens of your hot loop.',
    level: 'intermediate',
    minutes: 480,
    lessonCount: 16,
    isNew: false,
    isFree: false,
    breakIts: ['Aliasing miscompile', 'Spill storm'],
  },
  {
    id: 'applied-cryptography',
    domain: 'crypto',
    title: 'Applied cryptography',
    description: 'Primitives, protocols, and the misuse patterns that show up in code review.',
    level: 'intermediate',
    minutes: 300,
    lessonCount: 11,
    isNew: false,
    isFree: false,
    breakIts: ['Nonce reuse', 'Padding oracle', 'Timing leak', 'Key confusion'],
  },
  {
    id: 'serving-large-models',
    domain: 'ml',
    title: 'Serving large models',
    description: 'Batching, KV caches, paged attention and the unit economics of a token.',
    level: 'advanced',
    minutes: 300,
    lessonCount: 12,
    isNew: true,
    isFree: false,
    breakIts: ['Cache thrash', 'Head-of-line batch'],
  },
  {
    id: 'quantization-in-practice',
    domain: 'ml',
    title: 'Quantization in practice',
    description: 'What you lose at int8 and int4, and how to measure it before users do.',
    level: 'advanced',
    minutes: 90,
    lessonCount: 5,
    isNew: false,
    isFree: false,
    breakIts: ['Outlier collapse'],
  },
  {
    id: 'tail-latency-queueing',
    domain: 'prob',
    title: 'Tail latency and queueing',
    description: "Little's law, fan-out, hedged requests and why p99 lies about p99.9.",
    level: 'intermediate',
    minutes: 180,
    lessonCount: 9,
    isNew: false,
    isFree: false,
    breakIts: ['Retry storm', 'Fan-out tail', 'Coordinated omission'],
  },
  {
    id: 'estimation',
    domain: 'prob',
    title: 'Estimation',
    description: 'Back-of-envelope numbers you can defend, with ranges and stated confidence.',
    level: 'foundational',
    minutes: 90,
    lessonCount: 6,
    isNew: false,
    isFree: true,
    breakIts: ['Unit slip'],
  },
]

export const coursesIn = (domain: DomainId) => COURSES.filter((c) => c.domain === domain)

export const courseById = (id: string | undefined) => COURSES.find((c) => c.id === id)

export const TOTAL_LESSONS = COURSES.reduce((sum, c) => sum + c.lessonCount, 0)

/** "90 min" under two hours, otherwise "3.3 h". */
export const formatLength = (minutes: number) =>
  minutes < 120 ? `${minutes} min` : `${Math.round(minutes / 6) / 10} h`

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

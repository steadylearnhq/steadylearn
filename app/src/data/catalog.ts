import type { CritterKind } from '../components/Critter'
import type { LessonStepKey } from './lessonSteps'

export type DomainId = 'dist' | 'db' | 'comp' | 'crypto' | 'ml' | 'prob'

export type Domain = {
  id: DomainId
  name: string
  kind: CritterKind
  hue: number
}

export const DOMAINS: Domain[] = [
  { id: 'dist', name: 'Distributed systems', kind: 'circle', hue: 255 },
  { id: 'db', name: 'Databases', kind: 'square', hue: 165 },
  { id: 'comp', name: 'Compilers', kind: 'triangle', hue: 85 },
  { id: 'crypto', name: 'Cryptography', kind: 'diamond', hue: 205 },
  { id: 'ml', name: 'Inference', kind: 'pill', hue: 330 },
  { id: 'prob', name: 'Probability', kind: 'die', hue: 290 },
]

export const DOMAIN_BY_ID = Object.fromEntries(DOMAINS.map((d) => [d.id, d])) as Record<DomainId, Domain>

/** The small colored dot that marks a domain in lists. */
export const domainDot = (id: DomainId) => `oklch(0.7 0.13 ${DOMAIN_BY_ID[id].hue})`

export const LEVELS = ['Foundational', 'Intermediate', 'Advanced'] as const
export type Level = (typeof LEVELS)[number]

export type Lesson = {
  code: string
  title: string
  steps: LessonStepKey[]
  minutes: number
}

/** A syllabus module. `lessons` is only public for courses with an open syllabus. */
export type Module = {
  title: string
  lessonCount: number
  lessons?: Lesson[]
}

export type Course = {
  id: string
  domain: DomainId
  title: string
  description: string
  level: Level
  hours: number
  lessons: number
  isNew?: boolean
  isFree?: boolean
  /** Failure modes the learner triggers in the course's simulations. */
  breakIts: string[]
  modules: Module[]
}

const lesson = (code: string, title: string, steps: LessonStepKey[], minutes: number): Lesson => ({
  code,
  title,
  steps,
  minutes,
})

const openModule = (title: string, lessons: Lesson[]): Module => ({ title, lessonCount: lessons.length, lessons })

export const COURSES: Course[] = [
  {
    id: 'replication-consensus',
    domain: 'dist',
    title: 'Replication & consensus',
    description: 'Quorums, elections and leases, and the trade-offs behind each one.',
    level: 'Advanced',
    hours: 3.3,
    lessons: 12,
    breakIts: ['Lost write', 'Stale read', 'Split brain'],
    modules: [
      openModule('Why replicate', [
        lesson('1.1', 'Failure is the normal case', ['watch', 'read'], 9),
        lesson('1.2', 'The write path', ['read', 'build', 'bet'], 14),
        lesson('1.3', 'Lose an acknowledged write', ['watch', 'break', 'postmortem'], 16),
      ]),
      openModule('Quorums', [
        lesson('2.1', 'Leaderless replication', ['watch', 'read', 'bet'], 11),
        lesson('2.2', 'Quorums and R + W > N', ['watch', 'read', 'bet', 'postmortem'], 18),
        lesson('2.3', 'Sizing replicated storage', ['watch', 'read', 'range', 'bet'], 15),
        lesson('2.4', 'Sloppy quorums', ['watch', 'read', 'break'], 14),
      ]),
      openModule('Consensus', [
        lesson('3.1', 'Why consensus is hard', ['watch', 'read'], 12),
        lesson('3.2', 'Leader election', ['watch', 'read', 'break', 'bet', 'postmortem'], 24),
        lesson('3.3', 'Log matching', ['read', 'trace', 'bet'], 16),
      ]),
      openModule('Time and leases', [
        lesson('4.1', "Clocks you can't trust", ['watch', 'read', 'bet'], 12),
        lesson('4.2', 'Fencing tokens', ['read', 'trace', 'bet', 'postmortem'], 18),
      ]),
    ],
  },
  {
    id: 'clocks-time-ordering',
    domain: 'dist',
    title: 'Clocks, time and ordering',
    description: 'Lamport clocks, vector clocks, hybrid logical clocks and TrueTime.',
    level: 'Advanced',
    hours: 4,
    lessons: 9,
    breakIts: ['Causality violation', 'Skewed reorder', 'Skipped commit wait'],
    modules: [
      { title: 'Physical clocks and drift', lessonCount: 2 },
      { title: 'Lamport and vector clocks', lessonCount: 3 },
      { title: 'Hybrid logical clocks', lessonCount: 2 },
      { title: 'TrueTime and commit wait', lessonCount: 2 },
    ],
  },
  {
    id: 'partitioning-rebalancing',
    domain: 'dist',
    title: 'Partitioning and rebalancing',
    description: 'Hash vs range partitioning, hot keys, and moving data without downtime.',
    level: 'Intermediate',
    hours: 3,
    lessons: 8,
    breakIts: ['Hot partition', 'Lost key on move'],
    modules: [
      { title: 'Hash vs range', lessonCount: 3 },
      { title: 'Hot keys', lessonCount: 2 },
      { title: 'Rebalancing online', lessonCount: 3 },
    ],
  },
  {
    id: 'distributed-transactions',
    domain: 'dist',
    title: 'Distributed transactions',
    description: 'Two-phase commit, sagas, Percolator and Calvin, and when to avoid them.',
    level: 'Advanced',
    hours: 6,
    lessons: 14,
    breakIts: ['Blocked coordinator', 'Orphaned lock', 'Half-applied saga', 'Lost compensation', 'Heuristic abort'],
    modules: [
      { title: 'Atomic commit', lessonCount: 4 },
      { title: 'Two-phase commit', lessonCount: 4 },
      { title: 'Sagas', lessonCount: 3 },
      { title: 'Deterministic databases', lessonCount: 3 },
    ],
  },
  {
    id: 'failure-detection-gossip',
    domain: 'dist',
    title: 'Failure detection and gossip',
    description: 'Phi-accrual detectors, SWIM, and why "is it down?" has no crisp answer.',
    level: 'Intermediate',
    hours: 2.5,
    lessons: 7,
    breakIts: ['False-positive storm', 'Zombie member'],
    modules: [
      { title: 'Timeouts', lessonCount: 2 },
      { title: 'Phi-accrual detection', lessonCount: 2 },
      { title: 'Gossip and SWIM', lessonCount: 3 },
    ],
  },
  {
    id: 'crdts-local-first',
    domain: 'dist',
    title: 'CRDTs and local-first',
    description: 'Merge functions that always converge, and what they cost in metadata.',
    level: 'Advanced',
    hours: 4.5,
    lessons: 10,
    isNew: true,
    breakIts: ['Tombstone bloat', 'Interleaved edits', 'Resurrected delete'],
    modules: [
      { title: 'Convergence', lessonCount: 3 },
      { title: 'Counters and sets', lessonCount: 4 },
      { title: 'Sequences and text', lessonCount: 3 },
    ],
  },
  {
    id: 'storage-engines',
    domain: 'db',
    title: 'Storage engines',
    description: 'B-trees and LSM trees from the page up: write amplification, compaction, recovery.',
    level: 'Advanced',
    hours: 7,
    lessons: 15,
    breakIts: ['Torn page', 'Compaction stall', 'Lost WAL tail', 'Read amplification'],
    modules: [
      { title: 'Pages and B-trees', lessonCount: 5 },
      { title: 'LSM trees', lessonCount: 5 },
      { title: 'Compaction', lessonCount: 3 },
      { title: 'Recovery', lessonCount: 2 },
    ],
  },
  {
    id: 'isolation-honestly',
    domain: 'db',
    title: 'Isolation, honestly',
    description: 'What each isolation level actually permits, shown as anomalies you can trigger.',
    level: 'Intermediate',
    hours: 3,
    lessons: 8,
    breakIts: ['Dirty read', 'Lost update', 'Write skew', 'Phantom read', 'Read skew'],
    modules: [
      { title: 'Anomalies', lessonCount: 3 },
      { title: 'Snapshot isolation', lessonCount: 3 },
      { title: 'Serializability', lessonCount: 2 },
    ],
  },
  {
    id: 'compilers-for-practitioners',
    domain: 'comp',
    title: 'Compilers for practitioners',
    description: 'SSA, inlining and register allocation, read through the lens of your hot loop.',
    level: 'Intermediate',
    hours: 8,
    lessons: 16,
    breakIts: ['Aliasing miscompile', 'Spill storm'],
    modules: [
      { title: 'IR and SSA', lessonCount: 4 },
      { title: 'Optimization passes', lessonCount: 5 },
      { title: 'Register allocation', lessonCount: 4 },
      { title: 'Reading the output', lessonCount: 3 },
    ],
  },
  {
    id: 'applied-cryptography',
    domain: 'crypto',
    title: 'Applied cryptography',
    description: 'Primitives, protocols, and the misuse patterns that show up in code review.',
    level: 'Intermediate',
    hours: 5,
    lessons: 11,
    breakIts: ['Nonce reuse', 'Padding oracle', 'Timing leak', 'Key confusion'],
    modules: [
      { title: 'Primitives', lessonCount: 3 },
      { title: 'Authenticated encryption', lessonCount: 3 },
      { title: 'Protocols', lessonCount: 3 },
      { title: 'Misuse in review', lessonCount: 2 },
    ],
  },
  {
    id: 'serving-large-models',
    domain: 'ml',
    title: 'Serving large models',
    description: 'Batching, KV caches, paged attention and the unit economics of a token.',
    level: 'Advanced',
    hours: 5,
    lessons: 12,
    isNew: true,
    breakIts: ['Cache thrash', 'Head-of-line batch'],
    modules: [
      { title: 'Batching', lessonCount: 3 },
      { title: 'KV caches', lessonCount: 3 },
      { title: 'Paged attention', lessonCount: 3 },
      { title: 'Cost per token', lessonCount: 3 },
    ],
  },
  {
    id: 'quantization-in-practice',
    domain: 'ml',
    title: 'Quantization in practice',
    description: 'What you lose at int8 and int4, and how to measure it before users do.',
    level: 'Advanced',
    hours: 1.5,
    lessons: 5,
    breakIts: ['Outlier collapse'],
    modules: [
      { title: 'Number formats', lessonCount: 2 },
      { title: 'Measuring the loss', lessonCount: 3 },
    ],
  },
  {
    id: 'tail-latency-queueing',
    domain: 'prob',
    title: 'Tail latency and queueing',
    description: "Little's law, fan-out, hedged requests and why p99 lies about p99.9.",
    level: 'Intermediate',
    hours: 3,
    lessons: 9,
    breakIts: ['Retry storm', 'Fan-out tail', 'Coordinated omission'],
    modules: [
      { title: "Little's law", lessonCount: 3 },
      { title: 'Fan-out', lessonCount: 3 },
      { title: 'Hedged requests', lessonCount: 3 },
    ],
  },
  {
    id: 'estimation',
    domain: 'prob',
    title: 'Estimation',
    description: 'Back-of-envelope numbers you can defend, with ranges and stated confidence.',
    level: 'Foundational',
    hours: 1.5,
    lessons: 6,
    isFree: true,
    breakIts: ['Unit slip'],
    modules: [
      { title: 'Orders of magnitude', lessonCount: 3 },
      { title: 'Ranges and confidence', lessonCount: 3 },
    ],
  },
]

export const coursesIn = (domain: DomainId) => COURSES.filter((c) => c.domain === domain)

export const courseById = (id: string | undefined) => COURSES.find((c) => c.id === id)

export const TOTAL_LESSONS = COURSES.reduce((sum, c) => sum + c.lessons, 0)

/** "90 min" under two hours, otherwise "3.3 h". */
export const formatHours = (h: number) => (h < 2 ? `${Math.round(h * 60)} min` : `${h} h`)

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

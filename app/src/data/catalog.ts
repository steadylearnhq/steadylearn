import type { CritterKind } from '../components/Critter'

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

export type Course = {
  domain: DomainId
  title: string
}

export const COURSES: Course[] = [
  { domain: 'dist', title: 'Replication & consensus' },
  { domain: 'dist', title: 'Clocks, time and ordering' },
  { domain: 'dist', title: 'Partitioning and rebalancing' },
  { domain: 'dist', title: 'Distributed transactions' },
  { domain: 'dist', title: 'Failure detection and gossip' },
  { domain: 'dist', title: 'CRDTs and local-first' },
  { domain: 'db', title: 'Storage engines' },
  { domain: 'db', title: 'Isolation, honestly' },
  { domain: 'comp', title: 'Compilers for practitioners' },
  { domain: 'crypto', title: 'Applied cryptography' },
  { domain: 'ml', title: 'Serving large models' },
  { domain: 'ml', title: 'Quantization in practice' },
  { domain: 'prob', title: 'Tail latency and queueing' },
  { domain: 'prob', title: 'Estimation' },
]

export const coursesIn = (domain: DomainId) => COURSES.filter((c) => c.domain === domain)

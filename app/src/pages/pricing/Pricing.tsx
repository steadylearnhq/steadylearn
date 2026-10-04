import { For, type JSX } from 'solid-js'
import Button from '../../components/Button'
import { COURSES, DOMAINS, TOTAL_LESSONS, formatLength, plural } from '../../data/catalog'
import { SUBSCRIBE_HREF } from '../../lib/billing'
import { usePageTitle } from '../../lib/title'
import styles from './Pricing.module.css'

const FREE_COURSE = COURSES.find((c) => c.isFree)!

type Feature = { label: string; meta?: string }

type Plan = {
  name: string
  price: string
  period: string
  description: string
  cta: () => JSX.Element
  features: Feature[]
}

const PLANS: Plan[] = [
  {
    name: 'Base',
    price: 'Free',
    period: 'forever',
    description: `The full ${FREE_COURSE.title} course: ${FREE_COURSE.description.charAt(0).toLowerCase()}${FREE_COURSE.description.slice(1)}`,
    cta: () => (
      <Button variant="outline" size="lg" href="/login">
        Start the free course
      </Button>
    ),
    features: [
      { label: FREE_COURSE.title, meta: `${plural(FREE_COURSE.lessonCount, 'lesson')} · ${formatLength(FREE_COURSE.minutes)}` },
      { label: 'Every lesson step in the course', meta: 'watch to bet' },
      { label: 'Calibration score', meta: 'for this course' },
    ],
  },
  {
    name: 'Subscription',
    price: '$24',
    period: 'per month, VAT included',
    description: 'Every course in the catalog, including the ones we release next.',
    cta: () => (
      <Button variant="primary" size="lg" href={SUBSCRIBE_HREF}>
        Subscribe →
      </Button>
    ),
    features: [
      { label: `All ${COURSES.length} courses`, meta: `${DOMAINS.length} domains · ${TOTAL_LESSONS} lessons` },
      { label: 'New courses as they ship' },
      { label: 'Calibration across every topic' },
      { label: 'Cancel anytime', meta: 'access runs to the end of the month' },
    ],
  },
]

export default function Pricing() {
  usePageTitle('Pricing')

  return (
    <main class={styles.page}>
      <section class={styles.intro}>
        <span class={styles.eyebrow}>pricing</span>
        <h1 class={styles.title}>One course free. Everything else for $24 a month.</h1>
        <p class={styles.lede}>
          Start with {FREE_COURSE.title} at no cost. Subscribe when you want the rest of the catalog:{' '}
          {COURSES.length - 1} more courses across distributed systems, databases, compilers, cryptography and
          inference.
        </p>
      </section>

      <section class={styles.plans}>
        <For each={PLANS}>
          {(plan) => (
            <div class={styles.plan}>
              <div class={styles.planHead}>
                <h2 class={styles.planName}>{plan.name}</h2>
              </div>
              <div class={styles.priceBlock}>
                <div class={styles.priceLine}>
                  <span class={styles.price}>{plan.price}</span>
                  <span class={styles.period}>{plan.period}</span>
                </div>
                <span class={styles.planDescription}>{plan.description}</span>
              </div>
              <div class={styles.cta}>{plan.cta()}</div>
              <ul class={styles.features}>
                <For each={plan.features}>
                  {(f) => (
                    <li class={styles.feature}>
                      <span class={styles.featureLabel}>{f.label}</span>
                      <span class={styles.featureMeta}>{f.meta}</span>
                    </li>
                  )}
                </For>
              </ul>
            </div>
          )}
        </For>
      </section>
    </main>
  )
}

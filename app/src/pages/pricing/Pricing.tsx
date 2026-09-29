import { A } from '@solidjs/router'
import { For, Show, type JSX } from 'solid-js'
import Button from '../../components/Button'
import CourseModal from '../../components/course-modal/CourseModal'
import { useCourseModal } from '../../components/course-modal/useCourseModal'
import Critter from '../../components/Critter'
import { COURSES, DOMAINS, TOTAL_LESSONS, domainDot, domainName, formatLength, plural } from '../../data/catalog'
import { usePageTitle } from '../../lib/title'
import styles from './Pricing.module.css'

const FREE_COURSE = COURSES.find((c) => c.isFree)!

type Feature = { label: string; meta?: string }

type Plan = {
  name: string
  art: () => JSX.Element
  price: string
  period: string
  description: string
  cta: () => JSX.Element
  features: Feature[]
}

const PLANS: Plan[] = [
  {
    name: 'Free',
    art: () => <Critter kind="die" hue={290} size={44} />,
    price: '$0',
    period: 'forever',
    description: `The full ${FREE_COURSE.title} course: ${FREE_COURSE.description.charAt(0).toLowerCase()}${FREE_COURSE.description.slice(1)}`,
    cta: () => (
      <Button variant="outline" size="lg">
        Start the free course
      </Button>
    ),
    features: [
      { label: FREE_COURSE.title, meta: `${plural(FREE_COURSE.lessonCount, 'lesson')} · ${formatLength(FREE_COURSE.minutes)}` },
      { label: 'Every lesson step in the course', meta: 'watch to bet' },
      { label: 'Calibration score', meta: 'for this course' },
      { label: 'Progress tracking' },
    ],
  },
  {
    name: 'Subscription',
    art: () => (
      <div class={styles.critterRow}>
        <For each={DOMAINS}>{(d) => <Critter kind={d.kind} hue={d.hue} size={30} />}</For>
      </div>
    ),
    price: '$24',
    period: 'per month',
    description: 'Every course in the catalog, including the ones we release next.',
    cta: () => (
      <Button variant="primary" size="lg">
        Subscribe →
      </Button>
    ),
    features: [
      { label: `All ${COURSES.length} courses`, meta: `${DOMAINS.length} domains · ${TOTAL_LESSONS} lessons` },
      { label: 'New courses as they ship' },
      { label: 'Calibration across every topic' },
      { label: 'Progress tracking' },
    ],
  },
]

export default function Pricing() {
  usePageTitle('Pricing')
  const modal = useCourseModal(() => COURSES)

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
                {plan.art()}
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
                      <span class={styles.plus} aria-hidden="true">
                        +
                      </span>
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

      <section class={styles.includes}>
        <div class={styles.includesHead}>
          <h2 class={styles.h2}>What the subscription includes</h2>
          <a href="/catalog" class={styles.more}>
            Full catalog →
          </a>
        </div>
        <div class={styles.courseList}>
          <For each={COURSES}>
            {(c) => (
              <A href={`/pricing?course=${c.id}`} noScroll class={styles.courseRow}>
                <span class={styles.dot} style={{ background: domainDot(c.domain) }} />
                <span class={styles.courseTitle}>{c.title}</span>
                <span class={styles.courseMeta}>
                  <Show when={c.isFree}>
                    <span class={styles.badge}>free</span>
                  </Show>
                  <span>
                    {c.lessonCount} lessons · {formatLength(c.minutes)}
                  </span>
                </span>
              </A>
            )}
          </For>
        </div>
      </section>

      <Show when={modal.course()}>
        {(course) => (
          <CourseModal
            course={course()}
            domainName={domainName(course().domain)}
            position={modal.position()}
            onClose={modal.close}
            onPrev={modal.prev}
            onNext={modal.next}
          />
        )}
      </Show>
    </main>
  )
}

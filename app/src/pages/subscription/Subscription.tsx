import { A } from '@solidjs/router'
import { For } from 'solid-js'
import Button from '../../components/Button'
import Critter from '../../components/Critter'
import { HOME } from '../../components/RouteGuards'
import { COURSES, DOMAINS } from '../../data/catalog'
import { usePageTitle } from '../../lib/title'
import { FREE_COURSE, FREE_DESCRIPTION, FREE_FEATURES, PERIOD, PRICE, SUBSCRIPTION_FEATURES, type Feature } from './plans'
import styles from './Subscription.module.css'

function Features(props: { items: Feature[] }) {
  return (
    <ul class={styles.features}>
      <For each={props.items}>
        {(f) => (
          <li class={styles.feature}>
            <span class={styles.featureLabel}>{f.label}</span>
            <span class={styles.featureMeta}>{f.meta}</span>
          </li>
        )}
      </For>
    </ul>
  )
}

/**
 * The member's plan. Billing doesn't exist yet, so every member is on the free
 * plan and the page shows the design's free state: the two plans side by side,
 * with Subscribe leading to the review before payment.
 */
export default function Subscription() {
  usePageTitle('Subscription')

  return (
    <main class={styles.page}>
      <section class={styles.head}>
        <div class={styles.headText}>
          <nav class={styles.crumbs} aria-label="Breadcrumb">
            <A href={HOME} class={styles.crumb}>
              home
            </A>
            <span aria-hidden="true">/</span>
            <span class={styles.here} aria-current="page">
              subscription
            </span>
          </nav>
          <h1 class={styles.title}>You’re on the free plan.</h1>
          <p class={styles.lede}>
            {FREE_COURSE.title} is fully open. Subscribe for the other {COURSES.length - 1} courses and everything we
            release next.
          </p>
        </div>
        <div class={styles.critters} aria-hidden="true">
          <For each={DOMAINS}>
            {(d) => <Critter kind={d.kind} hue={d.hue} size={44} mood={d.kind === 'die' ? 'happy' : 'asleep'} track={false} />}
          </For>
        </div>
      </section>

      <section class={styles.plans}>
        <div class={styles.plan}>
          <div class={styles.planHead}>
            <h2 class={styles.planName}>Base</h2>
            <Critter kind="die" hue={290} size={44} mood="happy" />
          </div>
          <div class={styles.priceBlock}>
            <div class={styles.priceLine}>
              <span class={styles.price}>Free</span>
              <span class={styles.period}>forever</span>
            </div>
            <span class={styles.planDescription}>{FREE_DESCRIPTION}</span>
          </div>
          <span class={styles.current}>Current plan</span>
          <Features items={FREE_FEATURES} />
        </div>

        <div class={styles.plan}>
          <div class={styles.planHead}>
            <h2 class={styles.planName}>Subscription</h2>
          </div>
          <div class={styles.priceBlock}>
            <div class={styles.priceLine}>
              <span class={styles.price}>{PRICE}</span>
              <span class={styles.period}>{PERIOD}</span>
            </div>
            <span class={styles.planDescription}>Every course in the catalog, including the ones we release next.</span>
          </div>
          <Button variant="primary" size="lg" href="/subscription/checkout" class={styles.subscribe}>
            Subscribe →
          </Button>
          <Features items={SUBSCRIPTION_FEATURES} />
        </div>
      </section>
    </main>
  )
}

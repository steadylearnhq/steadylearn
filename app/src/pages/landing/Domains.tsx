import { For } from 'solid-js'
import Critter from '../../components/Critter'
import { DOMAINS, coursesIn, plural } from '../../data/catalog'
import shared from './shared.module.css'
import styles from './Domains.module.css'

export default function Domains() {
  return (
    <section class={styles.section}>
      <div class={styles.heading}>
        <h2 class={shared.h2}>What you can learn</h2>
        <a href="/catalog" class={styles.more}>
          Full catalog →
        </a>
      </div>
      <div class={`${shared.bleedRules} ${styles.grid}`}>
        <For each={DOMAINS}>
          {(d) => {
            const courses = coursesIn(d.id)
            return (
              <a href={`/catalog?domain=${d.id}`} class={styles.domain}>
                <Critter kind={d.kind} hue={d.hue} size={44} />
                <div class={styles.title}>
                  <span class={styles.name}>{d.name}</span>
                  <span class={styles.count}>{plural(courses.length, 'course')}</span>
                </div>
                <span class={styles.sample}>
                  {courses
                    .slice(0, 2)
                    .map((c) => c.title)
                    .join(', ')}
                </span>
              </a>
            )
          }}
        </For>
      </div>
    </section>
  )
}

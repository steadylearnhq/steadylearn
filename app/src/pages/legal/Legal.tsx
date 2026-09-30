import { For } from 'solid-js'
import { usePageTitle } from '../../lib/title'
import styles from './Legal.module.css'

type Section = { title: string; body: string }

type LegalDoc = {
  /** Prefix for the section anchors, e.g. #terms-3. */
  id: string
  title: string
  lede: string
  updated: string
  sections: Section[]
}

const TERMS: LegalDoc = {
  id: 'terms',
  title: 'Terms & Conditions',
  lede: 'These terms govern your use of Steadylearn, including the website, the lessons and any paid subscription. By creating an account you agree to them.',
  updated: '1 September 2026',
  sections: [
    {
      title: 'Who we are',
      body: 'Steadylearn is an online learning service for working software engineers. In these terms, “we” and “us” mean the company that operates Steadylearn, and “you” means the person using it.',
    },
    {
      title: 'Your account',
      body: 'You need an account to start a course. Keep your login details private and tell us if you think someone else has used your account. You must be at least 16 years old to create one.',
    },
    {
      title: 'Base plan and subscription',
      body: 'The Base plan is free and includes the Estimation course. A subscription gives you access to every course in the catalog, including courses released while your subscription is active.',
    },
    {
      title: 'Billing and renewal',
      body: 'Subscriptions cost $24 per month, VAT included, and renew automatically each month on the day you subscribed. We charge the payment method on your account. If a payment fails, we will try again and may pause access until it succeeds.',
    },
    {
      title: 'Cancellation and refunds',
      body: 'You can cancel at any time from your profile. Access continues until the end of the period you have paid for. If you cancel within 14 days of your first payment, you can ask for a full refund.',
    },
    {
      title: 'Acceptable use',
      body: 'Do not share your account, resell access, copy or redistribute lesson material, or try to interfere with the service. We may suspend accounts that break these rules.',
    },
    {
      title: 'Our content',
      body: 'Lessons, videos, exercises, diagrams and text on Steadylearn belong to us or our licensors. Your subscription gives you a personal, non-transferable licence to use them for your own learning.',
    },
    {
      title: 'Your content',
      body: 'Notes, bets and answers you enter remain yours. You give us permission to store and process them so we can run the service, show your progress and calculate your calibration score.',
    },
    {
      title: 'Changes to the service',
      body: 'We add and revise courses regularly and may retire content that is out of date. If we make a change that materially reduces what a subscription includes, we will tell you in advance.',
    },
    {
      title: 'Liability',
      body: 'Steadylearn is provided for educational purposes. We are not liable for indirect or consequential losses. Nothing in these terms limits liability that cannot be limited by law.',
    },
    {
      title: 'Changes to these terms',
      body: 'We may update these terms. If the changes are significant, we will email you at least 30 days before they take effect.',
    },
    { title: 'Contact', body: 'Questions about these terms can be sent to legal@steadylearn.com.' },
  ],
}

const PRIVACY: LegalDoc = {
  id: 'privacy',
  title: 'Privacy Policy',
  lede: 'This policy explains what personal data Steadylearn collects, why we collect it, and the choices you have.',
  updated: '1 September 2026',
  sections: [
    {
      title: 'What this covers',
      body: 'This policy applies to the Steadylearn website and apps, and to any communication you have with us.',
    },
    {
      title: 'Data we collect',
      body: 'Account details such as your name and email address. Learning activity: lessons started and completed, answers, bets and calibration results. Billing details, which are handled by our payment provider; we only see the last four digits of your card. Technical data such as device type, browser and approximate location.',
    },
    {
      title: 'How we use it',
      body: 'To run your account and courses, track your progress, calculate your calibration score, process payments, send service emails, and improve lessons based on where learners get stuck.',
    },
    {
      title: 'Legal basis',
      body: 'We process your data to perform our contract with you, to meet legal obligations such as tax records, and for our legitimate interest in improving the service. Where we rely on consent, for example marketing email, you can withdraw it at any time.',
    },
    {
      title: 'Sharing',
      body: 'We do not sell personal data. We share it only with providers who help us run Steadylearn, such as hosting, payments and email delivery, under contracts that limit how they can use it.',
    },
    {
      title: 'Retention',
      body: 'We keep account and learning data while your account is open. If you delete your account, we remove it within 30 days, except billing records we must keep for tax purposes.',
    },
    {
      title: 'Your rights',
      body: 'You can access, correct, export or delete your data from your profile, or by contacting us. You can also object to certain processing and complain to your local data protection authority.',
    },
    {
      title: 'Cookies',
      body: 'We use essential cookies to keep you logged in and remember your theme. We use privacy-friendly analytics without advertising cookies.',
    },
    {
      title: 'International transfers',
      body: 'Some providers process data outside your country. When they do, we rely on appropriate safeguards such as standard contractual clauses.',
    },
    {
      title: 'Changes to this policy',
      body: 'We will post any changes here and email you if they are significant.',
    },
    { title: 'Contact', body: 'Send privacy questions or requests to privacy@steadylearn.com.' },
  ],
}

const number = (i: number) => String(i + 1).padStart(2, '0')

function LegalPage(props: { doc: LegalDoc }) {
  usePageTitle(props.doc.title)
  const anchor = (i: number) => `${props.doc.id}-${i + 1}`

  return (
    <main class={styles.page}>
      <section class={styles.intro}>
        <span class={styles.eyebrow}>legal</span>
        <h1 class={styles.title}>{props.doc.title}</h1>
        <p class={styles.lede}>{props.doc.lede}</p>
        <span class={styles.updated}>Last updated {props.doc.updated}</span>
      </section>
      <section class={styles.body}>
        <nav class={styles.toc} aria-label="Sections">
          <For each={props.doc.sections}>
            {(s, i) => (
              <a href={`#${anchor(i())}`} class={styles.tocItem}>
                <span class={styles.num}>{number(i())}</span>
                {s.title}
              </a>
            )}
          </For>
        </nav>
        <div class={styles.sections}>
          <For each={props.doc.sections}>
            {(s, i) => (
              <section id={anchor(i())} class={styles.section}>
                <span class={styles.sectionNum}>{number(i())}</span>
                <div class={styles.sectionText}>
                  <h2 class={styles.h2}>{s.title}</h2>
                  <p class={styles.p}>{s.body}</p>
                </div>
              </section>
            )}
          </For>
        </div>
      </section>
    </main>
  )
}

export const Terms = () => <LegalPage doc={TERMS} />

export const Privacy = () => <LegalPage doc={PRIVACY} />

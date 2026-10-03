import { COURSES, DOMAINS, TOTAL_LESSONS, formatLength, plural } from '../../data/catalog'

export const FREE_COURSE = COURSES.find((c) => c.isFree)!

export type Feature = { label: string; meta?: string }

export const PRICE = '$24'
export const PERIOD = 'per month, VAT included'
/** What each month's charge comes to, as a payment row writes it. */
export const CHARGE = '$24.00'

export const FREE_DESCRIPTION = `The full ${FREE_COURSE.title} course: ${FREE_COURSE.description.charAt(0).toLowerCase()}${FREE_COURSE.description.slice(1)}`

export const FREE_FEATURES: Feature[] = [
  { label: FREE_COURSE.title, meta: `${plural(FREE_COURSE.lessonCount, 'lesson')} · ${formatLength(FREE_COURSE.minutes)}` },
  { label: 'Every lesson step in the course', meta: 'watch to bet' },
  { label: 'Calibration score', meta: 'for this course' },
]

/** What a subscription gives, on the Subscription page and again when reviewing it before payment. */
export const SUBSCRIPTION_FEATURES: Feature[] = [
  { label: `All ${COURSES.length} courses`, meta: `${DOMAINS.length} domains · ${TOTAL_LESSONS} lessons` },
  { label: 'New courses as they ship' },
  { label: 'Calibration across every topic' },
  { label: 'Cancel anytime', meta: 'access runs to the end of the month' },
]

import Placeholder from './Placeholder'
import styles from './PlaceholderLab.module.css'

/** The lab drawn until a real one is registered for its key. */
export default function PlaceholderLab() {
  return <Placeholder label="Interactive" class={styles.lab} />
}

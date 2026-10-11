import styles from './Placeholder.module.css'

type PlaceholderProps = {
  /** What will stand here, named in the middle of the box. */
  label: string
  /** Sizes the box: each stage gives it the room its real content will take. */
  class?: string
}

/** A striped, labelled box holding the place of content that doesn't exist yet. */
export default function Placeholder(props: PlaceholderProps) {
  return (
    <div class={`${styles.box} ${props.class ?? ''}`}>
      <span class={styles.label}>{props.label}</span>
    </div>
  )
}

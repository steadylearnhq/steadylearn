import styles from './Logo.module.css'

export default function Logo(props: { size?: 'md' | 'sm'; class?: string }) {
  return (
    <a href="/" class={`${styles.logo} ${props.size === 'sm' ? styles.sm : ''} ${props.class ?? ''}`} aria-label="Steadylearn home">
      steadylearn<span class={styles.dot}>.</span>
    </a>
  )
}

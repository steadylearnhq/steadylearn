import { splitProps, type JSX } from 'solid-js'
import { Dynamic } from 'solid-js/web'
import styles from './Button.module.css'

/** `danger` and `dangerOutline` are for a step that ends something, such as cancelling a subscription. */
type Variant = 'primary' | 'outline' | 'ghost' | 'danger' | 'dangerOutline'
/** `xs` is the compact button of a settings row. */
type Size = 'xs' | 'sm' | 'md' | 'lg'

type ButtonProps = {
  variant?: Variant
  size?: Size
  /** Renders an anchor instead of a button. */
  href?: string
} & JSX.ButtonHTMLAttributes<HTMLButtonElement> &
  JSX.AnchorHTMLAttributes<HTMLAnchorElement>

export default function Button(props: ButtonProps) {
  const [local, rest] = splitProps(props, ['variant', 'size', 'class', 'href'])
  const className = () =>
    [styles.button, styles[local.variant ?? 'primary'], styles[local.size ?? 'md'], local.class]
      .filter(Boolean)
      .join(' ')

  return (
    <Dynamic
      component={local.href ? 'a' : 'button'}
      href={local.href}
      type={local.href ? undefined : (rest.type ?? 'button')}
      class={className()}
      {...rest}
    />
  )
}

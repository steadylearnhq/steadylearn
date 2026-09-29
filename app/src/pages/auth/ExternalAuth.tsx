import { useNavigate } from '@solidjs/router'
import { fetchAuthSession } from 'aws-amplify/auth'
import { onMount } from 'solid-js'
import Critter from '../../components/Critter'
import { HOME } from '../../components/RouteGuards'
import { usePageTitle } from '../../lib/title'
import styles from './Auth.module.css'

/**
 * Where Cognito's hosted UI lands after "Continue with Google". The OAuth
 * listener in lib/auth trades the code in the URL for tokens; fetchAuthSession
 * waits for that exchange, so awaiting it once tells us whether it worked.
 * The hosted UI round trip drops ?redirect=, so this always lands on the dashboard.
 */
export default function ExternalAuth() {
  usePageTitle('Signing in')
  const navigate = useNavigate()

  onMount(() => {
    fetchAuthSession()
      .then((session) => navigate(session.tokens ? HOME : '/login', { replace: true }))
      .catch(() => navigate('/login', { replace: true }))
  })

  return (
    <div class={styles.page}>
      <main class={styles.main}>
        <div class={styles.card}>
          <div class={styles.waiting} role="status">
            <Critter kind="circle" hue={255} size={56} mood="asleep" fill="oklch(0.83 0.11 255)" />
            <p>Signing you in…</p>
          </div>
        </div>
      </main>
    </div>
  )
}

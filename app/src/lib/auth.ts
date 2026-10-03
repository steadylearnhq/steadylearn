import 'aws-amplify/auth/enable-oauth-listener'
import { Amplify } from 'aws-amplify'
import { fetchAuthSession, signOut as amplifySignOut } from 'aws-amplify/auth'
import { cognitoUserPoolsTokenProvider } from 'aws-amplify/auth/cognito'
import { CookieStorage, Hub } from 'aws-amplify/utils'
import { createRoot, createSignal } from 'solid-js'

const list = (value?: string) =>
  (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

// Runs on import, so index.tsx pulls this in before anything renders. The OAuth
// listener imported above picks up the code Cognito's hosted UI sends back to
// /external-auth and trades it for tokens.
Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: import.meta.env.VITE_USER_POOL_ID,
      userPoolClientId: import.meta.env.VITE_USER_POOL_CLIENT_ID,
      loginWith: {
        email: true,
        oauth: {
          domain: import.meta.env.VITE_USER_POOL_DOMAIN,
          scopes: ['email', 'openid', 'profile', 'aws.cognito.signin.user.admin'],
          redirectSignIn: list(import.meta.env.VITE_COGNITO_OAUTH_REDIRECT_SIGN_IN),
          redirectSignOut: list(import.meta.env.VITE_COGNITO_OAUTH_REDIRECT_SIGN_OUT),
          responseType: 'code',
        },
      },
    },
  },
})

// Tokens live in cookies rather than localStorage. Secure is only set over
// https: Safari refuses Secure cookies on http://localhost, which would leave
// local sessions unable to persist.
cognitoUserPoolsTokenProvider.setKeyValueStorage(
  new CookieStorage({ sameSite: 'lax', secure: window.location.protocol === 'https:' }),
)

export type User = { id: string; email: string; name: string }

// A single app-wide session signal, read off the id token so it needs no extra
// round trip. `ready` stays false until the first check settles, so the header
// doesn't flash "Log in" at someone who is already signed in.
const store = createRoot(() => {
  const [user, setUser] = createSignal<User | null>(null)
  const [ready, setReady] = createSignal(false)

  const refresh = async () => {
    try {
      const claims = (await fetchAuthSession()).tokens?.idToken?.payload
      const email = typeof claims?.email === 'string' ? claims.email : ''
      const name = typeof claims?.name === 'string' ? claims.name : ''
      setUser(claims?.sub ? { id: claims.sub, email, name: name || email } : null)
    } catch {
      setUser(null)
    }
    setReady(true)
  }

  Hub.listen('auth', ({ payload }) => {
    switch (payload.event) {
      case 'signedIn':
      case 'signInWithRedirect':
        void refresh()
        break
      case 'signedOut':
      case 'tokenRefresh_failure':
        setUser(null)
        break
    }
  })

  void refresh()

  return { user, ready }
})

export const user = store.user
export const authReady = store.ready
export const signOut = () => amplifySignOut()

/** The signed-in member's id and access token for the API, refreshed by Amplify when it has expired; undefined when signed out. */
export async function session(): Promise<{ userId: string; token: string } | undefined> {
  try {
    const token = (await fetchAuthSession()).tokens?.accessToken
    const sub = token?.payload.sub
    return token && sub ? { userId: sub, token: token.toString() } : undefined
  } catch {
    return undefined
  }
}

/** The session's access token for the API; undefined when signed out. */
export const accessToken = async () => (await session())?.token

// Cognito's hosted UI round trip drops ?redirect=, so "Continue with Google"
// keeps it here and /external-auth reads it back once.
const REDIRECT_KEY = 'sl-redirect'

/** Keeps where to go after the hosted-UI sign-in, for /external-auth. */
export function rememberRedirect(path: string) {
  try {
    sessionStorage.setItem(REDIRECT_KEY, path)
  } catch {
    // Storage can be unavailable; the member then lands on the dashboard.
  }
}

/** Where to go after the hosted-UI sign-in, if a page asked; it is forgotten once read. */
export function takeRememberedRedirect(): string | undefined {
  try {
    const path = sessionStorage.getItem(REDIRECT_KEY)
    sessionStorage.removeItem(REDIRECT_KEY)
    return path ?? undefined
  } catch {
    return undefined
  }
}

// Amplify throws plain Errors whose `name` is the Cognito exception. The
// message is AWS prose, so it is matched on the name and reworded here.
const MESSAGES: Record<string, string> = {
  // A pool with "prevent user existence errors" never sends UserNotFound, and
  // answering differently when it does would reveal which emails are registered.
  NotAuthorizedException: 'That email and password don’t match.',
  UserNotFoundException: 'That email and password don’t match.',
  UsernameExistsException: 'There’s already an account for that email. Try logging in.',
  InvalidPasswordException: 'That password doesn’t meet the requirements. Try a longer one with a number and a symbol.',
  InvalidParameterException: 'Something in the form isn’t valid. Check it and try again.',
  CodeMismatchException: 'That code isn’t right. Check the email and try again.',
  ExpiredCodeException: 'That code has expired. Send a new one.',
  LimitExceededException: 'Too many attempts. Wait a few minutes and try again.',
  TooManyRequestsException: 'Too many attempts. Wait a few minutes and try again.',
  TooManyFailedAttemptsException: 'Too many attempts. Wait a few minutes and try again.',
  CodeDeliveryFailureException: 'We couldn’t send the email. Check the address and try again.',
}

export const errorName = (error: unknown) => (error instanceof Error ? error.name : '')

export const authMessage = (error: unknown) =>
  MESSAGES[errorName(error)] ?? 'Something went wrong. Please try again.'

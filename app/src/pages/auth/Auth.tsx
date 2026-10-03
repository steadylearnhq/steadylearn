import { A, useLocation, useSearchParams } from '@solidjs/router'
import {
  autoSignIn,
  confirmResetPassword,
  confirmSignUp,
  resendSignUpCode,
  resetPassword,
  signIn,
  signInWithRedirect,
  signUp,
} from 'aws-amplify/auth'
import { createEffect, createSignal, on, onCleanup, onMount, Show } from 'solid-js'
import Button from '../../components/Button'
import Critter from '../../components/Critter'
import { HOME, safeRedirect } from '../../components/RouteGuards'
import { authMessage, errorName, rememberRedirect, user } from '../../lib/auth'
import { theme, toggleTheme } from '../../lib/theme'
import { usePageTitle } from '../../lib/title'
import styles from './Auth.module.css'

type Mode = 'login' | 'signup'
/** `confirm` takes the sign-up code Cognito emails; `reset` takes a reset code and a new password. */
type Step = 'form' | 'confirm' | 'reset'

const MIN_PASSWORD = 8
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const motionOk = () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches

export default function Auth() {
  const location = useLocation()
  const mode = (): Mode => (location.pathname.startsWith('/signup') ? 'signup' : 'login')
  const isLogin = () => mode() === 'login'
  // Set by RequireAuth when a signed-out visitor hits a members-only page.
  const [params] = useSearchParams<{ redirect?: string }>()
  const next = () => safeRedirect(params.redirect, HOME)
  // Switching between log in and sign up keeps where to go after.
  const otherMode = () => {
    const path = isLogin() ? '/signup' : '/login'
    return params.redirect ? `${path}?redirect=${encodeURIComponent(params.redirect)}` : path
  }

  const [step, setStep] = createSignal<Step>('form')
  // Whether the password field is choosing a new password rather than checking one.
  const newPw = () => (step() === 'form' ? !isLogin() : step() === 'reset')

  usePageTitle(() =>
    step() === 'confirm' ? 'Confirm your email' : step() === 'reset' ? 'Reset password' : isLogin() ? 'Log in' : 'Sign up',
  )

  const [name, setName] = createSignal('')
  const [email, setEmail] = createSignal('')
  const [password, setPassword] = createSignal('')
  const [password2, setPassword2] = createSignal('')
  const [code, setCode] = createSignal('')
  const [show, setShow] = createSignal(false)
  const [pwFocus, setPwFocus] = createSignal(false)
  const [tried, setTried] = createSignal(false)
  const [loading, setLoading] = createSignal(false)
  const [done, setDone] = createSignal<Mode | null>(null)
  const [notice, setNotice] = createSignal('')
  const [failure, setFailure] = createSignal('')
  const [blink, setBlink] = createSignal(false)

  // Switching between log in and sign up keeps name and email, drops the rest.
  createEffect(
    on(
      mode,
      () => {
        setStep('form')
        setTried(false)
        setNotice('')
        setFailure('')
        setPassword('')
        setPassword2('')
        setCode('')
      },
      { defer: true },
    ),
  )

  const emailOk = () => EMAIL_RE.test(email().trim())
  const emailErr = () =>
    !tried() ? '' : !email().trim() ? 'Enter your email.' : !emailOk() ? 'That doesn’t look like an email address.' : ''
  const pwErr = () =>
    !tried()
      ? ''
      : !password()
        ? 'Enter a password.'
        : newPw() && password().length < MIN_PASSWORD
          ? `Use at least ${MIN_PASSWORD} characters.`
          : ''
  const nameErr = () => (tried() && !isLogin() && !name().trim() ? 'Enter your name.' : '')
  const codeErr = () => (tried() && !code().trim() ? 'Enter the code from the email.' : '')
  const pw2Err = () =>
    tried() && !isLogin() && !pwErr() && password2() !== password()
      ? password2()
        ? 'Passwords don’t match.'
        : 'Repeat your password.'
      : ''

  // The critter closes its eyes while you type a hidden password, and blinks now and then.
  const mood = () => ((pwFocus() && !show()) || blink() ? 'asleep' : 'awake')

  onMount(() => {
    let timer: number
    const tick = () => {
      timer = window.setTimeout(() => {
        if (motionOk()) {
          setBlink(true)
          window.setTimeout(() => setBlink(false), 140)
        }
        tick()
      }, 2600 + Math.random() * 2600)
    }
    tick()
    onCleanup(() => clearTimeout(timer))
  })

  let mascot: HTMLDivElement | undefined
  let hop: Animation | undefined
  onCleanup(() => hop?.cancel())

  const mascotRef = (el: HTMLDivElement) => {
    mascot = el
    if (!motionOk()) return
    el.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-5px)' }, { transform: 'translateY(0)' }], {
      duration: 2600,
      iterations: Infinity,
      easing: 'ease-in-out',
      composite: 'add',
    })
  }

  const celebrateRef = (el: HTMLDivElement) => {
    if (!motionOk()) return
    el.animate(
      [
        { transform: 'translateY(0) scale(1,1)' },
        { transform: 'translateY(0) scale(1.12,.86)', offset: 0.2 },
        { transform: 'translateY(-22px) scale(.94,1.08)', offset: 0.5 },
        { transform: 'translateY(0) scale(1.08,.92)', offset: 0.8 },
        { transform: 'translateY(0) scale(1,1)' },
      ],
      { duration: 700, iterations: 2, easing: 'ease-out' },
    )
  }

  const shake = () => {
    if (!mascot || !motionOk()) return
    mascot.animate(
      [0, -7, 6, -4, 3, 0].map((x) => ({ transform: `translateX(${x}px) rotate(${x * 0.6}deg)` })),
      { duration: 420, easing: 'ease-out', composite: 'add' },
    )
  }

  // Runs one Cognito request with the mascot hopping. A thrown error becomes the
  // message above the submit button; anything else is up to `task`.
  const run = async (task: () => Promise<unknown>) => {
    setLoading(true)
    setNotice('')
    setFailure('')
    if (mascot && motionOk()) {
      hop = mascot.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-10px)' }, { transform: 'translateY(0)' }], {
        duration: 360,
        iterations: Infinity,
        easing: 'ease-in-out',
        composite: 'add',
      })
    }
    try {
      await task()
    } catch (error) {
      // Signed in in another tab while this one sat open: nothing is wrong.
      if (errorName(error) === 'UserAlreadyAuthenticatedException') setDone('login')
      else {
        setFailure(authMessage(error))
        shake()
      }
    } finally {
      hop?.cancel()
      setLoading(false)
    }
  }

  const username = () => email().trim()

  const goTo = (next: Step, message: string) => {
    setStep(next)
    setTried(false)
    setCode('')
    setNotice(message)
  }

  // Cognito doesn't email a code when an unconfirmed account tries to log in, so ask for one.
  const toConfirm = async () => {
    await resendSignUpCode({ username: username() })
    goTo('confirm', '')
  }

  const toReset = async () => {
    await resetPassword({ username: username() })
    setPassword('')
    goTo('reset', '')
  }

  const logIn = async () => {
    const { isSignedIn, nextStep } = await signIn({ username: username(), password: password() })
    if (isSignedIn) return setDone('login')
    if (nextStep.signInStep === 'CONFIRM_SIGN_UP') return toConfirm()
    if (nextStep.signInStep === 'RESET_PASSWORD') return toReset()
    // MFA or a forced password change: the pool isn't set up for either, so there is no screen for them.
    setFailure('This account needs a sign-in step we don’t support yet.')
  }

  const register = async () => {
    const { nextStep } = await signUp({
      username: username(),
      password: password(),
      options: { userAttributes: { email: username(), name: name().trim() }, autoSignIn: true },
    })
    if (nextStep.signUpStep === 'CONFIRM_SIGN_UP') return goTo('confirm', '')
    if (nextStep.signUpStep === 'COMPLETE_AUTO_SIGN_IN') await autoSignIn()
    else await signIn({ username: username(), password: password() })
    setDone('signup')
  }

  const confirm = async () => {
    const { nextStep } = await confirmSignUp({ username: username(), confirmationCode: code().trim() })
    // Sign-up arms auto sign-in; an unconfirmed login attempt doesn't, but its password is still here.
    if (nextStep.signUpStep === 'COMPLETE_AUTO_SIGN_IN') await autoSignIn()
    else await signIn({ username: username(), password: password() })
    setDone('signup')
  }

  const saveNewPassword = async () => {
    await confirmResetPassword({ username: username(), confirmationCode: code().trim(), newPassword: password() })
    await logIn()
  }

  const submit = (e: SubmitEvent) => {
    e.preventDefault()
    if (loading()) return
    const ok =
      step() === 'confirm'
        ? code().trim()
        : step() === 'reset'
          ? code().trim() && password().length >= MIN_PASSWORD
          : emailOk() &&
            password() &&
            (isLogin() || (name().trim() && password().length >= MIN_PASSWORD && password2() === password()))
    if (!ok) {
      shake()
      setTried(true)
      return
    }
    void run(step() === 'confirm' ? confirm : step() === 'reset' ? saveNewPassword : isLogin() ? logIn : register)
  }

  // The browser leaves for Cognito's hosted UI and comes back to /external-auth.
  const google = () =>
    !loading() &&
    run(() => {
      if (params.redirect) rememberRedirect(next())
      return signInWithRedirect({ provider: 'Google' })
    })

  const forgot = () => {
    if (!emailOk()) {
      setFailure('')
      setNotice('Enter your email above and we’ll send a reset code.')
      return
    }
    void run(toReset)
  }

  const resend = () =>
    run(async () => {
      if (step() === 'reset') await resetPassword({ username: username() })
      else await resendSignUpCode({ username: username() })
      setNotice('A new code is on its way.')
    })

  const back = () => {
    goTo('form', '')
    setFailure('')
    setPassword('')
    setPassword2('')
  }

  const reset = () => {
    setDone(null)
    back()
  }

  const firstName = () => user()?.name.split(' ')[0]

  const doneCopy = () =>
    ({
      login: [
        firstName() ? `Welcome back, ${firstName()}.` : 'Welcome back.',
        'Picking up where you left off: 2.3 Sizing replicated storage.',
        'Resume lesson →',
      ],
      signup: ['You’re in.', 'Your email is confirmed. You can start your first lesson now.', 'Start first lesson →'],
    })[done() ?? 'login']

  const fieldClass = (err: string) => (err ? `${styles.input} ${styles.invalid}` : styles.input)

  return (
    <div class={styles.page}>
      <button type="button" class={styles.themeToggle} onClick={toggleTheme}>
        <span class={styles.themeIcon} aria-hidden="true" />
        {theme() === 'dark' ? 'Light' : 'Dark'}
        <span class="visually-hidden"> theme</span>
      </button>

      <main class={styles.main}>
        <div class={styles.card}>
          <Show
            when={done()}
            fallback={
              <>
                <div ref={mascotRef} class={styles.mascot}>
                  <Critter kind="circle" hue={255} size={56} mood={mood()} fill="oklch(0.83 0.11 255)" />
                </div>
                <h1 class={styles.title}>
                  <Show
                    when={step() === 'form'}
                    fallback={step() === 'confirm' ? 'Check your email' : 'Set a new password'}
                  >
                    {isLogin() ? 'Log in to' : 'Sign up for'} steadylearn
                  </Show>
                  <span class={styles.dot}>.</span>
                </h1>
                <p class={styles.subtitle}>
                  {step() === 'confirm'
                    ? `We sent a code to ${username()}. Enter it to confirm your account.`
                    : step() === 'reset'
                      ? `If there’s an account for ${username()}, we sent it a code. Enter it with your new password.`
                      : isLogin()
                        ? 'Pick up your lessons where you left them.'
                        : 'Free to start. Your first lesson takes fifteen minutes.'}
                </p>

                <Show when={step() === 'form' && isLogin()} fallback={<span class={styles.gap} />}>
                  <button type="button" class={styles.google} onClick={google}>
                    <GoogleIcon />
                    Continue with Google
                  </button>
                  <div class={styles.divider}>
                    <span />
                    <span class="mono">or with email</span>
                    <span />
                  </div>
                </Show>

                <form class={styles.form} onSubmit={submit} noValidate>
                  <Show when={step() === 'form' && !isLogin()}>
                    <label class={styles.field}>
                      <span class={styles.label}>Name</span>
                      <input
                        type="text"
                        autocomplete="name"
                        placeholder="Mara Kovač"
                        class={fieldClass(nameErr())}
                        value={name()}
                        onInput={(e) => setName(e.currentTarget.value)}
                        aria-invalid={!!nameErr()}
                        aria-describedby="auth-name-err"
                      />
                      <Show when={nameErr()}>
                        <span id="auth-name-err" class={styles.error}>
                          {nameErr()}
                        </span>
                      </Show>
                    </label>
                  </Show>

                  <Show when={step() === 'form'}>
                  <label class={styles.field}>
                    <span class={styles.label}>Email</span>
                    <input
                      type="email"
                      autocomplete="email"
                      placeholder="you@company.com"
                      class={fieldClass(emailErr())}
                      value={email()}
                      onInput={(e) => setEmail(e.currentTarget.value)}
                      aria-invalid={!!emailErr()}
                      aria-describedby="auth-email-err"
                    />
                    <Show when={emailErr()}>
                      <span id="auth-email-err" class={styles.error}>
                        {emailErr()}
                      </span>
                    </Show>
                  </label>
                  </Show>

                  <Show when={step() !== 'form'}>
                    <label class={styles.field}>
                      <span class={styles.label}>Code</span>
                      <input
                        type="text"
                        inputmode="numeric"
                        autocomplete="one-time-code"
                        placeholder="123456"
                        class={fieldClass(codeErr())}
                        value={code()}
                        onInput={(e) => setCode(e.currentTarget.value)}
                        aria-invalid={!!codeErr()}
                        aria-describedby="auth-code-err"
                      />
                      <Show when={codeErr()}>
                        <span id="auth-code-err" class={styles.error}>
                          {codeErr()}
                        </span>
                      </Show>
                    </label>
                  </Show>

                  <Show when={step() !== 'confirm'}>
                  <div class={styles.field}>
                    <span class={styles.labelRow}>
                      <label for="auth-password" class={styles.label}>
                        {step() === 'reset' ? 'New password' : 'Password'}
                      </label>
                      <Show when={step() === 'form' && isLogin()}>
                        <button type="button" class={styles.forgot} onClick={forgot}>
                          Forgot password?
                        </button>
                      </Show>
                    </span>
                    <span class={styles.passwordWrap}>
                      <input
                        id="auth-password"
                        type={show() ? 'text' : 'password'}
                        autocomplete={newPw() ? 'new-password' : 'current-password'}
                        placeholder={newPw() ? `At least ${MIN_PASSWORD} characters` : 'Your password'}
                        class={`${fieldClass(pwErr())} ${styles.passwordInput}`}
                        value={password()}
                        onInput={(e) => setPassword(e.currentTarget.value)}
                        onFocus={() => setPwFocus(true)}
                        onBlur={() => setPwFocus(false)}
                        aria-invalid={!!pwErr()}
                        aria-describedby="auth-pw-err auth-pw-hint"
                      />
                      <button
                        type="button"
                        class={`${styles.showToggle} mono`}
                        onClick={() => setShow(!show())}
                        aria-pressed={show()}
                        aria-label={show() ? 'Hide password' : 'Show password'}
                      >
                        {show() ? 'hide' : 'show'}
                      </button>
                    </span>
                    <Show when={pwErr()}>
                      <span id="auth-pw-err" class={styles.error}>
                        {pwErr()}
                      </span>
                    </Show>
                    <Show when={newPw() && !pwErr() && password().length > 0}>
                      <span
                        id="auth-pw-hint"
                        class={`${styles.hint} mono`}
                        classList={{ [styles.hintOk]: password().length >= MIN_PASSWORD }}
                      >
                        {password().length >= MIN_PASSWORD
                          ? `✓ ${password().length} characters`
                          : `${password().length} / ${MIN_PASSWORD} characters`}
                      </span>
                    </Show>
                  </div>
                  </Show>

                  <Show when={step() === 'form' && !isLogin()}>
                    <label class={styles.field}>
                      <span class={styles.label}>Repeat password</span>
                      <input
                        type={show() ? 'text' : 'password'}
                        autocomplete="new-password"
                        placeholder="Same as above"
                        class={fieldClass(pw2Err())}
                        value={password2()}
                        onInput={(e) => setPassword2(e.currentTarget.value)}
                        onFocus={() => setPwFocus(true)}
                        onBlur={() => setPwFocus(false)}
                        aria-invalid={!!pw2Err()}
                        aria-describedby="auth-pw2-err"
                      />
                      <Show when={pw2Err()}>
                        <span id="auth-pw2-err" class={styles.error}>
                          {pw2Err()}
                        </span>
                      </Show>
                    </label>
                  </Show>

                  <Show when={notice()}>
                    <span class={styles.notice} role="status">
                      {notice()}
                    </span>
                  </Show>

                  <Show when={failure()}>
                    <span class={styles.error} role="alert">
                      {failure()}
                    </span>
                  </Show>

                  <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    class={loading() ? `${styles.submit} ${styles.loading}` : styles.submit}
                    aria-disabled={loading()}
                  >
                    {step() === 'confirm'
                      ? loading()
                        ? 'Confirming…'
                        : 'Confirm email'
                      : step() === 'reset'
                        ? loading()
                          ? 'Saving…'
                          : 'Save and log in'
                        : loading()
                          ? isLogin()
                            ? 'Logging in…'
                            : 'Creating account…'
                          : isLogin()
                            ? 'Log in'
                            : 'Create account'}
                  </Button>
                </form>

                <Show
                  when={step() === 'form'}
                  fallback={
                    <p class={styles.switch}>
                      Didn’t get it?
                      <button type="button" class={styles.linkButton} onClick={() => !loading() && resend()}>
                        Send a new code
                      </button>
                      <span class={styles.spacer} />
                      <button type="button" class={styles.linkButton} onClick={back}>
                        ← Back
                      </button>
                    </p>
                  }
                >
                  <p class={styles.switch}>
                    {isLogin() ? 'New to steadylearn?' : 'Already have an account?'}
                    <A href={otherMode()}>{isLogin() ? 'Create an account' : 'Log in'}</A>
                  </p>
                </Show>

                <Show when={step() === 'form' && !isLogin()}>
                  <p class={styles.legal}>
                    By creating an account you agree to the <a href="#">Terms</a> and <a href="#">Privacy Policy</a>.
                  </p>
                </Show>
              </>
            }
          >
            <div ref={celebrateRef} class={styles.mascot}>
              <Critter kind="circle" hue={255} size={56} mood="happy" />
            </div>
            <span class={styles.wordmark}>
              steadylearn<span class={styles.dot}>.</span>
            </span>
            <h1 class={`${styles.title} ${styles.doneTitle}`}>{doneCopy()[0]}</h1>
            <p class={styles.subtitle}>{doneCopy()[1]}</p>
            <div class={styles.doneActions}>
              <Button variant="primary" size="lg" href={next()}>
                {next().startsWith('/subscription') ? 'Continue to checkout →' : doneCopy()[2]}
              </Button>
              <Button variant="outline" size="lg" onClick={reset}>
                Back
              </Button>
            </div>
          </Show>
        </div>
      </main>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}

---
name: feature-flags
description: How to put a change behind a Statsig feature gate or dynamic config in steadylearn, in the Go API (`services.Gate` / `services.Config` with `controllers.FlagUser`) and the Solid app (`gate` / `config` from `src/lib/statsig.ts`), from creating the flag to removing it once it has rolled out. Use whenever a task says feature flag, feature gate, kill switch, gradual rollout, "hide this behind a flag", "turn it on only for…" or dynamic config. For A/B tests with groups and exposures, use the `ab-experiments` skill.
---

# Feature flags

A **feature gate** is on or off for a user. A **dynamic config** hands a user a
set of values (copy, limits, URLs) that can change without a deploy. Both live
in Statsig and are read through one module on each side, which handles
consent, identity and the case where Statsig is off.

## Rules that are easy to break

- **The default is what ships today.** With no keys, a Statsig outage, or a
  caller who can't be bucketed, every read returns its default: a gate reads
  `false`, a config read returns the `def` you pass. Write the gated path as
  the new behaviour and the default as the current one. Production has no
  Statsig keys yet, so there everything reads its default whatever the
  rules say.
- **Read flags only through the wrappers**: `src/services/flags.go` in the API
  and `src/lib/statsig.ts` in the app. Never import the SDKs directly.
- **Consent.** Flags are evaluated with or without analytics consent. Without
  it, the app stores and logs nothing and doesn't send its stableID to the API,
  so to the API a signed-out visitor without consent has no id and gets the
  defaults.
- **No shared caches.** A response that depends on a flag must not be shared
  between users: not behind `Cache-Control: public` (the visitor's catalog and
  course use it) and not in a Redis key that leaves out the user or the flag's
  value. Otherwise one user's result gets served to everyone.

## 1. Create the flag in Statsig

Name it in lowercase with underscores (`new_checkout`); the name is its id in
code. Create it in the Statsig console, or from the terminal with Statsig's
CLI, `siggy` (`npm i -g @statsig/siggy`). Either way, changing Statsig
changes live behaviour, so say exactly what you'll create or change and get
the user's go-ahead first.

- **Id type.** `userID` (the Cognito sub) targets signed-in users. For a
  percentage rollout that should also split signed-out visitors, use
  `stableID`. Bear in mind that a visitor without consent gets a fresh
  stableID on every visit in the app, and none at all in the API.
- **Rules** are checked in order, and the first match decides. Scope them with
  `environments: ["development"]` while testing, since local runs and
  sandboxes use the `development` tier.
- **A dynamic config** has a `defaultValue` for no match, and each rule
  carries its own `returnValue`. Keep the code defaults equal to
  `defaultValue`, so behaviour doesn't change when Statsig is off.
- Changes reach the SDKs about a minute after you save them.

## 2. Read it in the API

The handler builds the caller and the service decides; services never read
the request.

```go
// controllers/checkout.go
func GetCheckout(c *gin.Context) {
    page, err := services.GetCheckout(c.Request.Context(), controllers.FlagUser(c))
    …
}

// services/checkout.go
func GetCheckout(ctx context.Context, u core.FlagUser) (schemas.CheckoutSchema, error) {
    if Gate(ctx, u, "new_checkout") {
        … // new behaviour
    }
    copy := Config(ctx, u, "checkout_copy")
    banner := copy.String("banner", "Welcome back") // also Bool, Int, Float
    …
}
```

- `controllers.FlagUser(c)` takes `user_id` from auth, the
  `X-Statsig-Stable-ID` header, and the caller's IP and user agent. A public
  route needs `middleware.OptionalAuth()` to see who's signed in; without it,
  signed-in users are bucketed as visitors.
- Each read is added to the request's span as a `feature_flag.evaluation`
  event. API reads log no Statsig exposures.
- **Tests:** `testutil.UseStatsig(t)` turns Statsig on with a testify mock.
  Without it Statsig is off, so a test that skips it checks the default path.

  ```go
  statsig := testutil.UseStatsig(t)
  statsig.On("CheckGate", mock.Anything, core.FlagUser{UserID: "user-1"}, "new_checkout").Return(true)
  statsig.On("GetDynamicConfig", mock.Anything, mock.Anything, "checkout_copy").
      Return(map[string]any{"banner": "Hi"})
  ```

  Through a handler, `FlagUser` also carries the IP and user agent, so match
  the user with `mock.Anything` or `mock.MatchedBy`. Cover both sides of the
  gate.

## 3. Read it in the app

```tsx
import { Show } from 'solid-js'
import { config, gate, statsigReady } from '../lib/statsig'

const newCheckout = () => gate('new_checkout')
const banner = () => config('checkout_copy').get('banner', 'Welcome back')

<Show when={newCheckout()} fallback={<OldCheckout />}>
  <p>{banner()}</p>
</Show>
```

- Readers are reactive: wrap them in a function or JSX so they re-run when
  values load and when the user signs in or out.
- `config(name).get(key, def)` returns `def` when the key is missing or holds
  a different type than `def`.
- Values arrive after the first render. On a guest page where flashing the
  default would show, wait with `<Show when={statsigReady()}>`, which turns
  true once values load or after 1.5s.
- Gate and config reads log an exposure as Statsig normally does, but only
  with consent.
- The app has no unit tests. Check both states by running it with the gate
  on and off in `development`.

## 4. Running it locally

- The API reads `STATSIG_SERVER_SECRET` and `STATSIG_ENVIRONMENT` from
  `api/.env`.
- The app reads `VITE_STATSIG_CLIENT_KEY` and `VITE_STATSIG_ENVIRONMENT` from
  `app/.env.local`.
- Without a key, that side runs with Statsig off.
- A `/sandbox` gets the development keys on its own.

## 5. Remove it once it has rolled out

A gate that has been on for everyone for a while is dead weight. Delete the
read and the old path, ship that, and only then archive the gate in Statsig.
Archiving first would flip anyone still running the old code back to the
default.

---
name: ab-experiments
description: How to run a Statsig A/B experiment in steadylearn, in the Solid app (`experiment()` from `src/lib/statsig.ts`, with auto or manual exposure) and the Go API (`services.Experiment` and `Assignment.LogExposure`), from designing the groups and picking the unit type to logging exposures, testing, and cleaning up after a group ships. Use whenever a task says A/B test, experiment, variant, split test, "show half the users…", exposure or Pulse. For plain on/off gates and dynamic configs, use the `feature-flags` skill.
---

# A/B experiments

A Statsig experiment splits users into groups, and each group carries its own
parameters (`{"variant": "test", "label": "Start now"}`). Code reads the
**parameters**, not group names, with a default for each. Statsig compares the
groups using **exposures**: one is logged when a user actually sees their
variant. An experiment with wrong exposures gives a wrong answer, so most of
this skill is about logging them in the right place.

## Rules that are easy to break

- **The code default is the control.** With no keys, an outage, or a user who
  can't be bucketed, every read returns its default. Make the Control group's
  parameters equal to the code defaults. Production has no Statsig keys yet,
  so everyone there gets the control.
- **Log an exposure where the variant is seen, and only there.** Users who
  never see the difference dilute the result. Logging on a code path where the
  groups behave alike counts people the change never reached.
- **Only users with analytics consent are counted.** Without consent, the app
  logs nothing and sends no stableID, and the API counts only callers that
  sent `X-Statsig-Stable-ID`. Users without consent are still bucketed and
  see their variant; they just aren't counted.
- **No shared caches.** A response that depends on the variant must not be
  behind `Cache-Control: public` (the visitor's catalog and course use it) or
  in a Redis key that leaves out the user or the group.
- **Read through the wrappers** (`src/lib/statsig.ts`, `src/services/flags.go`),
  never through the SDKs directly.

## 1. Design it

- **Unit type, fixed when the experiment is created:**
  - `userID` (the Cognito sub) is for screens behind sign-in: dashboard,
    lessons, billing. Signed-out users have no userID, so they get the control
    and aren't counted.
  - `stableID` is for guest pages, so signed-out visitors take part too. In the
    API, only visitors with consent have a stableID; everyone else gets the
    control there. In the app, a visitor without consent gets a new stableID
    on every visit, so their group can change between visits.
- **Pick one side to own it.** If the variant only changes the UI, read it in
  the app. If it changes what the API returns (ordering, limits, content),
  read it in the API and have the app render whatever it gets. Reading it on
  both sides works, because the same unit lands in the same group, but log
  the exposure on one side only.
- **Groups:** give every group the same parameter keys, and give Control the
  code defaults. Sizes add up to 100. `allocation` is the share of units that
  enter the experiment at all; everyone else gets the defaults and isn't
  counted.
- **Metric:** write down what should move. The codebase logs no custom
  Statsig events yet, so if the metric needs one, tell the user: adding event
  logging is a separate change.

## 2. Create it in Statsig

- Create it in the Statsig console or with Statsig's CLI, `siggy`
  (`npm i -g @statsig/siggy`). Name it in lowercase with underscores.
- Changing Statsig changes live behaviour, so say exactly what you'll create,
  start or ship, and get the user's go-ahead first.
- While the experiment is in `setup`, it allocates only in the environments
  listed in `enabledNonProdEnvironments`. Add `development` there to test it
  locally and in sandboxes.
- **Start** it to run for real, after the code is deployed.
- To see a given variant, add an override that puts your userID or stableID
  in that group, scoped to `development`.
- Changes reach the SDKs about a minute after you save them.

## 3. Read it in the app

```tsx
import { experiment } from '../lib/statsig'

function Hero() {
  // Call it once in the component body, not inside JSX or a derived function.
  const cta = experiment('hero_cta')                 // exposure: 'auto'
  return <button>{cta.get('label', 'Get started')}</button> // default = Control
}
```

- **Reading never logs on its own**: `get(key, def)` and `group()` are free.
  `group()` is `undefined` when the user is in no group.
- **`auto` (the default)** logs once per assigned group, and only once values
  have loaded, the user has consented, and they have an id of the
  experiment's unit type. It needs a component owner: called outside a
  component, nothing is logged automatically. Use it when rendering the
  component means showing the variant.
- **`{ exposure: 'manual' }`**: call `logExposure()` when the variant actually
  appears, e.g. when a dialog opens or a tab is selected. That way users who
  never get there aren't counted. It applies the same consent and readiness
  checks.

  ```tsx
  const upsell = experiment('upsell_dialog', { exposure: 'manual' })
  const open = () => { upsell.logExposure(); setOpen(true) }
  ```

- Readers are reactive and update when values load or the user changes. On a
  guest page where flashing the control would show, wait on `statsigReady()`.
- The app has no unit tests. Check each group by overriding yourself into it
  in `development`.

## 4. Read it in the API

```go
// The handler passes controllers.FlagUser(c); the service decides.
func ListCourses(ctx context.Context, u core.FlagUser) ([]schemas.CourseSchema, error) {
    order := Experiment(ctx, u, "catalog_order")
    if order.String("sort", "newest") == "popular" {        // default = Control
        … // the variant changes the response…
    }
    order.LogExposure(ctx)                                  // …so log it here
    …
}
```

- `Experiment` never logs. `LogExposure(ctx)` logs once per call, and only
  when the caller sent a stableID (the consent signal). Call it once per
  request, on the path where the variant is used, not before an early return
  that skips it.
- The parameter reads are `String`, `Bool`, `Int` and `Float`, each with a
  default. `Group()` returns `""` when the caller is in no group.
- The route needs `middleware.OptionalAuth()` (or `RequireAuth`) so that
  signed-in callers are bucketed by userID.
- **Tests** use `testutil.UseStatsig(t)`. Its mock fails the test on any call
  you didn't expect, so leaving out `LogExperimentExposure` asserts that
  nothing is logged.

  ```go
  statsig := testutil.UseStatsig(t)
  visitor := core.FlagUser{StableID: "stable-1"}
  statsig.On("GetExperiment", mock.Anything, visitor, "catalog_order").
      Return(core.FlagExperiment{Group: "Test", Values: map[string]any{"sort": "popular"}})
  statsig.On("LogExperimentExposure", mock.Anything, visitor, "catalog_order").Once()
  ```

  Cover each group, the no-stableID case (bucketed, not logged), and Statsig
  off (the control).

## 5. End it

- **Ship a group:** in Statsig, ship the winning group, so everyone gets its
  parameters at once. Then change the code to use the winning behaviour
  directly, remove the experiment read and `LogExposure`, deploy, and only
  then archive the experiment.
- **Abandon:** everyone falls back to the control, i.e. the code defaults.
  Remove the read and the variant code.
- Either way, leave no experiment read in the code for an experiment that
  isn't running.

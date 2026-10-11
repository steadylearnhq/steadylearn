# Steadylearn web app

Solid + TypeScript, built with Vite.

Requires Node 22.12 or newer (`.nvmrc` pins 24).

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check and build to dist/
npm run typecheck  # type-check only, as the PR checks do
npm run preview  # serve the production build
```

## Layout

- `src/index.css`: design tokens (light and dark themes) and base styles
- `src/lib/`: app-wide state such as the theme
- `src/components/`: shared UI (header, footer, buttons, critters, ChoiceBet)
- `src/pages/landing/`: the public landing page, one file per section
- `src/data/`: static content used by the pages

## Feature flags and experiments

Statsig is read only through `src/lib/statsig.ts`. With no
`VITE_STATSIG_CLIENT_KEY` it is off and every reader returns its defaults, so
**defaults are always the control**: write the code so the default is what
ships today.

- `gate(name)`: a feature gate, `false` when off.
- `config(name).get(key, def)`: a dynamic config parameter.
- Gate and config reads log their exposure as Statsig normally does, once per
  user and value.
- `experiment(name).get(key, def)` and `.group()`: the user's assignment.
  Reading it never logs an exposure.
  - `auto` (the default): used inside a component, the exposure is logged once
    per assigned group. Use it when reading the variant means showing it.
  - `{ exposure: 'manual' }`: call `.logExposure()` where the variant actually
    renders, e.g. only once a dialog opens, so people who never see it aren't
    counted.

Readers are reactive: they update when values load or the user signs in or
out. Flags are evaluated with or without analytics consent, but without it
Statsig stores nothing and logs nothing, exposures included; they start once
the visitor accepts cookies. Values arrive after the first render, so a guest
page that would otherwise flash its defaults can wait on `statsigReady()`,
which turns true once they load or after 1.5s.

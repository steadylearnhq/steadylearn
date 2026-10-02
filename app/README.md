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

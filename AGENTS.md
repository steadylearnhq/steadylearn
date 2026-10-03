# Steadylearn

Short, hands-on lessons for working software engineers: a Go API in `api/`
and the Solid web app in `app/` that runs on it. Read `README.md` first for
how to run them; `app/README.md` carries the app's layout map.

Both sides authenticate against the same AWS Cognito user pool. The course
catalog is public; everything about a learner needs a signed-in user.

## Pull requests

When opening a PR, write its description from `pr-template.md` at the repo
root: fill in **Why**, **What** and **Risks** as bullet points (no prose
paragraphs), and drop the guidance comments.
With `gh`, pass the filled-in text via `gh pr create --body-file <file>`.

One PR does one job: it may change at most one of `.github/`, `api/` and
`app/` (files at the repo root go with any of them). The `PR Scope` check
fails a PR that touches more than one; split it instead.

Every PR check lives in one workflow, `.github/workflows/pr.yml`.
`PR Scope` runs first; if it passes, it reports which areas changed, and the
checks below run in parallel, each only when its area changed. A skipped
check starts no runner, and the one required check is `PR Checks`, which
fails unless `PR Scope` passed and every other check passed or was skipped.
Each check's steps are a composite action in `.github/actions/`, so another
workflow can reuse one without copying it (`deploy.yml` builds its images
with `build-image`).

- `Go Linter` (when `api/` changes) runs `golangci-lint run` in `api/`,
  which covers both linters and formatters. Run `make lint` in `api/` before
  pushing, and `make fmt` to fix formatting.
- `API Tests` (when `api/` changes) runs `make test force=1` in `api/`, the
  suite under `api/tests/`, against a throwaway Postgres in Docker.
- `Atlas Migrations` (when `api/` changes) runs `atlas migrate validate`, then
  `atlas migrate diff`, which fails the PR if it generates a migration. That
  is, a model change must ship with its migration; `make migrate-validate`
  and `make migrate-diff` run the same checks locally.
- `App Linter` (when `app/` changes) typechecks the app. It has no ESLint or
  Prettier yet; when it gets them, they join this check.
- `Build API` and `Build App` build the Docker image of each side a PR
  changes (both when `.github/` changes) without pushing it.

## Deploying

`.github/workflows/deploy.yml` ships `main` to Render; it is run by hand
from the Actions tab, for one GitHub environment picked at launch, and
refuses any other branch. It diffs `main` against the last successful deploy
to that environment and acts only on what changed: Atlas applies new
`api/migrations` first, then each changed side's image is pushed to GHCR as
`steadylearn-api` / `steadylearn-app` tagged with the commit, and its Render
service is pointed at it through a deploy hook, the API before the app.
`force` redeploys both. Each environment holds its own three secrets,
`DATABASE_URL`, `RENDER_DEPLOY_HOOK_API` and `RENDER_DEPLOY_HOOK_APP`, so
adding an environment in the repository settings is all a new target needs.
Without a hook, the image is pushed but not deployed.

---

# App (`app/`)

Solid + TypeScript, built with Vite, with `@solidjs/router` and AWS Amplify
for Cognito auth. Paths in this section are relative to `app/`.

## Conventions that are easy to break

- **Styling** is CSS Modules, one `X.module.css` beside each `X.tsx`. No
  utility framework and no inline style objects beyond values computed at
  runtime (a position, a domain hue).
- **Design tokens** live in `src/index.css` as CSS variables, for light and
  dark themes, and mirror the design's own names: `--paper`, `--ink`,
  `--muted`, `--faint`/`--faint2`, `--line`/`--line2`/`--line3`, `--hover`, `--stroke`,
  `--fill`/`--onFill`, `--seg`/`--onSeg`, `--tomato`, `--accentText`,
  `--ease`. Use them rather than raw colours, so both themes hold.
- **The design** is the source of truth for public pages. Match its spacing
  and type sizes exactly, and keep its copy word for word.
- **Full-width rules and bands** are pseudo-elements that bleed out with
  `left: -100vw; right: -100vw` (see `.bleedRules` in
  `src/pages/landing/shared.module.css`); the page itself never scrolls
  sideways because `body` clips `overflow-x`.
- **Routes** are guarded in `src/App.tsx`: public marketing pages sit under
  `GuestOnly` (signed-in visitors go to `/dashboard`), members-only pages
  under `RequireAuth`. Both render nothing until `authReady()`, so nothing
  flashes before a redirect.
- **Page titles** come from `usePageTitle` in `src/lib/title.ts`, never by
  setting `document.title` directly.
- **API calls** go through `apiGet` / `apiPut` in `src/lib/api.ts`, which
  read `VITE_API_URL`. Endpoint functions live in `src/lib/` (e.g.
  `src/lib/catalog.ts`) and share one request per page load.
- **Env vars** are `VITE_` values compiled into the bundle. The Docker image
  is built with placeholders that `docker/50-inject-env.sh` replaces at
  container start, so a new one must be added to the `Dockerfile`'s `ENV`
  list and to the script as well as to `.env.example`.
- **Dependencies** install with npm (`package-lock.json`), which is what the
  Dockerfile and CI use.

## Checks

```bash
cd app
npm run typecheck && npm run build
```

---

# API (`api/`)

Go REST API using Gin with GORM, PostgreSQL and a Redis read-through cache.
Paths and commands in this section are relative to `api/`.

## Build & Run Commands

```bash
cd api

# Run the application (requires .env; copy env.sample)
go run .

# Build the binary (regenerates swagger first)
make build

# Regenerate Swagger documentation (required whenever API annotations change)
make swagger          # swag init --parseInternal

# Run with Docker Compose (includes PostgreSQL and Redis)
docker compose up --build

# Build the deployable image
docker build -t steadylearn-api .
```

`docs/` is generated by swag and **is committed**, because `main.go` imports it —
a clean clone would not compile otherwise. Regenerate it in the same commit as any
annotation change.

## Checks

```bash
cd api
make fmt && make lint && make test && go build ./...
```

Formatting and linting both run through golangci-lint v2 (`brew install golangci-lint`),
configured in `.golangci.yml`. `make fmt-check` reports formatting drift without
rewriting files.

## Testing

`make test` runs `go test ./tests/...`, reusing cached results when nothing changed;
`make test force=1` runs every test again. It needs a running Docker daemon for any test
that touches the database.

- **Every test lives under `tests/`, one package per layer it tests**, as
  `_test.go` files only: `tests/services/` (`package services_test`) tests
  `src/services/` through its exported API. Do not add test hooks to `src/`.
  The next layer gets a sibling directory on the same recipe.
- **`tests/testutil/` is the shared harness**, a normal package the test
  packages import: `UseDB`, the `Use…` mock helpers and `Run`. Helpers that
  only one package needs stay unexported in that package.
- **testify**: `require` for setup and anything later lines depend on,
  `assert` for the checks, `mock` for third-party services. Table-driven with
  `t.Run`. No `t.Parallel()`: tests swap `core` globals.
- **The database is real.** `testutil.UseDB(t)` starts a `postgres:16-alpine`
  container on first use, with every file in `migrations/` applied, so the
  schema is the production one. Each test then runs in its own transaction,
  which is rolled back when the test ends. A statement that fails aborts that
  transaction, so assert a database error last. Tests never read `.env`. Each
  test package that uses the database needs a `TestMain` that calls
  `testutil.Run(m)` to stop its container (see `tests/services/main_test.go`).
- **Third-party services are faked.** `testutil.UseCognito(t)` swaps
  `core.Cognito` for a testify mock, `testutil.UseCreem(t)` turns billing on
  with `core.Creem` mocked (`testutil.SignCreem` signs a webhook body), and
  `testutil.UseCache(t)` points `core.Cache` at an in-memory miniredis.
  `tests/core/` checks the hand-written Creem client against a fake server.

## Database Migrations (Atlas)

All commands require a `.env` file with `DATABASE_URL` set, and a running Docker
daemon (Atlas spins up a throwaway Postgres to diff against).

```bash
make migrate-diff name=<migration_name>   # generate a migration from GORM model changes
make migrate-apply                        # apply pending migrations
make migrate-status                       # show migration status
make migrate-validate                     # validate the migration directory
make migrate-rehash                       # fix atlas.sum after manual edits
make migrate-new name=<migration_name>    # empty migration for hand-written SQL
```

Migrations are **generated from the GORM models**, never hand-written. Atlas reads
the schema from `cmd/atlas-loader`, so every new model must be registered in that
file's `gormschema.New("postgres").Load(...)` call or it will be silently missing
from the diff.

## Architecture

### Layer Structure

- `src/api/v1/routes.go` - route groups, one per resource, wiring middleware to handlers
- `src/api/v1/controllers/` - HTTP handlers: parse request, call a service, format response
- `src/api/health/` - liveness and readiness endpoints
- `src/services/` - business logic; **all** database and cache access lives here
- `src/models/` - GORM entities, embedding `BaseModel` (uuid id, created_at, deleted_at)
- `src/schemas/` - request/response DTOs, kept separate from models
- `src/middleware/` - `RequireAuth`
- `src/core/` - config, database, cache, telemetry, and the Cognito client
- `cmd/atlas-loader/` - feeds the GORM schema to Atlas

### Authentication

AWS Cognito JWT via `Authorization: Bearer <token>`. The middleware validates the
token against the pool's JWKS and stores the `sub` claim under the Gin context key
`user_id`. The user's id **is** the Cognito sub; `POST /v1/users` creates the local
row, and so does enrolling in a course (`PUT /v1/courses/:id/enrollment`), since
the app does not call setup. `GET /v1/catalog` and `GET /v1/courses/:id` are public;
both take an optional token (`OptionalAuth`). A signed-in caller also gets
their enrollments with the catalog, and every lesson of a course's syllabus
with, when enrolled, their enrollment in it.

Billing goes through Creem, the Merchant of Record. `/v1/billing/*` is
the caller's own subscription; `POST /v1/webhooks/creem` takes no token, since
Creem's HMAC signature (`creem-signature`) authenticates it. A webhook only says
which subscription changed: its state is always read back from Creem.
`GET /v1/billing/payments` reads the billing history from Creem's transactions,
cached per member and dropped when a webhook or sync stores their subscription.
Creem exposes no card details or invoice PDFs; those stay in its portal.

### Key Patterns

- Controllers never touch `core.DB`; services never write HTTP responses
- Model to DTO conversion goes through a `toXSchema` helper in the service
- Third-party services are reached only through interface-typed globals in `core`
  (`Cognito`, `Creem`), which `Init*` sets at boot and tests replace with mocks
- Soft deletes via `deleted_at`; queries must filter `deleted_at IS NULL`
- Redis is a read-through cache, never a system of record: go through `cached` in
  `src/services/cache.go`. Every key is namespaced and expires, and an unreachable
  cache falls back to the database rather than failing the request
- Config is validated at boot: a missing required env var is a fatal error. Billing
  is the exception: without `CREEM_API_KEY`, `CREEM_WEBHOOK_SECRET`,
  `CREEM_PRODUCT_ID` and `APP_URL` it is off, `core.Creem` stays nil, and the
  billing endpoints answer 503 (reading a subscription still works)
- OpenTelemetry (traces, metrics, logs) is wired in `src/core/telemetry.go` and exported
  via OTLP/HTTP. It is opt-out (`OTEL_SDK_DISABLED=true`), and any exporter failure
  degrades to a no-op rather than failing boot. Log with `slog.InfoContext` /
  `ErrorContext` so records correlate with the active span

## Environment Variables

See `env.sample`, the committed template for `.env`.

## API Documentation

Swagger UI at `/api/docs/index.html`. Global annotations live in `main.go`,
per-endpoint annotations above each controller function.

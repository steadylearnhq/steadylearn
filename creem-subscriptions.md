# Creem monthly subscriptions (billing state only)

## Context
Pricing promises "$24 a month, VAT included", but nothing takes a payment yet:
- `/subscription` always shows the free plan.
- The "Continue to payment" button on `/subscription/checkout` does nothing.
- `AccountMenu` always tags the member `free`.
- The API has no billing at all.

We'll use Creem (https://docs.creem.io). It is a Merchant of Record, so it handles VAT and invoices. It also gives us a hosted checkout, webhooks, a subscriptions API and a customer portal.

Decisions already made:
- The existing members-only pages are where members subscribe: `/subscription` shows the plan and its state, and `/subscription/checkout` is the review page.
- This round only records who is subscribed. Paid courses are not locked.
- Members cancel and resume on `/subscription`, through our API, which uses Creem's scheduled cancel. That way access really does run to the end of the period, as `plans.ts` and the Terms promise. Creem's portal cancels immediately, so we use it only for card changes and invoices.
- Two PRs, because `PR Scope` allows one area per PR:
  - **API**: Part 1, plus this doc.
  - **App**: Part 2.
  - Deploy the API PR before merging the app PR.

Branch: `creem-payments`. Split into `creem-api` and `creem-app` when opening the PRs.

**Flow**
1. A guest clicks Subscribe on `/pricing` or a paid course's drawer. That goes to `/signup?redirect=/subscription/checkout`, then sign up or log in, then `/subscription/checkout`. A signed-in member reaches the same page from `/subscription`.
2. "Continue to payment" calls `POST /v1/billing/checkout`. The API creates a Creem checkout tagged with `metadata.user_id`, and the app redirects to `checkout_url`, with `?theme=` set to the current theme.
3. After payment, Creem sends the member back to `/subscription?checkout=success&subscription_id=sub_…&…`.
   - The page calls `POST /v1/billing/sync` with that `subscription_id`.
   - The API re-reads the subscription from Creem, stores it if it belongs to the caller, and returns the member's billing state. The page renders that directly, with no polling.
   - The page retries sync only if the call fails, or if Creem hasn't marked the subscription paid yet.
4. Creem calls `POST /v1/webhooks/creem`. The API checks the signature, re-reads the subscription from Creem and upserts it. This is the source of truth for renewals, failures and cancellations.
5. On `/subscription`:
   - **Cancel** calls `POST /v1/billing/cancel`, which uses Creem cancel with `mode: scheduled`.
   - **Resume** calls `POST /v1/billing/resume`.
   - **Manage billing** calls `POST /v1/billing/portal` and redirects to the Creem portal, for card changes and invoices.

## Part 1 — API (Go/Gin, Postgres/GORM, Atlas) — PR 1

**Config** (`api/src/core/config.go`, `api/env.sample`, `api/docker-compose.yml`)
- New variables:
  - `CREEM_API_KEY`, sent as `x-api-key`.
  - `CREEM_WEBHOOK_SECRET`
  - `CREEM_PRODUCT_ID`
  - `CREEM_API_URL`, which defaults to `https://test-api.creem.io/v1`. Live is `https://api.creem.io/v1`. Test and live keys don't work across modes.
  - `APP_URL`, used to build `success_url`.
- Add `Config.BillingEnabled()`.
- Billing is optional at boot, unlike the variables that are required today:
  - If the Creem variables are missing, boot logs a warning, and the billing endpoints and the webhook return 503. `GET /v1/billing/subscription` still answers, since it only reads the database and the app reads it on every page.
  - The rest of the API is unaffected, so the tests and local dev don't need Creem keys.
- Note this exception in `AGENTS.md` ("Config is validated at boot").

**Creem client** (`api/src/core/creem.go`, new; same pattern as `cognito.go`)
- `type CreemAPI interface { CreateCheckout; GetSubscription; CancelSubscription; ResumeSubscription; CreateBillingPortalLink }`, plus a global `var Creem CreemAPI`.
- `InitCreem()` runs in `main.go` after `InitCache`. It leaves `Creem` nil when billing is off.
- `creemClient` uses `net/http` with a 10s timeout and `http.NewRequestWithContext`. It calls:
  - `POST /checkouts` with `product_id`, `request_id`, `success_url`, `metadata`, and `customer` as either `{id}` or `{email}`. Creem accepts only one of these. Returns `checkout_url`.
  - `GET /subscriptions?subscription_id=`
  - `POST /subscriptions/{id}/cancel` with `{"mode":"scheduled","onExecute":"cancel"}`
  - `POST /subscriptions/{id}/resume`, which works only from `scheduled_cancel` or `paused`.
  - `POST /customers/billing` with `customer_id`. Returns `customer_portal_link`.
- Non-2xx responses become errors. The API key is never logged.
- `product` and `customer` are an object in subscription payloads but a bare id string inside `checkout.completed` → `object.subscription`. Both get a custom `UnmarshalJSON`.
- `VerifyCreemSignature(body, sig)` checks the `creem-signature` header: a hex HMAC-SHA256 of the raw body, compared with `hmac.Equal`.
  - Creem signs no timestamp, so replays aren't blocked by the signature.
  - Replays are still harmless, because we dedupe event ids and always re-read the current state from Creem.

**Models** (`api/src/models/billing.go`, new; add both to the `Load(...)` call in `api/cmd/atlas-loader/main.go`)
- `Subscription`:
  - `BaseModel`, plus its own `UpdatedAt`, declared the way `CourseFeedback` does in `models/enrollment.go:37`.
  - `UserId`: FK to users, `ON DELETE CASCADE`.
  - `CreemSubscriptionId`: plain unique, so `ON CONFLICT (creem_subscription_id)` works.
  - `CreemCustomerId`, `CreemProductId`.
  - `Status`: text, with no CHECK constraint, so an unknown Creem status can't break webhook retries.
  - `CurrentPeriodEnd`, `CanceledAt`.
  - `CreemUpdatedAt`: the subscription's `updated_at`. It stops an older snapshot from overwriting a newer one.
  - "Cancels at period end" is derived from `status == scheduled_cancel`.
- `CreemWebhookEvent`:
  - Fields: `Id` (`evt_…`, primary key), `EventType`, `OccurredAt` (the envelope's `created_at`, converted from epoch milliseconds), `ProcessedAt`, `Payload` (jsonb).
  - Used to drop duplicate deliveries and as an audit log.
- Generate the migration with `cd api && make migrate-diff name=billing`. `deploy.yml` applies it before the API.

**Schemas** (`api/src/schemas/billing.go`)
- `BillingSchema{subscription: SubscriptionSchema|null}`
- `SubscriptionSchema{status, entitled, cancelAtPeriodEnd, currentPeriodEnd, canceledAt}`
- `CheckoutSchema{checkoutUrl}`
- `SyncRequest{subscriptionId}` (the response is `BillingSchema`)
- `PortalSchema{url}`

**Service** (`api/src/services/billingService.go`)
- Sentinel errors and their status codes:

  | Error | Status |
  |---|---|
  | `ErrBillingDisabled` | 503 |
  | `ErrAlreadySubscribed` | 409 |
  | `ErrNoSubscription` | 404 |
  | `ErrNotCancellable` | 409 |
  | `ErrPaymentProvider` | 502 |
  | `ErrInvalidSignature` | 401 |
  | `ErrMalformedEvent` | 400 |

- `isEntitled(status, periodEnd, now)`:
  - `active`, `trialing`, `past_due`, `unpaid` → true. Open question below.
  - `scheduled_cancel` → true until the period ends.
  - Everything else, including unknown values (the docs also mention `incomplete` and `expired`), → false.
- `GetSubscription(ctx, userId)` returns the most relevant row: an entitled one first, otherwise the newest. It isn't cached, because it changes on checkout, cancel and resume, and every page load should show the current state. `GET /v1/users/me` also carries it as `subscription` (left out when the user never subscribed), read after the cached user and profile, so it is always fresh. Its cache key moves to `v2`.
- `StartCheckout(ctx, userId)`:
  - Calls `SetupUser` first (`services/userService.go:49`, idempotent), because the app never calls `POST /v1/users`.
  - Returns 409 if the member is already entitled.
  - Reuses an earlier `cust_` id if there is one. Otherwise it sends the email from `GetUserProfile` (`userService.go:72`, Cognito), which wraps its errors in `ErrIdentityProvider` (502).
  - `metadata.user_id`, a UUID as `request_id`, and `success_url = APP_URL + "/subscription?checkout=success"`. Creem appends `subscription_id`, `customer_id` and the other ids.
- `SyncSubscription(ctx, userId, subId)`:
  - Calls `Creem.GetSubscription(subId)`.
  - Upserts only if `metadata.user_id == userId` and the product is `CREEM_PRODUCT_ID`. Otherwise it returns 404.
  - Returns `GetSubscription(ctx, userId)` after the upsert, so the caller gets its state in the same response.
  - Because we read the state from Creem ourselves, we don't need the redirect's `signature` param (a SHA-256 salted with the API key).
- `CancelSubscription` / `ResumeSubscription(ctx, userId)`:
  - Act on the member's entitled row.
  - Return 409 if it isn't `active`/`trialing` (cancel) or `scheduled_cancel` (resume).
  - Call Creem, then upsert the returned subscription. The webhook that follows is then a no-op.
- `BillingPortalLink(ctx, userId)` uses the newest row's customer id, whatever its status. It returns 404 if the member has no row.
- `HandleCreemWebhook(ctx, rawBody, sig)`:
  1. Verify the signature. Parse `{id, eventType, created_at, object}`.
  2. If the event id is already recorded, acknowledge and stop.
  3. Find the `sub_` id: `checkout.completed` → `object.subscription.id`; `subscription.*` → `object.id`. This covers `active`, `paid`, `trialing`, `past_due`, `unpaid`, `paused`, `scheduled_cancel`, `canceled`, `expired` and `update`. Refund and dispute events are only logged and recorded.
  4. Re-read the subscription with `Creem.GetSubscription`. On error, return `ErrPaymentProvider`; the controller answers 502 and Creem retries.
  5. Skip products other than `CREEM_PRODUCT_ID`.
  6. Match a user by `metadata.user_id`, which Creem carries from the checkout to the subscription. Fall back to an existing row with the same `sub_` id. If neither matches, log it as unattributed and acknowledge.
  7. In one transaction (the upsert is shared with sync, cancel and resume):
     - make sure the user row exists (`INSERT … ON CONFLICT DO NOTHING`, as `Enroll` does);
     - record the event (`DO NOTHING`; if no row was inserted, another delivery already handled it);
     - upsert the subscription on `creem_subscription_id`, but only `WHERE subscriptions.creem_updated_at <= excluded.creem_updated_at`.

**Controllers and routes** (`api/src/api/v1/controllers/billing.go`, `api/src/api/v1/routes.go`)
- `/v1/billing`, each route with `middleware.RequireAuth()`, as the other routes attach it:
  - `GET /subscription`
  - `POST /checkout`
  - `POST /sync`
  - `POST /cancel`
  - `POST /resume`
  - `POST /portal`
- `POST /v1/webhooks/creem` needs no auth, because the HMAC signature authenticates it.
  - It reads the raw body with `io.ReadAll(http.MaxBytesReader(..., 1<<20))`.
  - It replies with exactly 200 `{"received":true}`; parts of Creem's docs say only 200 counts as success.
  - Creem makes 5 attempts in total: at 0, 30s, 5m, 30m and 6h.
- Follow the style of `controllers/enrollment.go`:
  - `c.MustGet("user_id").(uuid.UUID)`, and `ShouldBindJSON` → 400.
  - A `switch` on `errors.Is`, `{"error": …}` bodies, and `slog.ErrorContext` on 5xx.
- Add swagger annotations, then run `make swagger` and commit `docs/`.

**Tests**
- `api/tests/testutil/mocks.go`: `MockCreem` with `UseCreem(t)`, built on the existing `swap`. It also turns billing on with test settings, and `SignCreem(body)` signs a webhook body. `swap` is unexported, so these must live in testutil.
- `api/tests/core/creem_test.go`: the hand-written client against an `httptest` fake Creem: paths, the `x-api-key` header, request bodies, `product`/`customer` as an object or a bare id, 404 → `ErrCreemNotFound`, and the signature check.
- `api/tests/services/billing_test.go`:
  - **Checkout:** creates the user row and tags the checkout; reuses the customer; 409 when already subscribed; 502 when Creem fails.
  - **Sync:** stores the caller's subscription and returns it as entitled; 404 for someone else's or for another product.
  - **Cancel/resume:** cancel sends `scheduled` and stores `scheduled_cancel`; resume brings it back to `active`; 409 from the wrong state.
  - **Webhook:**
    - A bad signature is rejected.
    - `checkout.completed` stores a row.
    - A duplicate event makes only one Creem call.
    - An older snapshot doesn't overwrite a newer one.
    - Scheduled cancel, then canceled.
    - `unpaid` is handled.
    - Other products and unknown subscriptions are ignored.
    - A Creem failure isn't recorded, so the retry reprocesses it.
  - **Portal link.**
  - **`isEntitled`:** a table test.
- `api/tests/controllers/billing_test.go`, on the `enrollment_test.go` recipe:
  - The webhook route reads the raw body: a valid signature gets 200 and a bad one 401.
  - 503 when billing is off.
  - Error-to-status mapping for the billing routes.
- Run `make fmt && make lint && make test force=1 && go build ./...`.

## Part 2 — App (SolidJS) — PR 2, after PR 1 is deployed
- **`app/src/lib/api.ts`**: add `'POST'` to `request()`'s method union and export `apiPost(path, token?, body?)`. Callers pass `await accessToken()`, as `enrollments.ts` does.
- **`app/src/lib/billing.ts`** (new):
  - `fetchSubscription()`, which shares one request per page load like `catalog.ts`'s `shared()` and is dropped after a change.
  - `startCheckout()`, which redirects with `location.assign(checkoutUrl + '?theme=' + theme)`.
  - `syncSubscription(subId)`, `cancelSubscription()`, `resumeSubscription()` and `openPortal()`.
  - `SUBSCRIBE_HREF = '/signup?redirect=/subscription/checkout'`.
- **`app/src/pages/subscription/Checkout.tsx`**: "Continue to payment →" calls `startCheckout()`.
  - While it waits, the button is disabled.
  - A 409 sends the member to `/subscription`.
  - A 502 or 503 shows "Billing is unavailable right now".
  - If the member is already entitled, the page redirects to `/subscription`.
- **`app/src/pages/subscription/Subscription.tsx`**: replace the fixed free state with states taken from `fetchSubscription()`. Keep the existing cards and copy for the free state.
  - Loading, and an error state with retry.
  - **Confirming**, when `?checkout=success` is set. Call `syncSubscription(subscription_id)` and render the state it returns. If the call fails, or if the member isn't entitled yet, retry sync a few times with backoff (2s, 4s, 8s). After that, show a "taking longer" message; the webhook will still catch up. Without a `subscription_id` (for example, a reloaded or hand-typed URL), fall back to `fetchSubscription()`.
  - **Free** (no row, or a canceled one): today's page. The Subscribe link goes to `/subscription/checkout`. A canceled member also gets **Manage billing**, for invoices.
  - **Active**: "Renews on …", with **Cancel subscription** (behind a confirm step) and **Manage billing**.
  - **Scheduled cancel**: "Ends on …, you keep access until then", with **Resume** and **Manage billing**.
  - **Past due or unpaid**: a warning to update the card, with **Manage billing**.
  - **Paused**: a note, with **Manage billing**.
  - The design has no states other than free, so match its type and spacing for these. Confirm the copy with the design owner.
- **`app/src/components/AccountMenu.tsx`**: the tag shows `free` or `member`, read from `fetchSubscription()` instead of the hard-coded `free`.
- **Calls to action**:
  - Pricing's Subscribe button links to `SUBSCRIBE_HREF`. Optionally, import `PRICE`/`PERIOD` from `subscription/plans.ts` instead of repeating them.
  - `CourseDrawer`'s guest-only footer sends paid courses to `SUBSCRIBE_HREF` instead of `/signup`.
- **Keep `redirect` through sign-in**:
  - `Auth.tsx:545`: the log in / sign up switch keeps `?redirect=`, through a new `withRedirect` helper.
  - Google sign-in (`Auth.tsx:256`) saves the target in `sessionStorage` with `rememberRedirect` before `signInWithRedirect`. `ExternalAuth.tsx:21` reads it back with `takeRememberedRedirect` and passes it through `safeRedirect` instead of always using `HOME`. Wrap the storage calls in try/catch.
  - The welcome screen's button (`Auth.tsx:566`) says "Continue to checkout →" when the redirect starts with `/subscription`.
- **Legal** (`app/src/pages/legal/Legal.tsx`):
  - Terms, line 40: "from your profile" → "from the Subscription page".
  - Name Creem as the Merchant of Record that processes payments, in the Terms and in the Privacy section's payment-provider lines (82, 86, 94). This is also needed for Creem's account review.
- **Env**: no new `VITE_*` variables.
- **Checks**: `npm run typecheck && npm run build`.

## Part 3 — Setup outside the code
1. **Creem, test mode**:
   - **Product:** recurring, `every-month`, $24.00, `tax_mode` **inclusive** (so it stays "VAT included"), tax category `saas`. Its `prod_` id goes in `CREEM_PRODUCT_ID`.
   - **API key:** the test key goes in `CREEM_API_KEY`.
   - **Webhook:** `https://<api-host>/v1/webhooks/creem`, subscribed to:
     - `checkout.completed`
     - all `subscription.*` events, including `subscription.unpaid`
     - `refund.created`
     - `dispute.created`

     Its secret goes in `CREEM_WEBHOOK_SECRET`.
   - **Customer portal:** turn it on.
   - **Branding** (Settings → Branding): upload the logo and set the accent, hover and text colours (accent `oklch(0.64 0.2 35)`, about `#E8552F`). The logo is also used on receipts. Light or dark is chosen per checkout with `?theme=`. Checkout is always Creem's hosted page, reached by redirect.
   - **Support email:** set it, and make it match the one on the site. A mismatch is the most common reason a review asks for changes.
2. **Render (API)**: set the five variables. Run `deploy.yml`, which applies the migration, then deploys the API. Merge and deploy the app after that.
3. **Local**:
   - Put the test keys in `api/.env`, with `APP_URL=http://localhost:5173`.
   - Run `creem listen --forward-to http://localhost:8080/v1/webhooks/creem` (`brew tap armitage-labs/creem && brew install creem`). Use the signing secret it prints at startup as `CREEM_WEBHOOK_SECRET`; it does not retry.
   - Without it, `sync` still stores the subscription after checkout.
4. **Going live**:
   - Pass Creem's account review: a live product, Terms and Privacy reachable on the site, pricing visible, a matching support email, and payout and KYC set up. It takes 1–2 working days.
   - Recreate the product and the webhook in live mode; test products aren't copied over.
   - Switch the Render variables to the live key, secret and product, with `CREEM_API_URL=https://api.creem.io/v1`.
   - Make one real purchase, then cancel and refund it.

## Verification
- **API:** `make fmt && make lint && make test force=1 && go build ./...`, then `make swagger` and check `/api/docs/index.html`.
- **App:** `npm run typecheck && npm run build`.
- **Guest path:** `/pricing` → Subscribe → sign up by email and with Google, switching between log in and sign up on the way. You should land on `/subscription/checkout`.
- **Checkout:**
  - "Continue to payment" → Creem in the current theme → pay with `4111 1111 1111 1111`.
  - `/subscription?checkout=success` shows Confirming, then Active, even with `creem listen` stopped (sync).
  - The AccountMenu tag changes.
  - Check the rows in `subscriptions` and `creem_webhook_events`.
- **Resend** the event from the Creem dashboard: no duplicate row and no second Creem fetch.
- **Cancel/resume:**
  - Cancel → "Ends on …"; Creem shows a scheduled cancel. Resume → Active.
  - Cancel in the portal → Canceled (immediate), and the page shows the free state. Subscribing again reuses the `cust_` id.
- **Failure cases:**
  - `curl` the webhook with a bad signature → 401.
  - Checkout while active → 409.
  - Unset the Creem variables → the billing routes return 503 and everything else still works.
  - Declined card `4507 9900 0000 0028`, and insufficient funds `…0010`: check the error and the past-due/unpaid handling.

## Open questions (check during implementation)
- What a real test-mode `GET /v1/subscriptions` returns:
  - Is `updated_at` there? If not, order updates by the event's `created_at`, and by the time of the call for sync.
  - Is `current_period_end_date` set while the subscription is `scheduled_cancel`?
- Do members keep access while `past_due` or `unpaid`? This only matters once paid content is locked, but the copy depends on it now. The Terms say "may pause access until it succeeds".
- Account deletion must cancel the Creem subscription first. That's later work.

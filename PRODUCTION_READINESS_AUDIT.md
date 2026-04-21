# Production Readiness Audit — Bake & Grill

**Date:** April 2026  
**Auditor:** Automated repo-aware audit  
**Branch audited:** `main`

---

## Executive Summary

The Bake & Grill monorepo is a multi-app system (Laravel API + 5 React frontends) serving a real Maldivian restaurant. The codebase is architecturally sound with well-structured auth, idempotent payment handling, row-locked concurrency, and a meaningful test suite.

However, a **critical payment bug** (Stripe charges 100x too small), several **high-severity operational gaps**, and **misleading configuration** were found that must be resolved before going live with real customers and real money.

---

## Final Verdict

> **NEAR production ready — do not go live until Critical and High items below are resolved.**

The BML payment flow (primary gateway) is solid. The Stripe integration had a critical amount bug that has now been fixed. The operational gaps (error monitoring, PostgreSQL CI coverage, queue observability) are real risks but manageable with the recommendations in this document.

---

## Risk Ratings by Area

| Area | Risk | Notes |
|---|---|---|
| Payment / BML | Medium | Code is correct; UAT configured; switch to prod credentials requires config changes only |
| Payment / Stripe | **Critical → Fixed** | Amount bug fixed in this audit |
| Authentication / Authorization | Low | Staff/customer token isolation is solid; ownership checks in place |
| Order / Stock / Money | Low-Medium | Atomic stock deduction; row locks; `total_laar` float fallback documented |
| CI / Deployment | Medium | SQLite-only CI; staging/prod naming confusion fixed; storage:link added |
| Queue / Jobs | Medium | No timeouts; `SendScheduledSmsJob` silent errors fixed; no Horizon monitoring |
| Observability | High | No Sentry/error tracking; debug log level in example |
| Configuration / Env | Medium → Fixed | .env.example gaps fixed in this audit |
| Frontend / Apps | Low | Type-checked and built in CI; SSE live updates in place |
| Performance | Low-Medium | New DB indexes added; KDS list unbounded; LTV analytics unbounded |
| Operational | Medium | storage:link, queue worker, scheduler — documented below |

---

## Findings

### Critical

#### C1 — Stripe charge amount 100x too small
- **File:** `backend/app/Http/Controllers/Api/StripeController.php` (line 47)
- **Problem:** `(int) ($order->total ?? 0)` cast the MVR float (e.g. 25.99) to an integer (25) and passed it to `StripeService::createPaymentIntent()` which expects laari (2599). Every Stripe charge was 100x less than the order total.
- **Fix:** Replaced with `(int) round(((float) ($order->total ?? 0)) * 100)`.
- **Status: FIXED**

---

### High

#### H1 — BML webhook test used wrong route (false negative)
- **File:** `backend/tests/Feature/Payment/WebhookIdempotencyTest.php` (line 155)
- **Problem:** `test_failed_payment_does_not_mark_order_as_paid` posted to `/api/webhooks/bml` which does not exist. Real route is `/api/payments/bml/webhook`. Test never hit the controller — order status assertion was vacuously true.
- **Fix:** Corrected the route URL. Added two new tests: invalid signature path and `enforce_signature=false` path.
- **Status: FIXED**

#### H2 — No Stripe webhook tests
- **File:** (missing)
- **Problem:** `StripeController::webhook` handles signature verification, `payment_intent.succeeded`, and idempotency but had zero automated test coverage.
- **Fix:** Created `backend/tests/Feature/Payment/StripeWebhookTest.php` with 6 tests: valid event, invalid signature → 400, missing header → 400, duplicate event idempotency, stale timestamp → 400, unhandled event type → 200.
- **Status: FIXED**

#### H3 — BML signature failure → HTTP 200, no retry, order stalls
- **File:** `backend/app/Http/Controllers/Api/BmlWebhookController.php`
- **Problem:** Controller always returns 200 even when signature verification throws. If `BML_ENFORCE_SIGNATURE=true` and the HMAC secret is misconfigured, BML gets a 200, stops retrying, and the order remains at `payment_pending` indefinitely. The return URL fallback is the only recovery path.
- **Recommendation:** Document in runbooks. Ensure `BML_RETURN_URL` is always configured so the fallback fires. Monitor `webhook_logs` for rows stuck in `failed` status. Alert on these rows.
- **Status: DOCUMENTED — not auto-fixed (deliberate design decision)**

#### H4 — `enforce_signature=false` processes unauthenticated webhooks
- **File:** `backend/app/Domains/Payments/Services/PaymentService.php` (line 291)
- **Problem:** When `BML_ENFORCE_SIGNATURE=false`, any HTTP POST to the webhook endpoint with a valid-looking BML payload is processed as a real payment. Acceptable for UAT; unacceptable in production with real money.
- **Recommendation:** Set `BML_ENFORCE_SIGNATURE=true` and provide a real `BML_WEBHOOK_SECRET` before switching to production BML credentials. Never run `false` on a server that handles live payments.
- **Status: DOCUMENTED — config decision, not a code bug**

---

### Medium

#### M1 — Staging/production naming confusion in CI
- **File:** `.github/workflows/ci.yml`
- **Problem:** The deploy job was named "Deploy to production" but deployed to `/home/bakeandgrill/test.bakeandgrill.mv` (the test server). E2E tests explicitly targeted `test.bakeandgrill.mv`. This creates a dangerous mental model mismatch.
- **Fix:** Renamed job to "Deploy (test server — test.bakeandgrill.mv)" and added `environment: test` label. Added comment explaining that a second job with `environment: production` should be added when a separate production server exists.
- **Status: FIXED**

#### M2 — `storage:link` missing from deploy script
- **File:** `.github/workflows/ci.yml`
- **Problem:** `php artisan storage:link` was never run during deploy. On a fresh server (or after `/storage` was cleared), all uploaded images (menu photos, receipts, etc.) returned 404.
- **Fix:** Added `php artisan storage:link --force` to the deploy SSH script before `config:cache`.
- **Status: FIXED**

#### M3 — Playwright report artifact path mismatch
- **File:** `.github/workflows/ci.yml`
- **Problem:** CI uploaded `playwright-report/` but `playwright.config.ts` writes the HTML report to `e2e/report/html`. The artifact was always empty.
- **Fix:** Changed artifact path to `e2e/report/`.
- **Status: FIXED**

#### M4 — BML signature header default inconsistency
- **File:** `backend/app/Http/Middleware/VerifyBmlSignature.php`
- **Problem:** Middleware defaulted to `X-Signature`; `PaymentService` defaulted to `X-BML-Signature`; `config/bml.php` defines `X-BML-Signature`. The middleware is not wired to the webhook route today, so this was harmless, but if added it would use the wrong header.
- **Fix:** Updated middleware to use `config('bml.webhook_signature_header', 'X-BML-Signature')` — matching `PaymentService` and the config file.
- **Status: FIXED**

#### M5 — `SendScheduledSmsJob` silently swallowed per-recipient send failures
- **File:** `backend/app/Domains/Sms/Jobs/SendScheduledSmsJob.php`
- **Problem:** Per-recipient SMS failures were caught, logged, and silently ignored. The job always completed successfully regardless of how many sends failed. Failed sends never triggered retries; operators had no visibility unless they manually searched logs.
- **Fix:** Failures are now collected across all recipients. After attempting all sends, if any failed, the job throws a `RuntimeException` summarising which phones failed. Laravel's retry mechanism fires, and the failure appears in `failed_jobs`. Idempotency keys ensure already-sent messages are not re-sent on retry.
- **Status: FIXED**

#### M6 — CORS missing delivery and admin app origins
- **File:** `backend/config/cors.php`
- **Problem:** `allowed_origins` covered `FRONTEND_URL`, `POS_URL`, and `KDS_URL` but not the delivery driver app or the admin dashboard. If those apps are served from a different origin, all their API calls fail with CORS errors.
- **Fix:** Added `env('DELIVERY_URL')` and `env('ADMIN_URL')` to `allowed_origins`. Added corresponding entries in `backend/.env.example`. Added localhost ports 3004/3005 for local dev.
- **Status: FIXED**

#### M7 — SQLite-only CI; production uses PostgreSQL + Redis
- **Files:** `.github/workflows/ci.yml`, `backend/phpunit.xml`
- **Problem:** All PHPUnit tests run against SQLite in-memory. Production uses PostgreSQL. PostgreSQL-specific behaviour (advisory locks, `EXTRACT`, certain constraint types, index behaviour) is never exercised in CI. Redis queue/cache is also untested (sync driver in CI).
- **Recommendation:** Add a PostgreSQL-backed CI job using a `services: postgres:` block in GitHub Actions. This is the single highest-value CI improvement remaining.
- **Status: DOCUMENTED — not auto-added (requires infrastructure decision)**

#### M8 — No error monitoring integration
- **Files:** `backend/bootstrap/app.php`, `composer.json`
- **Problem:** Exceptions are written only to the log file. There is no Sentry, Bugsnag, or equivalent integration. Silent failures in queued jobs, scheduled commands, and webhooks go unnoticed until a customer complains.
- **Recommendation:** Add `sentry/sentry-laravel` (or Bugsnag) before launch. Configure `SENTRY_DSN` or equivalent. Set up alerts for new error events.
- **Status: DOCUMENTED — requires external service**

#### M9 — LOG_LEVEL=debug; single non-rotating log file
- **File:** `backend/.env.example`
- **Problem:** The example used `LOG_LEVEL=debug` and `LOG_STACK=single`. In production, debug logging is extremely verbose and may log sensitive request data. A single non-rotating file will grow unboundedly.
- **Fix:** Changed example to `LOG_LEVEL=warning` and `LOG_STACK=daily` with an explanatory comment.
- **Status: FIXED**

#### M10 — Queue jobs have no `$timeout`
- **Files:** All jobs under `backend/app/Jobs/` and `backend/app/Domains/*/Jobs/`
- **Problem:** No job sets `public int $timeout`. If any job hangs (e.g. SMS provider timeout, webhook delivery stall), it occupies a worker indefinitely until the worker process is manually killed.
- **Recommendation:** Add `public int $timeout = 60;` (or appropriate value) to each job class. The `DispatchWebhookJob` already sets `->timeout(15)` on the HTTP client, which is good, but the job-level timeout is also needed.
- **Status: DOCUMENTED — low-risk to add, left as recommendation**

#### M11 — No `ShouldBeUnique` on scheduler-dispatched jobs
- **File:** `backend/routes/console.php`
- **Problem:** `sms:dispatch-scheduled` runs every minute. If a job takes longer than 60 seconds (e.g. sending to a large contact group), the next scheduler tick dispatches a duplicate. Idempotency keys on individual SMS sends prevent double-delivery but the job itself stacks up.
- **Recommendation:** Consider `ShouldBeUnique` on `SendScheduledSmsJob` keyed on `scheduledMessageId`, or add a scheduled message `sending` status flag to prevent re-dispatch while a send is in flight.
- **Status: DOCUMENTED**

---

### Low

#### L1 — Root `.env.example` is generic Laravel
- **File:** `.env.example` (repo root)
- **Problem:** The root file was stock Laravel boilerplate with `DB_CONNECTION=sqlite` and `APP_NAME=Laravel`. In a monorepo where the real template is `backend/.env.example`, copying the root file to `backend/.env` would produce a broken configuration.
- **Fix:** Replaced root `.env.example` with a redirect comment pointing to `backend/.env.example` and listing all frontend app env examples.
- **Status: FIXED**

#### L2 — `delivery-web` missing `.env.example`
- **File:** `apps/delivery-web/` (missing)
- **Problem:** All other apps had `.env.example` files; `delivery-web` did not. Deployers had no reference for the `VITE_API_BASE_URL` variable the app uses.
- **Fix:** Created `apps/delivery-web/.env.example`.
- **Status: FIXED**

#### L3 — BML `.env.example` showed production URL/settings for a staging server
- **File:** `backend/.env.example`
- **Problem:** `BML_BASE_URL` pointed to the production BML API, `BML_ENVIRONMENT=production`, and `BML_AUTH_MODE` was absent. The server currently uses UAT. Copying the example to a staging server would hit real BML.
- **Fix:** Updated to UAT defaults with clear comments showing what to change for production.
- **Status: FIXED**

#### L4 — `SANCTUM_STATEFUL_DOMAINS` missing subdomain entries
- **File:** `backend/.env.example`
- **Problem:** Example only listed `bakeandgrill.mv,localhost,localhost:3003`. Missing `test.bakeandgrill.mv` and `app.bakeandgrill.mv`. Mismatch causes Sanctum cookie auth to silently fail on those origins.
- **Fix:** Added both subdomains with a warning comment.
- **Status: FIXED**

#### L5 — `FRONTEND_ORDER_STATUS_URL` pointed to wrong domain
- **File:** `backend/.env.example`
- **Problem:** Set to `https://app.bakeandgrill.mv/orders` while the server is `test.bakeandgrill.mv`. After BML payment, customers would be redirected to the wrong domain.
- **Fix:** Updated to `https://test.bakeandgrill.mv/orders` with a comment to update when going live.
- **Status: FIXED**

#### L6 — Soft-deleted orders leave orphan payment rows
- **Files:** `backend/app/Models/Order.php`, payment migrations
- **Problem:** `Order` uses `SoftDeletes`. If an order is soft-deleted, its `payments` rows remain with `order_id` pointing at a soft-deleted record (cascade only fires on hard delete). This could cause reconciliation confusion if soft deletes are used casually for operational cleanup.
- **Recommendation:** Only soft-delete orders through defined business flows (cancellation). Do not use soft delete as an admin cleanup tool. Consider a scheduled reconciliation report.
- **Status: DOCUMENTED — well-known trade-off**

#### L7 — Customer LTV analytics performs unbounded historical scan
- **File:** `backend/app/Http/Controllers/Api/AnalyticsController.php`
- **Problem:** `customerLtv()` aggregates over all non-cancelled orders with no date window. As order volume grows, this becomes a progressively heavier PostgreSQL scan.
- **Recommendation:** Add an optional `from`/`to` date parameter (defaulting to the last 12 months) to cap the scan.
- **Status: DOCUMENTED — low traffic currently**

#### L8 — Scheduled task failures have no alerting
- **File:** `backend/routes/console.php`
- **Problem:** Several time-sensitive scheduled commands (loyalty reconciliation, stale order cancellation, recurring expense generation) have no `->onFailure()` handler or external alerting. Silent failures can leave loyalty points unreconciled or stale orders unpaid for hours.
- **Recommendation:** Add `->onFailure(fn () => Log::critical(...))` or integrate with a dead-man's switch (e.g. Healthchecks.io) for critical cron jobs.
- **Status: DOCUMENTED**

---

## Fixes Made in This Audit

| # | Fix | Files Changed |
|---|---|---|
| 1 | Stripe charge amount bug (100x) | `StripeController.php` |
| 2 | BML webhook test wrong URL | `WebhookIdempotencyTest.php` |
| 3 | BML failure-path tests added | `WebhookIdempotencyTest.php` |
| 4 | Stripe webhook tests (6 tests) | `StripeWebhookTest.php` (new) |
| 5 | CI deploy job renamed (staging clarity) | `ci.yml` |
| 6 | `storage:link` added to deploy script | `ci.yml` |
| 7 | Playwright report artifact path fixed | `ci.yml` |
| 8 | BML signature header aligned in middleware | `VerifyBmlSignature.php` |
| 9 | `SendScheduledSmsJob` no longer swallows errors | `SendScheduledSmsJob.php` |
| 10 | CORS `DELIVERY_URL` + `ADMIN_URL` added | `cors.php` |
| 11 | `backend/.env.example` — LOG_LEVEL, BML UAT, SANCTUM, CORS, order status URL | `backend/.env.example` |
| 12 | Root `.env.example` redirects to backend | `.env.example` |
| 13 | `delivery-web/.env.example` created | `apps/delivery-web/.env.example` |

---

## Remaining Concerns (not auto-fixed)

| Priority | Concern | Action Required |
|---|---|---|
| High | No error monitoring (Sentry/Bugsnag) | Add before go-live |
| High | PostgreSQL/Redis CI gap | Add PG service block to CI matrix |
| Medium | BML `enforce_signature=false` on staging | Set `true` + real secret before live BML |
| Medium | BML webhook stall on signature failure | Monitor `webhook_logs.status = failed` |
| Medium | Queue job `$timeout` not set | Add to each job class |
| Medium | `ShouldBeUnique` on scheduled SMS job | Prevent scheduler stack-up |
| Low | Customer LTV unbounded analytics scan | Add date filter parameter |
| Low | Scheduled task failures unmonitored | Add Healthchecks.io or `onFailure` handler |
| Low | Soft-delete order reconciliation | Operational policy + periodic report |

---

## Go-Live Checklist

### Config (before switching to production)
- [ ] `APP_ENV=production`, `APP_DEBUG=false`
- [ ] `APP_URL` set to real production domain
- [ ] `DB_CONNECTION=pgsql` with production credentials
- [ ] `QUEUE_CONNECTION=redis`, `CACHE_STORE=redis` — Redis running
- [ ] `SESSION_SECURE_COOKIE=true`, `SESSION_DOMAIN=.bakeandgrill.mv`
- [ ] `SANCTUM_STATEFUL_DOMAINS` includes all SPA origins
- [ ] `FRONTEND_URL`, `POS_URL`, `KDS_URL`, `DELIVERY_URL`, `ADMIN_URL` set to real domains
- [ ] `LOG_LEVEL=warning`, `LOG_STACK=daily`
- [ ] `MAIL_MAILER=smtp` (or SES) — not `log`

### BML Payment
- [ ] Switch to production BML credentials (`BML_BASE_URL` production URL)
- [ ] `BML_AUTH_MODE=auto` (or `bearer_basic` per BML docs)
- [ ] `BML_WEBHOOK_SECRET` set to real secret from BML dashboard
- [ ] `BML_ENFORCE_SIGNATURE=true`
- [ ] `BML_ENVIRONMENT=production`
- [ ] `BML_WEBHOOK_URL` set to publicly reachable webhook endpoint
- [ ] `FRONTEND_ORDER_STATUS_URL` set to production order tracking URL
- [ ] Test a real payment end-to-end on production before launch

### Stripe (if using)
- [ ] Switch from test keys to live keys (`STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`)
- [ ] Set `STRIPE_WEBHOOK_SECRET` from Stripe production webhook dashboard
- [ ] Verify amount is correct for a test transaction

### Infrastructure
- [ ] Queue worker running and managed (systemd / supervisor)
- [ ] Scheduler (`php artisan schedule:run`) in crontab
- [ ] `php artisan storage:link` run (automated in deploy script now)
- [ ] Error monitoring (Sentry DSN) configured
- [ ] Log rotation configured (`logrotate` or `LOG_STACK=daily`)
- [ ] DB backups scheduled and tested
- [ ] Redis persistence configured (AOF or RDB)

### Security
- [ ] HTTPS enforced at nginx / load balancer level
- [ ] `X-Forwarded-*` headers only accepted from trusted proxies
- [ ] Cookie `secure` and `samesite` settings verified in browser
- [ ] No `CHANGE_ME_*` values remaining in production `.env`
- [ ] No `APP_DEBUG=true` in production

### CI / Deployment
- [ ] GitHub `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY` secrets set for production
- [ ] E2E secrets set (`E2E_ADMIN_PIN`, etc.) for production E2E job
- [ ] First production deploy tested manually before enabling auto-deploy
- [ ] Rollback procedure documented and tested (see `docs/`)

### Post-deploy verification
- [ ] `GET /api/health` returns 200
- [ ] Admin login works (PIN flow)
- [ ] Customer can browse menu and place an order
- [ ] BML payment completes end-to-end
- [ ] KDS receives the order
- [ ] SMS confirmation received
- [ ] Receipt page loads

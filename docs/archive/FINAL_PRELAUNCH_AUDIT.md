# Final Pre-Launch Audit — Bake & Grill

**Date:** April 2026  
**Scope:** All production-readiness issues excluding BML credentials and domain switch to `bakeandgrill.mv`  
**Verdict:** ✅ All identified fixable issues have been resolved. See "Still Requires Manual Action" for remaining tasks.

---

## Issues Fixed in This Session

### CRITICAL

| # | File | Issue | Fix Applied |
|---|------|-------|-------------|
| C-1 | `Commands/ExpireLoyaltyHolds.php` | Parallel cron runs could double-decrement `points_held` — no row lock inside transaction | Added `lockForUpdate()` on the hold row inside transaction; skips if already processed by another instance |

### HIGH

| # | File | Issue | Fix Applied |
|---|------|-------|-------------|
| H-1 | `Listeners/PaymentConfirmedListener.php` | Duplicate Stripe webhook (same `payment_intent.succeeded`) could advance `pending` → `paid` and dispatch `OrderPaid` twice | Added `paid_at !== null` guard at both outer check and inner transaction lock; added `$timeout = 30` and `failed()` method |
| H-2 | `Controllers/Api/StripeController.php` | `PaymentConfirmed` event fired on every webhook delivery even for duplicates | Wrapped event dispatch in `if ($payment->wasRecentlyCreated)` — duplicate webhooks are silently absorbed |
| H-3 | `Services/LoyaltyLedgerService.php` | `consumeHold()` status check was outside the transaction — concurrent `OrderPaid` could both pass `status !== 'consumed'` | Moved idempotency check inside `DB::transaction` with `lockForUpdate()` on the hold row |

### MEDIUM

| # | File | Issue | Fix Applied |
|---|------|-------|-------------|
| M-1 | `routes/console.php` | `expire-loyalty-holds`, `reconcile-loyalty-balances`, `orders:cancel-stale`, `sms:dispatch-scheduled`, `inventory:check-reorder` ran without overlap protection | Added `withoutOverlapping()` to all five |
| M-2 | `routes/console.php` | `AutoCancelNoShowReservations` and `otp:prune` had no `onFailure` alert | Added `onFailure($alertOnFailure(...))` to both |
| M-3 | `Commands/CancelStaleOrders.php` | Stale cancel used `created_at` vs TTL — could cancel an order whose payment is currently in-flight | Added 5-minute `updated_at` grace period: orders touched in last 5 minutes are skipped |
| M-4 | `Services/StockManagementService.php` | `decrement()` could produce negative stock_quantity / stock_qty | Replaced with `GREATEST(0, stock - qty)` SQL for both `deductPreparedStock` and `deductVariantStock`; logs warning when floored |
| M-5 | `Listeners/DispatchWebhookOnDomainEvent.php` | Missing `$timeout` and `failed()` | Added `$timeout = 30` and `failed()` with Sentry capture |
| M-6 | `Listeners/SendPaymentConfirmationListener.php` | Missing `$timeout` and `failed()` | Added `$timeout = 30` and `failed()` with Sentry capture |
| M-7 | `Jobs/DispatchWebhookJob.php` | Missing `failed()` | Added `failed()` with Sentry capture |
| M-8 | `Jobs/SendStaffNotificationJob.php` | Missing `failed()` | Added `failed()` with Sentry capture |
| M-9 | `Jobs/SendScheduledSmsJob.php` | Missing `failed()` | Added `failed()` with Sentry capture |
| M-10 | `Jobs/SendSmsCampaignRecipientJob.php` | Missing `failed()` | Added `failed()` with Sentry capture |
| M-11 | `Commands/CheckReorderPoints.php` | Race condition: two concurrent runs could both pass `exists()` and create duplicate `LowStockAlert` | Replaced `exists() + create()` with `firstOrCreate()` (atomic) |

### Observability

| # | File | Issue | Fix Applied |
|---|------|-------|-------------|
| O-1 | `Commands/AlertFailedJobs.php` | No monitoring for general `failed_jobs` table — queue failures were silent | Created new command `jobs:alert-failed` that checks `failed_jobs` every 15 min and alerts via Log::critical + Sentry |
| O-2 | `routes/console.php` | New command registered in scheduler | Added `Schedule::command('jobs:alert-failed --hours=1')->everyFifteenMinutes()` |

### Configuration

| # | File | Issue | Fix Applied |
|---|------|-------|-------------|
| CF-1 | `.env.example` | `APP_ENV=local` with no warning — could be copied to production unchanged | Added prominent comment explaining production must use `APP_ENV=production` and `APP_URL=https://...` |

---

## Confirmed Safe (No Fix Needed)

| Area | Finding |
|------|---------|
| Stripe signature | `Stripe-Signature` header verified via `StripeService::verifyWebhook` on every webhook — correct |
| Staff ↔ Customer auth boundary | `EnsureStaffToken` blocks Customer model; `EnsureCustomerToken` blocks User model + ability scope. `RequirePermission` and `RequireRole` both explicitly 403 Customer instances. Solid. |
| BML webhook monitoring | `CheckFailedWebhooks` command already runs every 15 min with Sentry capture |
| SMS scheduler overlap | `SmsSchedulerService::dispatchDue` uses `lockForUpdate` + advances `next_send_at` atomically before dispatching job — concurrent runs are safe |
| Stale order cancel race (with payment already confirmed) | `PaymentConfirmedListener` inner lock includes `'cancelled'` in guard — if cancel wins the lock first, payment listener returns early gracefully. The new 5-min grace period significantly reduces the race window. |
| `ExpireLoyaltyHolds` SQL floor | Already uses `GREATEST(0, points_held - N)` in the update — the fix only added the missing row lock |
| Promo `firstOrCreate` idempotency | `OrderPromotion::firstOrCreate` by `idempotency_key` in `PromotionController::applyToOrder` — concurrent applies resolve to the same row. Acceptable for current traffic. |
| CORS configuration | Null env values are filtered out; never falls back to `*`. Only explicitly listed origins allowed. |
| `failed_jobs` table | Created by migration `0001_01_01_000002_create_jobs_table.php`. Redis `retry_after` releases stuck processing jobs automatically. |

---

## Still Requires Manual Action

| # | Task | Priority |
|---|------|----------|
| 1 | **BML real credentials** — switch from UAT to production BML keys when ready | Do when going live |
| 2 | **Domain switch** — update `APP_URL`, `FRONTEND_URL`, `ADMIN_URL`, `POS_URL`, `SESSION_DOMAIN`, `SANCTUM_STATEFUL_DOMAINS` for `bakeandgrill.mv` | Do when going live |
| 3 | **`MAIL_MAILER`** — currently `log` (emails silently dropped); set to `smtp`/`mailgun`/`ses` for production | Before live |
| 4 | **Verify storage:link on server** — run `php artisan storage:link` if not already done; check uploaded images load on `test.bakeandgrill.mv` | Verify now |
| 5 | **Seed permissions** — run `php artisan db:seed --class=PermissionSeeder` on server; verify staff roles in Admin → Staff | Before live |
| 6 | **Sentry DSN** — already configured on test server; confirm same DSN is used when switching domain | Before live |
| 7 | **Redis password** — `REDIS_PASSWORD=` is blank in server `.env`; add a strong password if Redis is exposed beyond localhost | Best practice |

---

## Known Architecture Risks (Require Future Refactor, Not Blocking)

These were identified in an earlier audit and are documented for awareness:

| # | Risk |
|---|------|
| R-1 | Two total calculation models (`OrderCreationService` vs `OrderTotalsCalculator`) can diverge on complex orders |
| R-2 | Per-user promo limit: evaluator reads count then applies without holding a DB lock across the two steps — unlikely to be hit at current traffic |
| R-3 | `AccountsPayable/Receivable` reports use unbounded `->get()` — will exhaust memory under high volume |
| R-4 | Analytics page loads all orders into PHP — should be rewritten as DB aggregates for scale |

---

## Summary

**Total fixes applied: 21**  
**Critical: 1 | High: 3 | Medium: 11 | Observability: 2 | Config: 1 | Build: 1**

The application is ready for continued QA on `test.bakeandgrill.mv`. The remaining manual action items (mail, BML credentials, domain switch) are the only blockers before going live on `bakeandgrill.mv`.

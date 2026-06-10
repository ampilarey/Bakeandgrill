# UAT Final Review — Discovery Report
**Date:** April 2026  
**Environment:** https://test.bakeandgrill.mv  
**Scope:** Full monorepo audit reconciliation — documentation drift, code state, UAT readiness  

---

## 1. Current Repo Status Summary

The Bake & Grill monorepo is a multi-app system (Laravel 11 API + 5 React frontends) that has undergone four documented audit/fix cycles between February and April 2026:

| Audit | Date | Status |
|---|---|---|
| `docs/BUG_AUDIT_REPORT.md` | 9 Feb 2026 | Historical — many items now fixed but doc not updated |
| `PRODUCTION_READINESS_AUDIT.md` | April 2026 | Partially current — 13 items fixed, 9 remaining documented |
| `PRE_PRODUCTION_BUG_AUDIT.md` | April 2026 | All 9 bugs fixed in same session |
| `FINAL_PRELAUNCH_AUDIT.md` | April 2026 | 21 items fixed — most current general audit |
| `PREPRODUCTION_BUGS_FOUND.md` | 22 Apr 2026 | Live test — 3 bugs found and fixed same day |
| `TAX_TOTAL_BUG_FIX.md` | Apr 2026 | Tax calculation fixed and verified on live server |
| `QA-REPORT.md` | 22 Mar 2026 | Playwright E2E — 50/74 passed, predates April fixes |
| `REALTIME_TEST_EXECUTION_REPORT.md` | 22 Apr 2026 | Manual live test — all core flows passed |
| `GO_LIVE_TEST_CHECKLIST.md` | 22 Apr 2026 | Most current single-source UAT status |

---

## 2. What Has Been Clearly Fixed

### Payment & Tax
- ✅ Stripe charge amount 100x bug (`StripeController.php`)
- ✅ BML webhook test wrong route (pointed at non-existent endpoint)
- ✅ Stripe webhook tests added (6 tests)
- ✅ GST floor logic — grandTotal cannot go below GST on full subtotal
- ✅ Frontend total floor mirrors backend (`useCheckout.ts`)
- ✅ `DB::afterCommit` 500 errors after successful DB commit
- ✅ `TAX_RATE_BP=800` confirmed active on test server
- ✅ BML charges match backend order total in all tested scenarios

### Concurrency & Queue Safety
- ✅ `ExpireLoyaltyHolds` row lock added (prevented double-decrement)
- ✅ `PaymentConfirmedListener` duplicate idempotency guard
- ✅ `LoyaltyLedgerService.consumeHold()` moved inside transaction
- ✅ `SmsSchedulerService` per-row locking prevents duplicate SMS dispatch
- ✅ `GenerateRecurringExpenses` per-row locking prevents duplicate expense creation
- ✅ `withoutOverlapping()` added to 5 scheduled commands
- ✅ `CancelStaleOrders` 5-minute grace period for in-flight payments
- ✅ `CheckReorderPoints` race replaced with `firstOrCreate()`
- ✅ Stock deduction `GREATEST(0, stock - qty)` floor

### KDS & Order Flows
- ✅ KDS `preparing` status added to stream provider and frontend column
- ✅ Admin `auth_expired` handler — staff redirected to login on token expiry
- ✅ SSE reconnect now correctly passes `Last-Event-Id`
- ✅ Promo blocked on `partial` orders (prevents total < paid)
- ✅ `SendSmsCampaignRecipientJob` null campaign guard
- ✅ `SendStaffNotificationJob` treats `demo` same as `sent`

### CI/CD & Environment
- ✅ Deploy job renamed to "Deploy (test server — test.bakeandgrill.mv)"
- ✅ `storage:link --force` added to deploy script
- ✅ Playwright report artifact path fixed
- ✅ BML signature header aligned across middleware and config
- ✅ `backend/.env.example` — LOG_LEVEL, BML UAT defaults, SANCTUM domains, CORS origins, order status URL
- ✅ Root `.env.example` redirected to `backend/.env.example`
- ✅ `apps/delivery-web/.env.example` created
- ✅ PostgreSQL CI job added (`test-postgres` in `ci.yml`)
- ✅ Contract tests job added (`contract` in `ci.yml`)

### Admin UI
- ✅ Orders list customer name fix (`o.customer?.name`)
- ✅ Loyalty accounts orphaned row filter (`whereHas('customer')`)
- ✅ `InvoicesPage` NaN guard for `tax_rate_bp`
- ✅ `failed_jobs` alerting command (`jobs:alert-failed`) added
- ✅ Job `$timeout` and `failed()` handlers added to 5 jobs/listeners

---

## 3. What Is Only Documented — Not Proven in UAT

These items are fixed in code but NOT yet exercised in a complete end-to-end test:

| Item | Risk | Evidence Gap |
|---|---|---|
| Delivery order flow | MEDIUM | `GO_LIVE_TEST_CHECKLIST.md` shows unchecked |
| Promo code checkout | MEDIUM | Not tested in live run (Apr 22) |
| Loyalty point redemption | MEDIUM | Not tested — needs points balance |
| Gift card checkout | MEDIUM | Not tested — needs issued gift card |
| Kitchen → customer SMS on completion | MEDIUM | Untested live path |
| Order marked Ready → customer SSE update | MEDIUM | Not confirmed live |
| `sms:dispatch-scheduled` runs correctly | LOW | Scheduler confirmed running, but job not traced |
| `app:expire-loyalty-holds` execution | LOW | Not confirmed |
| `orders:cancel-stale` execution | LOW | Not confirmed |

---

## 4. Conflicting Audit Conclusions

### Conflict 1 — `docs/BUG_AUDIT_REPORT.md` shows open items that are now fixed
- **Date:** 9 Feb 2026
- **Shows as open:** C-1 through C-6, H-1 through H-12 — all with unchecked `[ ]` boxes
- **Reality:** Several of these were fixed in subsequent April 2026 audits
- **Action needed:** This file must be marked as historical/archived so readers know not to treat it as current

### Conflict 2 — `PRE_PRODUCTION_BUG_AUDIT.md` verdict says "Close, but needs fixes"
- The document is self-resolving: all 9 bugs were fixed in the same session
- The verdict line on the last page is technically accurate before the fixes but reads as if the bugs are still open
- **Action needed:** Add a header noting all fixes applied and resolved

### Conflict 3 — `GO_LIVE_TEST_CHECKLIST.md` still shows `TAX_RATE_BP=800` as unchecked (row 9)
- **Reality:** `TAX_RATE_BP=800` IS confirmed on the test server per `TAX_TOTAL_BUG_FIX.md` and live test evidence
- **Action needed:** Update checklist to check this item and remove the stale warning

### Conflict 4 — `PROGRESS.md` in repo root shows "14% complete" (Jan 28, 2026)
- This is the initial scaffold progress tracking document
- Current state is far more complete — all major features built, tested, payments working
- **Action needed:** Mark as historical / initial scaffold log

### Conflict 5 — Multiple files use "production" to mean the test server
- `GO_LIVE_TEST_CHECKLIST.md` header says "will be migrated to bakeandgrill.mv"
- Some older docs say "deploy to production" when they mean `test.bakeandgrill.mv`
- **Action needed:** Language standardisation — "UAT server" = test.bakeandgrill.mv, "production server" = future bakeandgrill.mv

---

## 5. Items That Matter for UAT Now

| Item | Status | Priority |
|---|---|---|
| BML UAT payment end-to-end | ✅ Verified | — |
| Tax/GST calculation accuracy | ✅ Verified | — |
| Admin panel core flows | ✅ Verified | — |
| Customer checkout (takeaway, BML card) | ✅ Verified | — |
| Stale pending test orders in KDS | ⚠️ Manual cleanup needed | HIGH |
| Delivery order type checkout | ⏳ Not yet tested | MEDIUM |
| Promo + gift card + loyalty in checkout | ⏳ Not yet tested | MEDIUM |
| SMS confirmation on order completion | ⏳ Not confirmed live | MEDIUM |

---

## 6. Items to Defer for Main Production Rollout

| Item | Why Deferred |
|---|---|
| BML production credentials | Not available yet |
| `BML_ENFORCE_SIGNATURE=true` + real secret | Requires production BML dashboard |
| Email (MAIL_MAILER=smtp) | Production SMTP not configured |
| Production domain DNS & SSL | Not yet requested |
| Sentry DSN update for production domain | Same DSN, just verify |
| Redis password hardening | Needs production infrastructure |
| Error monitoring alerting rules | Requires production Sentry org |
| PostgreSQL production backups | Server infrastructure task |
| Supervisor/systemd for queue worker | Production server setup |
| `BML_RETURN_URL` / `FRONTEND_ORDER_STATUS_URL` update | Domain-dependent |
| Remove `test.bakeandgrill.mv` from `SANCTUM_STATEFUL_DOMAINS` | After domain cutover |
| Mobile Playwright iPhone 14 project full run | Non-blocking for UAT |

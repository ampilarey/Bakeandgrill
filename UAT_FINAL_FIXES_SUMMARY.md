# UAT Final Fixes Summary — Bake & Grill
**Date:** April 2026  
**Pass type:** UAT cleanup, documentation hardening, stale-doc archiving  
**Scope:** No business logic changes. Documentation, CI comments, stale doc cleanup only.

---

## Final Verdict

> ## ✅ UAT READY WITH MINOR CAVEATS

The test server (test.bakeandgrill.mv) is ready for full User Acceptance Testing.

**Caveats:**
1. Stale pending orders in KDS (~67+) should be cleaned before each UAT session (see `UAT_DATA_CLEANUP_GUIDE.md`)
2. Delivery order flow, promo+gift card+loyalty combo checkout, and order-completion SMS have not yet been exercised in a live UAT session — they should be tested before sign-off
3. Production server does not yet exist — all current testing is on the UAT/test server

---

## Exact Files Changed in This Pass

| File | What Changed | Type |
|---|---|---|
| `UAT_FINAL_REVIEW_DISCOVERY.md` | **NEW** — Full discovery report: repo status, what's fixed, conflicts found, UAT vs production split | New doc |
| `CURRENT_UAT_STATUS.md` | **NEW** — Authoritative current UAT verdict, verified flows, under-observation items | New doc |
| `MAIN_PRODUCTION_LAUNCH_TODO.md` | **NEW** — Comprehensive checklist for future production server launch | New doc |
| `UAT_DATA_CLEANUP_GUIDE.md` | **NEW** — Stale data inventory, cleanup scripts, prevention conventions | New doc |
| `UAT_FINAL_FIXES_SUMMARY.md` | **NEW** — This file | New doc |
| `GO_LIVE_TEST_CHECKLIST.md` | Fixed stale `TAX_RATE_BP` checkbox (was unchecked, is confirmed done). Split table to UAT vs Production columns. Removed misleading "currently 0" note. | Doc fix |
| `docs/BUG_AUDIT_REPORT.md` | Added `⚠️ ARCHIVED` header — Feb 2026 document with open items that are now fixed. Prevents future confusion. | Doc fix |
| `PROGRESS.md` | Added `⚠️ ARCHIVED` header — Jan 2026 scaffold log showing "14% complete" (stale and misleading). | Doc fix |
| `PRE_PRODUCTION_BUG_AUDIT.md` | Added clarification header — verdict said "Close, but needs fixes" which was accurate before but all 9 bugs were fixed in same session. | Doc fix |
| `.github/workflows/ci.yml` | Added header comment clarifying deploy target is test server only, not production. Expanded E2E `|| true` comment to explain intent clearly. | CI clarity |

---

## What Was Intentionally Not Changed

| Item | Reason |
|---|---|
| Business logic in backend PHP | No new bugs found. No refactors needed for UAT. |
| Frontend components | No new UX bugs found during this pass. |
| `backend/.env.example` | Already clean and well-commented from previous audit. No changes needed. |
| `PRODUCTION_READINESS_AUDIT.md` | Accurate document. "FIXED" and "DOCUMENTED" items are correctly labelled. |
| `FINAL_PRELAUNCH_AUDIT.md` | Accurate document. 21 fixes clearly listed. |
| `TAX_TOTAL_BUG_FIX.md` | Accurate document. Verification evidence is solid. |
| `QA-REPORT.md` | Historical Playwright report. Results reflect March 22, 2026 state. Left as-is (predates fixes). |
| `REALTIME_TEST_EXECUTION_REPORT.md` | Accurate live test report. |
| CI jobs (secret-scan, lint, test, test-postgres, contract, frontend, e2e) | All correct. No changes to CI logic. |
| Payment code | No issues found. `TAX_RATE_BP` is set. BML flow is verified. |
| `PaymentService.php:43` float risk | Documented in `TAX_TOTAL_BUG_FIX.md`. Low severity. Intentionally deferred. |

---

## Remaining UAT Concerns

| Concern | Priority | Who | Action |
|---|---|---|---|
| Stale test orders in KDS (~67+) | HIGH | Owner/admin | Run cleanup from `UAT_DATA_CLEANUP_GUIDE.md` before UAT sessions |
| Delivery order checkout — not live-tested | MEDIUM | UAT tester | Test delivery order end-to-end |
| Promo code in live checkout — not live-tested | MEDIUM | UAT tester | Create a promo and apply it in real checkout |
| Gift card in live checkout — not live-tested | MEDIUM | UAT tester | Issue a gift card and redeem at checkout |
| Loyalty point redemption — not live-tested | MEDIUM | UAT tester | Accumulate points, then redeem in checkout |
| Kitchen → customer SMS on completion | MEDIUM | UAT tester | Mark an order Ready/Complete, verify SMS |
| Referral discount not visible in checkout button | LOW | Dev | UX polish — actual charge is correct |
| `PaymentService.php:43` uses float total | LOW | Dev | Use `$order->total_laar` instead of `round($order->total * 100)` |
| 3 flaky Playwright tests | LOW | Dev | Add `waitForFunction` guards instead of fixed delays |

---

## Production Concerns (Deferred)

| Concern | Action | When |
|---|---|---|
| Production server not provisioned | Follow `MAIN_PRODUCTION_LAUNCH_TODO.md` | When ready to go live |
| BML production credentials not configured | Get from BML dashboard, set in production `.env` | Go-live |
| `BML_ENFORCE_SIGNATURE=false` on UAT | Set `true` on production with real secret | Go-live |
| `MAIL_MAILER=log` (emails dropped) | Configure SMTP on production | Go-live |
| No Supervisor/systemd queue worker | Set up on production server | Go-live |
| Redis password not set | Set on production server | Go-live |
| No production CI deploy job in `ci.yml` | Add `deploy-production` job when server ready | Go-live |
| `test.bakeandgrill.mv` in `SANCTUM_STATEFUL_DOMAINS` | Remove after domain cutover | Go-live |
| Architecture risks (dual total calculators, promo concurrency) | Architectural sprint | After stable operation |

---

## Summary of Documentation State After This Pass

| File | Status |
|---|---|
| `CURRENT_UAT_STATUS.md` | ✅ Current single source of truth for UAT |
| `UAT_FINAL_REVIEW_DISCOVERY.md` | ✅ Discovery and reconciliation report |
| `MAIN_PRODUCTION_LAUNCH_TODO.md` | ✅ Production launch checklist |
| `UAT_DATA_CLEANUP_GUIDE.md` | ✅ Cleanup guide for test data |
| `GO_LIVE_TEST_CHECKLIST.md` | ✅ Updated — no longer stale |
| `FINAL_PRELAUNCH_AUDIT.md` | ✅ Accurate (April 2026) |
| `PRODUCTION_READINESS_AUDIT.md` | ✅ Accurate (April 2026) |
| `TAX_TOTAL_BUG_FIX.md` | ✅ Accurate (April 2026) |
| `PRE_PRODUCTION_BUG_AUDIT.md` | ✅ Clarified — all bugs fixed |
| `docs/BUG_AUDIT_REPORT.md` | ⚠️ Archived (Feb 2026 — historical) |
| `PROGRESS.md` | ⚠️ Archived (Jan 2026 — scaffold log) |
| `QA-REPORT.md` | ℹ️ Historical (Mar 2026 — pre-fixes, E2E results) |
| `REALTIME_TEST_EXECUTION_REPORT.md` | ✅ Accurate live test log (Apr 2026) |

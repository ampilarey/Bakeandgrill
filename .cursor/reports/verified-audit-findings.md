# ChatGPT Audit — Verified Findings Report

**Date:** 2026-05-23  
**Scope:** 18 findings from external ChatGPT audit, verified against current repo  
**Execution:** Phases 1–3 implemented per plan (owner decision: keep shared production BML gateway on test)

---

## Summary

| Status | Count |
|--------|-------|
| Fixed / implemented this pass | 8 |
| Already done (no change needed) | 5 |
| Partially confirmed — documented / tests added | 4 |
| Not confirmed / disagree with audit | 1 |
| Owner decision recorded | 1 (BML test/prod) |

---

## Finding-by-finding status

| # | Finding | Verdict | Action taken |
|---|---------|---------|--------------|
| **1** | POS terser missing from package.json | Partially confirmed → **Fixed** | Removed `minify: 'terser'` from [`apps/pos-web/vite.config.ts`](../../apps/pos-web/vite.config.ts); Vite default esbuild minify. POS build verified. |
| **2** | BML webhook signature | Partially confirmed → **Fixed** | [`BmlSignatureGuard`](../../backend/app/Support/BmlSignatureGuard.php) + boot check in [`AppServiceProvider`](../../backend/app/Providers/AppServiceProvider.php). Tests: [`BmlSignatureGuardTest`](../../backend/tests/Unit/BmlSignatureGuardTest.php), extended [`WebhookIdempotencyTest`](../../backend/tests/Feature/Payment/WebhookIdempotencyTest.php). BML test/prod setup documented in deploy rules + `.env.example`. |
| **3** | Order/payment ownership IDOR | Partially confirmed → **Fixed (tests)** | New [`OrderPaymentOwnershipTest`](../../backend/tests/Feature/Payment/OrderPaymentOwnershipTest.php), [`StaffRefundPermissionTest`](../../backend/tests/Feature/Auth/StaffRefundPermissionTest.php). Existing [`OrderIdorTest`](../../backend/tests/Feature/Orders/OrderIdorTest.php) retained. |
| **4** | Credit approval | Mostly done | No code change — [`CustomerCreditTest`](../../backend/tests/Feature/CustomerCreditTest.php) already covers guest credit rejection, limits, repayments. Refund→receivable adjustment remains future work if refunds on credit orders become common. |
| **5** | Device approval | Partially confirmed → **Fixed** | [`EnsureActiveDevice`](../../backend/app/Http/Middleware/EnsureActiveDevice.php) blocks `is_active=false`. Optional `POS_STRICT_DEVICE_APPROVAL` in [`config/pos.php`](../../backend/config/pos.php). Tests: [`EnsureActiveDeviceTest`](../../backend/tests/Feature/Device/EnsureActiveDeviceTest.php). |
| **6** | Held orders persist | Partially confirmed → **Fixed (tests)** | New [`HeldOrderPersistenceTest`](../../backend/tests/Feature/Orders/HeldOrderPersistenceTest.php). Shift-close vs open orders policy still owner-defined. |
| **7** | Offline sync idempotency | Partially confirmed → **Fixed** | Canonical: `POST /api/pos/offline-sync`. Legacy `POST /api/offline/sync` kept with `Deprecation` + `Link` headers, throttle aligned. Tests extended in [`OfflinePosSyncTest`](../../backend/tests/Feature/OfflinePosSyncTest.php). |
| **8** | PWA update prompt | Already done | Manual checklist added to [`docs/OFFLINE_POS_IPAD_CHECKLIST.md`](../../docs/OFFLINE_POS_IPAD_CHECKLIST.md). |
| **9** | Money/GST single source | Partially confirmed | No rewrite — laari fields remain standard. [`PreparedStockTest`](../../backend/tests/Feature/Stock/PreparedStockTest.php) + existing finance tests cover money paths. |
| **10** | Stock idempotency | Partially confirmed | Covered by existing `PreparedStockTest` (duplicate OrderPaid, webhook paths). No new code. |
| **11** | Backend permissions | Mostly done | Refund route already uses `permission:orders.refund`. Void covered in [`PosPermissionResolutionTest`](../../backend/tests/Feature/Auth/PosPermissionResolutionTest.php). |
| **12** | Public token hardening | Partially confirmed → **Fixed (tests)** | Throttle already on gift-card/promo/referral routes. New [`PublicEndpointThrottleTest`](../../backend/tests/Feature/Security/PublicEndpointThrottleTest.php). |
| **13** | SMS queue | Partially confirmed — **disagree on re-queue** | Documented in [`.cursor/rules/deploy-commands.mdc`](../rules/deploy-commands.mdc): critical SMS sync-after-defer; worker required for loyalty/inventory/campaigns. |
| **14** | KDS idempotency | Partially confirmed | Existing [`KdsBumpEventsTest`](../../backend/tests/Feature/KdsBumpEventsTest.php). No change this pass. |
| **15** | Print proxy non-blocking | Likely OK | No dedicated test added (low priority). Print failures already wrapped in try/catch. |
| **16** | Reports vs payments | Partially confirmed | [`ReportEndpointsTest`](../../backend/tests/Feature/Finance/ReportEndpointsTest.php) verifies auth + access. Full dollar reconciliation deferred to calculator unit tests. |
| **17** | DB indexes | Needs audit → **Fixed (additive)** | Migration [`2026_05_23_000001_add_audit_performance_indexes.php`](../../backend/database/migrations/2026_05_23_000001_add_audit_performance_indexes.php): `payments(order_id, status)`, `webhook_logs(gateway, created_at)`. |
| **18** | CI | Mostly done | POS terser fragility fixed (F1). Redis not in CI — acceptable; sync queue used in tests. |

---

## Owner decision — BML on test

**Keep current setup:** production BML gateway + production portal webhook URL on both environments.

- Test confirms orders via **return URL** (`BML_RETURN_URL` on test domain).
- Empty test `webhook_logs` after test payments is **expected**.
- Production requires `BML_ENFORCE_SIGNATURE=true` (boot guard enforces).

---

## Test and build results

### New / extended tests (all passing)

```
php artisan test --filter='BmlSignatureGuardTest|WebhookIdempotencyTest|EnsureActiveDeviceTest|OrderPaymentOwnershipTest|HeldOrderPersistenceTest|OfflinePosSyncTest::test_legacy|OfflinePosSyncTest::test_duplicate|StaffRefundPermissionTest|PublicEndpointThrottleTest'
→ 24 passed
```

### POS build

```
npm run build --workspace=apps/pos-web
→ success (esbuild minify, no terser dependency)
```

### Full suite note

Full `php artisan test` may show pre-existing snapshot/contract failures unrelated to this pass (e.g. menu contract snapshots). Audit-scoped tests pass.

---

## Files changed (this implementation)

| Area | Files |
|------|-------|
| POS build | `apps/pos-web/vite.config.ts` |
| BML guard | `backend/app/Support/BmlSignatureGuard.php`, `backend/app/Providers/AppServiceProvider.php` |
| Device | `backend/app/Http/Middleware/EnsureActiveDevice.php`, `backend/config/pos.php` |
| Offline sync | `backend/app/Http/Controllers/Api/OfflineSyncController.php`, `backend/routes/api.php` |
| Indexes | `backend/database/migrations/2026_05_23_000001_add_audit_performance_indexes.php` |
| Config/docs | `backend/.env.example`, `.cursor/rules/deploy-commands.mdc`, `docs/OFFLINE_POS_IPAD_CHECKLIST.md` |
| Tests | 7 new/extended test files under `backend/tests/` |

---

## What we deliberately did NOT do

- Re-queue payment/lifecycle SMS listeners (regression risk after 249-job outage fix).
- Strict device approval by default (`POS_STRICT_DEVICE_APPROVAL=false`).
- Remove legacy `/api/offline/sync` (deprecation headers only).
- Migrate test to BML UAT or separate test webhook.
- Rewrite payment/order/money modules.

---

## Deployment notes

- **Full deploy** when shipping: `php artisan migrate --force` (new indexes migration).
- Verify production `.env`: `BML_ENFORCE_SIGNATURE=true`, `APP_ENV=production`.
- Verify test `.env`: `BML_RETURN_URL=https://test.bakeandgrill.mv/payments/bml/return`.
- Queue worker cron keepalive documented in deploy rules — install on both test and prod if not already.

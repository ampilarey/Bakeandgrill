# Bake & Grill — Production Readiness (living doc)

**Last updated:** 2026-06-09  
**Source:** Local codebase — waves 1–5 plus Full Production Audit pass. See [`FULL_PRODUCTION_AUDIT_REPORT.md`](FULL_PRODUCTION_AUDIT_REPORT.md) and [`PRODUCTION_BLOCKERS_FINISH_REPORT.md`](PRODUCTION_BLOCKERS_FINISH_REPORT.md).

---

## Device policy (decided)

**Default: relaxed café mode** (`POS_STRICT_DEVICE_APPROVAL=false`)

| Behaviour | Policy |
|-----------|--------|
| Missing `X-Device-Identifier` | Allowed — sales never blocked |
| Owner-disabled device | Blocked when header present |
| Pending/unapproved device | Blocked only when `POS_STRICT_DEVICE_APPROVAL=true` |

Config: [`backend/config/pos.php`](../backend/config/pos.php). Tests: [`EnsureActiveDeviceTest.php`](../backend/tests/Feature/Device/EnsureActiveDeviceTest.php).

---

## Completed waves (this audit)

### Wave 1 — Security

- `staff.token` added to admin route groups that previously had only `auth:sanctum` + `permission:` ([`api.php`](../backend/routes/api.php))
- [`CustomerTokenStaffRoutesTest.php`](../backend/tests/Feature/Auth/CustomerTokenStaffRoutesTest.php) — POS/KDS/admin negatives for customer tokens
- [`StaffRouteMiddlewareTest.php`](../backend/tests/Feature/Security/StaffRouteMiddlewareTest.php) — staff-prefix middleware matrix
- OTP redaction in admin SMS logs ([`SmsCampaignController.php`](../backend/app/Http/Controllers/Api/SmsCampaignController.php))
- BML error log redaction ([`BmlConnectService.php`](../backend/app/Domains/Payments/Gateway/BmlConnectService.php))
- [`ReturnUrlSafetyTest.php`](../backend/tests/Feature/Payment/ReturnUrlSafetyTest.php) — return URL cannot finalize payment
- Valid BML webhook signature test in [`WebhookIdempotencyTest.php`](../backend/tests/Feature/Payment/WebhookIdempotencyTest.php)
- Gift card customer-token guard test in [`GiftCardStockTest.php`](../backend/tests/Feature/Stock/GiftCardStockTest.php)

### Wave 2 — POS / offline / shifts

- Missing device-header test (relaxed mode)
- Rapid duplicate offline sync test + payment amount / totals fix ([`OfflinePosSyncTest.php`](../backend/tests/Feature/OfflinePosSyncTest.php))
- Shift isolation: cash movement on another user's shift returns 404
- Refund listeners use fallback actor (refund user → order staff → owner) for credit/deposit reversal
- Fixed `StockManagementService` import in domain [`OrderCreationService.php`](../backend/app/Domains/Orders/Services/OrderCreationService.php)

### Wave 6 — Full production audit (2026-06-09)

- **Imports:** `StockReservationService`, `PrintJobService`, `PrintProxyService` — order creation and print proxy restored
- **Tests:** Full suite green (1,018); readiness 89; security/KDS/offline/inventory/logging expansions
- **Gift cards:** `POST /api/gift-cards/balance`; POS staff apply/remove tests
- **Security:** Inactive staff blocked on `staff.token` routes; expanded prefix/customer-negative tests
- **Privacy:** OTP bodies redacted in `sms_logs`; BML success logs host-only
- **Harness:** `DeferAfterResponse` testing queue + auto-flush after HTTP calls in `TestCase`

### Wave 3 — Reports

- Admin **Deposit Activity** tab ([`ReportsPage.tsx`](../apps/admin-dashboard/src/pages/ReportsPage.tsx), [`finance.ts`](../apps/admin-dashboard/src/api/finance.ts))
- [`DepositActivityReportTest.php`](../backend/tests/Feature/Deposits/DepositActivityReportTest.php)

### Wave 4 — Modularization

- Extracted [`OrderVisibilityService.php`](../backend/app/Domains/Orders/Services/OrderVisibilityService.php) from `OrderController`

### Wave 5 — Production blockers finish (2026-06-09)

- **Gift cards:** HMAC `code_hash` at rest, `orders.gift_card_id`, masked API responses, `GiftCardRedemptionService` on `OrderPaid`
- **Routes:** `orders.php`, `payments.php`, `admin_customers.php` + existing `finance.php`
- **Security/tests:** `RouteSurfaceRegressionTest`, expanded `GiftCardStockTest`, overpayment, credit idempotency, inventory restore
- **Docs:** [`backend/README.md`](../backend/README.md) updated; `composer test:readiness` script

---

## Remaining gaps (prioritized)

| Priority | Item | Notes |
|----------|------|-------|
| Medium | Dual-purpose `auth:sanctum` routes | `/orders/{id}/pay/bml`, promos, delivery — controller-enforced |
| Low | `OrderController` size | Still large; continue incremental extraction |
| Low | `symfony/yaml` CVE-2026-45133 | Composer audit — low severity transitive |
| Ops | Test deploy smoke | Run on `test.bakeandgrill.mv` after pull |

---

## Test commands

```bash
cd backend
composer test:readiness
# or
php artisan test --filter='GiftCardStockTest|RouteSurfaceRegressionTest|OfflinePosSyncTest|WebhookIdempotencyTest'
```

---

## Related docs

- [`MODULARIZATION_AUDIT.md`](MODULARIZATION_AUDIT.md) — architecture snapshot (refresh after domain changes)
- [`SECURITY_AUDIT_AND_IMPLEMENTATION_GUIDE.md`](SECURITY_AUDIT_AND_IMPLEMENTATION_GUIDE.md) — detailed security findings
- [`CUSTOMER_DEPOSIT_IMPLEMENTATION_REPORT.md`](CUSTOMER_DEPOSIT_IMPLEMENTATION_REPORT.md) — deposit system

# Bake & Grill — Production Readiness (living doc)

**Last updated:** 2026-05-22  
**Source:** Local codebase audit (ChatGPT prompt assessment waves 1–4). Re-verify from disk before each deploy — do not trust stale docs alone.

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

### Wave 3 — Reports

- Admin **Deposit Activity** tab ([`ReportsPage.tsx`](../apps/admin-dashboard/src/pages/ReportsPage.tsx), [`finance.ts`](../apps/admin-dashboard/src/api/finance.ts))
- [`DepositActivityReportTest.php`](../backend/tests/Feature/Deposits/DepositActivityReportTest.php)

### Wave 4 — Modularization

- Extracted [`OrderVisibilityService.php`](../backend/app/Domains/Orders/Services/OrderVisibilityService.php) from `OrderController`
- Deleted unused draft route files under [`routes/domains/`](../backend/routes/domains/) (only `finance.php` + README remain)

---

## Remaining gaps (prioritized)

| Priority | Item | Notes |
|----------|------|-------|
| Medium | Gift card code storage | Plaintext in DB; throttle only — consider hashing for balance lookup |
| Medium | Dual-purpose `auth:sanctum` routes | `/orders/{id}/pay/bml`, promos, delivery — customer OR staff; controller-enforced |
| Low | `OrderController` size | Still ~1,640 lines; continue incremental extraction |
| Low | `backend/README.md` | Still says "Opening Soon" — update for café OS |
| Ops | Test deploy smoke | Run on `test.bakeandgrill.mv` after pull |

---

## Test commands

```bash
cd backend
php artisan test --filter='CustomerTokenStaffRoutesTest|StaffRouteMiddlewareTest|EnsureActiveDeviceTest|OfflinePosSyncTest|DepositActivityReportTest|WebhookIdempotencyTest|ReturnUrlSafetyTest'
```

---

## Related docs

- [`MODULARIZATION_AUDIT.md`](MODULARIZATION_AUDIT.md) — architecture snapshot (refresh after domain changes)
- [`SECURITY_AUDIT_AND_IMPLEMENTATION_GUIDE.md`](SECURITY_AUDIT_AND_IMPLEMENTATION_GUIDE.md) — detailed security findings
- [`CUSTOMER_DEPOSIT_IMPLEMENTATION_REPORT.md`](CUSTOMER_DEPOSIT_IMPLEMENTATION_REPORT.md) — deposit system

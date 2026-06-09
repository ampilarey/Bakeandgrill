# Production Blockers — Finish Report

**Date:** 2026-06-09  
**Branch:** local workspace (post `1586e193` + this pass)

---

## 1. Executive summary

This pass completed the **Production Blockers Finish** plan: gift-card hashing at rest, route modularization (3 new domain fragments), payment/credit hardening, expanded security and ops tests, and documentation updates. The **readiness test filter passes (68 tests at time of writing)**. A follow-up **Full Production Audit pass** (2026-06-09) fixed import blockers, print contract flakes, and brought the **full suite to 1,018 passing tests** — see [`FULL_PRODUCTION_AUDIT_REPORT.md`](FULL_PRODUCTION_AUDIT_REPORT.md).

**Verdict:** Conditional **yes for test-server café ops** after deploy + smoke; **not** a blanket prod sign-off until test smoke and gift-card migration run on `test.bakeandgrill.mv`.

---

## 2. Production-ready?

| Environment | Ready? | Conditions |
|-------------|--------|------------|
| **Test** (`test.bakeandgrill.mv`) | **Yes, conditional** | Deploy with migrations; smoke POS/KDS/online pay/gift cards/admin deposit report |
| **Production** (`bakeandgrill.mv`) | **No** | Gift-card migration clears legacy cards; full smoke + owner sign-off |

---

## 3. Fully modular?

**Hybrid modular monolith** — unchanged philosophy, improved route surface:

| Loaded route files | Contents |
|--------------------|----------|
| `routes/domains/orders.php` | Staff orders, payments on ticket, receipts, refunds |
| `routes/domains/payments.php` | BML webhook, online pay, partial pay, Stripe |
| `routes/domains/admin_customers.php` | Admin CRM, credit, deposit |
| `routes/domains/finance.php` | Finance/inventory (existing) |

`api_finance.php` shim **removed**. URLs unchanged.

---

## 4. Findings by severity

### Critical / High (addressed this pass)

| Item | Status |
|------|--------|
| Gift cards plaintext at rest | **Fixed** — HMAC-SHA256 `code_hash`, `gift_card_id` on orders |
| Gift card balance enumeration | **Fixed** — masked responses, `throttle:10,1`, generic 404 |
| POS gift-card never redeemed on cash pay | **Fixed** — `GiftCardRedemptionService` + `OrderPaid` listener |
| Route monolith | **Partial** — 4 domain route files loaded |
| Credit charge duplicate | **Fixed** — idempotent `recordCharge` by `payment_id` |
| Credit refund duplicate | **Fixed** — `refund_id` on ledger + guard |
| BML/Stripe log leakage | **Fixed** — redacted success/error logs |
| Return URL over-trust | **Tested** — CONFIRMED query without verified BML does not finalize |

### Medium (addressed)

| Item | Status |
|------|--------|
| Overpayment on `POST /orders/{id}/payments` | **Test added** |
| Deposit activity report coverage | **Extended** (used/payouts/transfers) |
| Print job duplicate dispatch | **Test added** |
| KDS financial fields | **Test added** |
| Inventory restore on refund | **Test added** |
| Route regression | **`RouteSurfaceRegressionTest`** |

### Low / deferred

| Item | Notes |
|------|-------|
| `StockReservationService` import | **Fixed** in Full Production Audit pass — see `FULL_PRODUCTION_AUDIT_REPORT.md` |
| Full `api.php` split | Future incremental work |
| OTP plaintext in `sms_logs` DB | Partial redaction in admin UI only |
| Blade legal copy CMS | Not in scope |

---

## 5. Fixes applied

- `GiftCardCodeService` — normalize, HMAC hash, generate, lookup
- Migration `2026_05_24_100000_hash_gift_card_codes` — `code_hash`, `code_last4`, `orders.gift_card_id`, drop plaintext columns
- `GiftCardRedemptionService` + `RedeemGiftCardOnOrderPaidListener`
- Route extraction: `orders.php`, `payments.php`, `admin_customers.php`
- Credit ledger `refund_id` migration + idempotency guards
- Log redaction in BML/Stripe gateways
- Admin gift card UI uses `masked_code`; full code only on issue
- POS resume uses `gift_card_masked` when code not stored

---

## 6. Files changed (summary)

**Backend:** Gift card domain, payments listeners, credit ledger, routes/domains/*, migrations, 15+ test files, snapshots, `DomainEventServiceProvider`.

**Frontend:** `GiftCardsPage.tsx`, `customers.ts`, `useOrderCreation.ts` (masked resume).

**Docs:** `PRODUCTION_READINESS.md`, `MODULARIZATION_AUDIT.md`, `backend/README.md`, this report.

---

## 7. Migrations added

| Migration | Purpose |
|-----------|---------|
| `2026_05_24_100000_hash_gift_card_codes.php` | Hash gift cards; `orders.gift_card_id`; drop plaintext |
| `2026_05_24_110000_add_refund_id_to_customer_credit_ledger.php` | Credit refund idempotency |

---

## 8. Tests added/updated

| Test | Purpose |
|------|---------|
| `GiftCardStockTest` (expanded) | Hash, throttle, redeem, duplicate, list masking |
| `RouteSurfaceRegressionTest` | POS/KDS/online/admin/payment routes |
| `StaffRouteMiddlewareTest` | +`api/reports`, `api/invoices` |
| `ReturnUrlSafetyTest` | +CONFIRMED query without webhook |
| `OverpaymentBlockedTest` | Tender cap on add payments |
| `PrintJobIdempotencyTest` | Duplicate kitchen dispatch |
| `KdsFinancialDataMinimizationTest` | No total/payment in kitchen JSON |
| `DepositActivityReportTest` | used/payouts/transfers |
| `CreditRefundActorTest` | Refund actor fallback |
| `CustomerCreditTest` | Duplicate charge idempotency |
| `InventoryDeductionTest` | `restoreForOrder` |

---

## 9. Commands run

```bash
cd backend && php artisan test --filter='<readiness filter>'   # 68 passed
cd backend && php artisan test                                  # many pre-existing failures
cd backend && composer audit                                    # symfony/yaml low CVE
UPDATE_SNAPSHOTS=true php artisan test --filter=ContractTest    # snapshots refreshed (2 print contract failures remain)
```

---

## 10. Failed commands + reasons

| Command | Result | Reason |
|---------|--------|--------|
| `php artisan test` (full) | **Pass** (1,018) | Fixed in Full Production Audit pass (imports, defer test harness, GST test data) |
| `composer audit` | **Advisories** | Low-severity `symfony/yaml` CVE-2026-45133 (transitive) |
| Admin `npm run build` | Not run in this pass | Run before commit if shipping admin UI changes |

---

## 11. Remaining risks

1. **Gift-card migration** truncates legacy cards on deploy — acceptable on test; verify before prod.
2. ~~**StockReservationService**~~ — resolved (missing `use` imports in `OrderCreationService`).
3. **Return URL fallback** still calls BML API when params present — safe when API rejects; monitor UAT.
4. **Queue worker** must run on server for async listeners (credit refund listener is queued).

---

## 12. Manual smoke checklist (test server)

- [ ] Admin: issue gift card → copy code once; list shows masked only
- [ ] Public: balance check throttles; invalid code → generic 404
- [ ] Online: apply gift card → pay → balance depleted
- [ ] POS: apply gift card → cash pay → card depleted (`OrderPaid` path)
- [ ] POS: hold/resume ticket with gift card shows masked code
- [ ] Admin: Reports → Deposit Activity tab
- [ ] Admin: customer credit charge + refund
- [ ] KDS: no totals in kitchen JSON
- [ ] BML webhook + return URL (online pay)
- [ ] Offline sync duplicate idempotency
- [ ] PWA / device header (relaxed mode)

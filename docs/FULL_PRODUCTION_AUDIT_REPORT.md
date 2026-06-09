# Bake & Grill — Full Production Audit Report

**Date:** 2026-06-09  
**Scope:** Local codebase post-`5d3d84ee` — incremental hardening pass (no full `api.php` split, no gift-card re-hash).  
**Verdict:** Hybrid modular monolith; **production-test-ready** with full PHPUnit green and readiness suite expanded.

---

## 1. Executive summary

Bake & Grill is a **hybrid modular monolith**: 32+ `Domains/*` folders, ~1,026-line [`backend/routes/api.php`](../backend/routes/api.php) plus four route fragments (`orders`, `payments`, `admin_customers`, `finance`). This pass fixed **critical runtime blockers** (missing service imports), brought the **full test suite to green (1,018 tests)**, expanded security and ops coverage, added gift-card POST balance, OTP log redaction, and inactive-staff middleware hardening. Gift-card hashing and route extraction from the prior pass were **not re-done**.

---

## 2. Architecture result

| Layer | State |
|-------|--------|
| Backend | Laravel 11, domain folders for Orders, Payments, Inventory, Printing, Notifications, etc. |
| Routes | Monolithic `api.php` + 4 extracted fragments; URLs unchanged |
| Admin | React SPA → `backend/public/admin/` |
| POS | React PWA → `backend/public/pos/` |
| Public site | Blade + `SiteSetting` CMS |

Decision **A** (incremental routes) and **B** (strong gift-card hash) from the audit spec remain in place.

---

## 3. Security findings

| Severity | Finding | Resolution |
|----------|---------|------------|
| **Critical (fixed)** | `OrderCreationService` missing `StockReservationService` / `PrintJobService` imports → order creation 500 | Added `use` imports |
| **Critical (fixed)** | `PrintJobService` (domain) missing `PrintProxyService` import → silent print failures | Added `use App\Services\PrintProxyService` |
| **Medium (fixed)** | Inactive staff could call staff routes with existing token | `EnsureStaffToken` now checks `is_active` |
| **Low** | Dual-token routes (`auth:sanctum` only) for promos, customer reservations | Documented; controller enforces token type |
| **Low** | `symfony/yaml` CVE-2026-45133 (composer audit) | Dev transitive; monitor upgrade |

---

## 4. Route protection report

- **Staff prefixes** scanned: `pos/`, `kds/`, `shifts`, `devices`, `admin/`, `reports`, `invoices`, `webhooks`, `stream`, `time-clock`, `waste-logs`, `permissions`, `site-settings`
- **Public exceptions:** `api/site-settings/public`, `api/stream/order-status/*`
- **Customer token negatives** added: invoices, sales-summary, admin customers, refunds, POS gift-card apply, admin reservations
- **Disabled staff:** `GET /api/auth/me` → 403

---

## 5. POS / KDS findings

- **DeferAfterResponse:** Test harness flushes deferred callbacks after each HTTP `call()` so OrderPaid/SMS/print side-effects match production without blocking payment JSON on Redis outages
- **POS double-submit:** `isSubmitting` guards on Charge/Hold/Clear in `OrderCart.tsx` and `useOrderCreation.ts`
- **KDS privacy:** HTTP test on `GET /api/kds/orders` asserts no `total`, `payment_status`, or `payments` in payload
- **Offline sync:** `OfflinePosSyncParallelTest` — duplicate `offline_id` in one batch creates a single order

---

## 6. Gift card findings

- Hash-at-rest, masked admin list, throttle, redemption on `OrderPaid` — **unchanged from prior pass**
- **New:** `POST /api/gift-cards/balance` with `{ code }` body (GET balance kept as deprecated alias)
- **New tests:** POST balance, cancelled card 404, POS staff apply/remove via `/api/pos/orders/{id}/gift-card`

---

## 7. Payment findings

- BML/Stripe log redaction verified; **new** `BmlLogRedactionTest` asserts success log has `payment_url_host` only
- Overpayment, webhook idempotency, return-URL safety tests — passing in readiness suite
- POS resume/charge tests use **server order total** (GST-inclusive) to avoid `partial` flakes

---

## 8. Credit / deposit findings

- Credit idempotency (`payment_id` / `refund_id` on ledger) — covered in readiness suite
- Deposit activity report tests — passing
- Refund actor fallback — existing `CreditRefundActorTest`

---

## 9. Inventory / report findings

- **New:** `OrderRefunded` listener integration test restores recipe inventory with `refund:order:` idempotency key
- **New:** `enqueueKitchen` print idempotency test (reason suffix)
- Report tests updated for GST totals and `delivery_fee_laar` / `total_laar` consistency

---

## 10. Frontend findings

- Admin build: success (`npm run build`); dist copied to `backend/public/admin/`
- POS build: success after `gift_card_masked` type added to resume order shape
- POS submit guards: present (`isSubmitting` on critical actions)
- Public Blade: CMS-driven hero/hours/contact — no redesign in this pass

---

## 11. Files changed (this pass)

**Backend (runtime):**

- `app/Domains/Orders/Services/OrderCreationService.php` — imports
- `app/Domains/Printing/Services/PrintJobService.php` — `PrintProxyService` import
- `app/Support/DeferAfterResponse.php` — testing callback queue + flush
- `app/Http/Middleware/EnsureStaffToken.php` — inactive staff block
- `app/Domains/Notifications/Services/SmsService.php` — OTP log redaction
- `app/Http/Controllers/Api/GiftCardController.php` — `balancePost`
- `routes/api.php` — `POST /gift-cards/balance`

**Backend (tests):** 15+ test files added/updated (security, gift cards, KDS HTTP, offline parallel, inventory listener, print idempotency, BML log, SMS OTP, GST/report fixes)

**Frontend:**

- `apps/pos-web/src/api.ts` — `gift_card_masked` on resume type

**Built assets:** `backend/public/admin/`, `backend/public/pos/`

---

## 12. Migrations

**None in this pass.** Prior gift-card hash migration (`2026_05_24_100000_hash_gift_card_codes`) still requires full deploy on test/prod when shipping.

---

## 13. Tests added / updated

| Area | Tests |
|------|-------|
| Security | Staff route prefixes + exceptions; customer token negatives; disabled staff |
| Gift cards | POST balance, cancelled card, POS apply/remove |
| KDS | HTTP financial minimization |
| Offline | Parallel batch duplicate |
| Inventory | `OrderRefunded` listener restore |
| Printing | `enqueueKitchen` idempotency |
| Logging | OTP redaction, BML success log |
| Regression | PosResumeAndCharge (GST totals), print contract, GST/report data |

**Counts:** `php artisan test` → **1,018 passed**, 2 skipped | `composer test:readiness` → **89 passed**

---

## 14. Commands run

| Command | Result |
|---------|--------|
| `php artisan test` | **Pass** (1,018) |
| `composer test:readiness` | **Pass** (89) |
| `composer audit` | **1 low** (`symfony/yaml` CVE-2026-45133) |
| `npm run build` (admin) | **Pass** |
| `npm run build` (pos) | **Pass** |
| `php artisan route:list` | **Pass** (spot-check) |
| `grep APP_DEBUG backend/.env.example` | `APP_DEBUG=false` |

---

## 15. Remaining risks

| Risk | Mitigation |
|------|------------|
| Large `OrderController` | Continue incremental extraction (`OrderVisibilityService` pattern) |
| Dual `auth:sanctum` customer routes | Optional `customer.token` middleware on customer-only groups |
| `symfony/yaml` advisory | Upgrade when Laravel constraint allows |
| KDS standalone / offline merge UI | Out of scope |
| Mandatory strict device mode in prod | Config default remains relaxed café mode |
| CMS migration for all Blade legal copy | Recommendations only |

---

## 16. Manual smoke checklist

1. **TEST deploy** (`test.bakeandgrill.mv`): full deploy with migrations if not already applied
2. **POS:** Open shift → create order → hold → resume → charge (cash + card) → receipt print
3. **Gift card:** POST `/api/gift-cards/balance` + POS apply/remove on held ticket
4. **KDS:** Ticket appears without payment totals; bump → ready
5. **Online order:** Customer checkout → BML pay → kitchen print on paid
6. **Admin:** Gift cards list shows masked codes only; reports date filters reload
7. **Queue workers:** Both test and prod workers running (`queue:work redis`)
8. **Smoke URLs:** `https://test.bakeandgrill.mv`, `/admin`, `/pos`

---

*Generated by Full Production Audit & Hardening Pass — 2026-06-09.*

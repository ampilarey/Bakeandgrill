# Customer Credit Account — Audit Implementation Report

**Date:** 2026-05-22  
**Scope:** Credit schema, POS credit flow, shift accountability, repayments, reports, customer API privacy, tests.  
**Out of scope (unchanged):** BML, normal cash/card POS, KDS, stock, online order checkout.

---

## Summary

The audit confirmed core credit infrastructure (migrations, eligibility checks, admin permissions, FIFO repayment) was largely correct. This pass closed enforcement gaps around shift attribution for `house_account` charges, POS customer sync on unpaid resumed tickets, cash-movement reconciliation for repayments, and credit exposure reporting. Tests and documentation were added.

---

## Changed Files

| File | Change |
|------|--------|
| `backend/app/Domains/Payments/Services/PaymentAllocationService.php` | Removed `house_account` from `nonShiftMethods()`; added `needsCreditShift()` |
| `backend/app/Http/Controllers/Api/OrderController.php` | Shift gate for credit charges (non-owner required; owner may proceed without shift) |
| `backend/app/Domains/Credit/Services/CreditLedgerService.php` | `shift_id` on charge ledger rows; cash repayment `CashMovement` type `cash_in` |
| `backend/app/Domains/Reporting/Services/ReportsService.php` | Richer `creditExposure()` — balance>0 filter, limit/available/status/overdue |
| `backend/app/Models/CustomerCreditLedger.php` | Integer `$casts` for laari fields |
| `backend/database/migrations/2026_05_22_210000_add_unique_payment_id_to_customer_credit_ledger.php` | `unique(payment_id)` parity with deposit ledger |
| `apps/pos-web/src/App.tsx` | Sync `customer_id` on attach/detach for unpaid resumed tickets |
| `apps/admin-dashboard/src/api/finance.ts` | Extended `CreditExposureReport` type |
| `apps/admin-dashboard/src/pages/ReportsPage.tsx` | Credit Exposure table + CSV columns |
| `backend/tests/Feature/CustomerCreditTest.php` | +10 feature cases |
| `backend/tests/Feature/Reports/ExtendedReportsTest.php` | Disabled-customer exposure case |
| `backend/tests/Unit/Payments/PaymentAllocationTest.php` | Credit shift + `payments.credit` unit tests |

**Verified unchanged (no code edits required):**

- Credit migrations (`190000`, `190001`, `200000`)
- `CreditEligibilityService` charge rules
- Admin permission catalog (`customers.credit.manage`, `customers.credit.repay`, `payments.credit`)
- Customer API `customerFacingSummary` (no `credit_notes`)
- Sales/X/Z reports — `house_account` remains a separate tender key

---

## Behavior Changes

### Shift accountability for `house_account` charges

| | Before | After |
|---|--------|-------|
| Staff shift required | No (`house_account` in `nonShiftMethods`) | Yes — same as cash/card (422 if no open shift) |
| Owner without shift | Allowed | Still allowed (optional shift attribution) |
| `payments.shift_id` | Always `null` for credit | Set when collector has an open shift |
| `customer_credit_ledger.shift_id` on charge | Not set | Copied from payment |

No cash movements are created for credit charges (no cash collected).

### POS customer sync (unpaid resumed tickets)

| | Before | After |
|---|--------|-------|
| Attach/detach customer on resumed ticket | Only synced when `resumedIsPaid` | Syncs whenever `resumedOrderId` is set |
| Credit UI vs server `order.customer_id` | Could diverge on unpaid held tickets | Stays aligned for Charge overlay eligibility |

### Cash credit repayments

| | Before | After |
|---|--------|-------|
| `CashMovement.type` | `in` | `cash_in` |
| Shift `expected_cash` / reconciliation | Repayments invisible | Included in `cash_in` / `paid_in` sums |

### Credit exposure report

| | Before | After |
|---|--------|-------|
| Customer filter | `credit_enabled = true` AND balance > 0 | `credit_balance_laar > 0` (includes disabled/blocked with debt) |
| Row fields | name, balance | + limit, available, status, credit_enabled, overdue_invoices_count |

---

## Risks & Resolution

| Risk | Severity | Status |
|------|----------|--------|
| Unpaid resumed ticket shows wrong customer credit in POS | High | **Fixed** — `App.tsx` customer sync |
| Credit charges without shift attribution | High | **Fixed** — shift required + `shift_id` persisted |
| Cash repayments not in shift `expected_cash` | Medium | **Fixed** — `cash_in` type |
| `creditExposure` hides disabled accounts with debt | Medium | **Fixed** — balance-only filter |
| No `unique(payment_id)` on credit ledger | Low | **Fixed** — migration added |
| Staff role defaults include `payments.credit` | Low | Documented — revocable per user |
| `ReverseCreditOnRefundListener` is queued | Low | Acceptable — tests run with `QUEUE_CONNECTION=sync` |

---

## Test Matrix

| Test case | Status |
|-----------|--------|
| Unapproved customer cannot use credit | Covered (existing) |
| Blocked/on_hold cannot charge | **Added** |
| Over-limit fails | Covered (existing) |
| Staff without `payments.credit` | **Added** |
| Approved customer within limit | Covered (existing) |
| Repayment reduces balance | Covered (existing) |
| Cash repayment without shift (non-owner) | **Added** |
| Refund reverses credit balance | **Added** |
| House_account without shift (staff) | **Added** |
| `shift_id` on Payment + ledger when shift open | **Added** |
| Customer API excludes `credit_notes` | **Added** |
| Credit exposure includes disabled w/ balance | **Added** |
| FIFO repayment (oldest invoice first) | **Added** |
| Repayment over balance → 422 | **Added** |
| `needsCreditShift()` / `payments.credit` unit | **Added** |

**Commands run (all passing):**

```bash
php artisan test --filter=CustomerCreditTest
php artisan test --filter=ExtendedReportsTest
php artisan test --filter=PaymentAllocationTest
```

---

## Deployment Notes

- **Full deploy** required (new migration `2026_05_22_210000_add_unique_payment_id_to_customer_credit_ledger.php`).
- Rebuild admin dashboard (`ReportsPage.tsx`) and POS (`App.tsx`) before commit if shipping built assets.

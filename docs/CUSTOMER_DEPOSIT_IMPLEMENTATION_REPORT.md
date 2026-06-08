# Customer Deposit / Prepaid Balance — Implementation Report

**Date:** 2026-05-22  
**Status:** Complete (pending deploy to test)

---

## 1. Audit summary

### Wallet is real (not label-only)

The POS/API payment method `wallet` deducts `customer_deposit_accounts.balance_laar` via `DepositLedgerService::recordUsage()`. Balance decreases on settlement; tests confirm end-to-end behaviour.

### Separate from credit

| Concept | Direction | Storage | POS method | UI label |
|---------|-----------|---------|------------|----------|
| **Customer Credit** | Customer owes BG | `customers.credit_*`, `customer_credit_ledger` | `house_account` | Credit Account |
| **Customer Deposit** | BG holds customer money | `customer_deposit_accounts`, `customer_deposit_ledger` | `wallet` (internal) | Pay from Deposit |

**Do not merge** these balances or ledgers.

### Naming decision

- **Keep `wallet`** as the internal `payments.method` value (already deployed).
- **UI only:** Customer Deposit, Deposit Balance, Pay from Deposit, Receive Deposit.
- API accepts `customer_deposit` as an alias mapped to `wallet` in `StoreOrderPaymentsRequest`.

---

## 2. Changed files (high level)

### Backend

| Area | Files |
|------|-------|
| Schema | `database/migrations/2026_05_23_100000_extend_customer_deposit_ledger.php` |
| Services | `DepositLedgerService.php`, `CustomerDepositService.php`, `DepositEligibilityService.php` |
| Listener | `ReverseDepositOnRefundListener.php` |
| Permissions | `PermissionCatalog.php` |
| API | `CustomerDepositController.php`, `CustomerController.php`, `OrderController.php`, `ShiftController.php`, `ReportsController.php` |
| Payments | `PaymentAllocationService.php`, `SettleOrderPaymentAction.php`, `StoreOrderPaymentsRequest.php` |
| Routes | `routes/api.php`, `routes/domains/remainder.php`, `routes/domains/customers_public.php` |
| Tests | `tests/Feature/Deposits/DepositsTest.php`, `tests/Unit/Payments/PaymentAllocationTest.php` |

### Admin (`apps/admin-dashboard`)

- `components/CustomerDepositSection.tsx` — receive, payout, transfer, paginated ledger, renamed copy
- `components/Customer360Drawer.tsx` — granular view permission
- `api/customers.ts`, `api/finance.ts` — new API helpers + deposit exposure report
- `pages/ReportsPage.tsx` — Deposit Exposure tab

### POS (`apps/pos-web`)

- `components/ChargeOverlay.tsx` — Pay from Deposit label; partial deposit + cash split
- `components/CustomerRewardsPanel.tsx` — separate deposit/credit lines; status when frozen
- `components/ShiftPanel.tsx` — wallet → Deposit label
- `App.tsx`, `hooks/usePosPermissions.ts` — `payments.deposit` permission

### Online order (`apps/online-order-web`)

- `api/customer.ts` — `getCustomerDepositLedger`
- `pages/AccountPage.tsx` — Deposit tab (balance + sanitized transactions)

---

## 3. API endpoints

### Admin (staff)

| Method | Path | Permission |
|--------|------|------------|
| GET | `/api/admin/customers/{id}/deposit` | `customers.deposit.view` |
| GET | `/api/admin/customers/{id}/deposit/ledger` | `customers.deposit.view` |
| PATCH | `/api/admin/customers/{id}/deposit` | `customers.deposit.freeze` |
| POST | `/api/admin/customers/{id}/deposit/top-up` | `customers.deposit.receive` |
| POST | `/api/admin/customers/{id}/deposit/adjust` | `customers.deposit.adjust` |
| POST | `/api/admin/customers/{id}/deposit/refund` | `customers.deposit.refund` |
| POST | `/api/admin/customers/{id}/deposit/transfer-to-credit` | `customers.deposit.transfer_credit` |

### Customer portal

| Method | Path |
|--------|------|
| GET | `/api/customer/deposit` |
| GET | `/api/customer/deposit/ledger` |

### Reports

| Method | Path |
|--------|------|
| GET | `/api/reports/deposit-exposure` |
| GET | `/api/reports/deposit-activity` |

### POS (unchanged path)

| Method | Path | Notes |
|--------|------|-------|
| POST | `/api/orders/{id}/payments` | `wallet` or `customer_deposit` tender; requires open shift (non-owner) |

---

## 4. Permission matrix

| Slug | Purpose | Owner | Manager | Staff |
|------|---------|-------|---------|-------|
| `customers.deposit.view` | View balance/ledger | ✓ | ✓ (via manage alias) | — |
| `customers.deposit.receive` | Top-up / receive | ✓ | ✓ | — |
| `customers.deposit.freeze` | Freeze/close | ✓ | ✓ | — |
| `customers.deposit.refund` | Payout to customer | ✓ | ✓ | — |
| `customers.deposit.transfer_credit` | Deposit → credit | ✓ | — | — |
| `customers.deposit.adjust` | Manual adjustment | ✓ | — | — |
| `customers.deposit.manage` | Legacy full access | ✓ | ✓ | — |
| `payments.deposit` | POS pay from deposit | ✓ | ✓ | ✓ |
| `payments.wallet` | Legacy alias | ✓ | ✓ | ✓ |

Legacy `customers.deposit.manage` satisfies view/receive/freeze/refund via `SATISFIED_BY`.  
`payments.deposit` ↔ `payments.wallet` are interchangeable aliases.

---

## 5. Accounting rules

| Event | Sales revenue? | Cash drawer? | Liability |
|-------|----------------|--------------|-----------|
| Receive deposit (top-up) | **No** — not a sale | Cash in (`cash_in`) when cash | Increases deposit liability |
| Pay order with deposit (`wallet`) | **Yes** — food sold | No cash movement | Decreases deposit liability |
| Payout unused deposit | **No** | Cash out when cash | Decreases liability |
| Order refund (wallet order) | Reversal via refund flow | Per refund method | Deposit restored (`reversal` ledger) |
| Transfer deposit → credit | **No** — not a sale | No | Deposit ↓, credit balance ↓ |

Top-ups are excluded from sales-by-method reports. `wallet` appears in sales-by-method when used to pay for food.

---

## 6. Post-deploy steps (test env first)

1. **Full deploy** (new migration):
   ```bash
   cd /home/bakeandgrill/test.bakeandgrill.mv && git pull origin main && cd backend && composer install --no-dev --optimize-autoloader && php artisan migrate --force && php artisan config:cache && php artisan route:cache && php artisan view:clear && php artisan queue:restart
   ```

2. **Permission sync** (runs on migrate via `PermissionCatalogSync` — verify new slugs appear in Admin → Settings → Roles).

3. **Smoke test:**
   - Admin: receive deposit, view ledger, payout, transfer (owner only)
   - POS: Pay from Deposit full and partial+cash split; shift summary shows deposit cash received
   - Online: Account → Deposit tab shows balance and history
   - Reports → Finance → Deposit Exposure

4. **Queue worker** — restart after deploy (`php artisan queue:restart`); `ReverseDepositOnRefundListener` is queued.

---

## 7. Owner decision — transfer to credit

**Confirmed behaviour (v1):** Transfer is **one-way** deposit → credit payoff. It reduces both prepaid balance and outstanding credit. There is **no automatic reverse** (credit → deposit). Owner must confirm this in admin UI before each transfer.

---

## 8. Test coverage

```
php artisan test --filter=DepositsTest        # 18 tests
php artisan test --filter=PaymentAllocationTest  # 7 tests
```

Covers: top-up, wallet debit, frozen account, payout, split tender, order refund reversal, transfer to credit, concurrency (second payment fails), deposit exposure report, shift deposit cash, permission gates.

---

## 9. Gap matrix (plan vs delivered)

| Area | Status |
|------|--------|
| Core receive + POS pay | Done (pre-existing + hardened) |
| Ledger schema richness | Done (`balance_before_laar`, `method`, `refund_id`, extended types) |
| Granular permissions | Done |
| Payout refund to customer | Done (`payoutDeposit`) |
| Order refund reverses wallet | Done (`ReverseDepositOnRefundListener`) |
| Deposit-to-credit transfer | Done |
| Shift close / liability reports | Done |
| Cash movement type on top-up | Fixed (`cash_in`) |
| Wallet shift attribution | Done (shift required; `shift_id` on usage) |
| POS split partial deposit | Done |
| UI wording | Done |
| Online customer Deposit tab | Done |
| Concurrency test | Done |

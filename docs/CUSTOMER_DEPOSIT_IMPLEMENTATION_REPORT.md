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

## 8b. What the customer is told (2026-10-21)

The customer's word for the deposit is **wallet**. Each movement is one text, its own row in
Admin → Notifications, wording editable, Dhivehi drafts built in:

| Movement | Text | Row |
|---|---|---|
| Money received (till or Admin, any method) | "MVR x added to your wallet (cash). Wallet balance: MVR y." | Wallet: money added |
| Money paid out | "MVR x paid out from your wallet (bank transfer). Wallet balance: MVR y." | Wallet: money paid out |
| Frozen / active again | "put on hold" / "active again. Balance: MVR y." | Wallet on hold, or active again |
| A sale paid from the wallet | The receipt text carries "MVR x from your wallet, balance MVR y." | Payment confirmed (POS / online) |
| Moved to the credit account | The credit repayment text, "received (from your wallet)" | Credit payment received |
| A refund paid into it | Unchanged: "Refund added to wallet" | Refund added to wallet |

A gift card moved into the wallet from the order app is confirmed on screen and sends no
text. The receipt page, PDF and confirmation email show a Wallet block with the amount paid
from it and the balance left (`App\Support\ReceiptAccountLines`). Sender:
`App\Domains\Deposits\Services\DepositNotifier`, called from `DepositLedgerService`.
Tests: `tests/Feature/Credit/CreditAndWalletTextsTest.php`.

## 8c. Money in by card (2026-10-21)

Owner: "when customer log in, option to pay deposit to his acc". A customer adds money to the
wallet by card, and staff can send a link that does the same.

| Where | What |
|---|---|
| Order app, Account → Wallet → **Add money** | The owner's presets as one-tap amounts, or an amount of their own; Pay by card goes to BML; the bank brings them back to the Wallet panel, which asks until the money is in and then says "MVR x added. Balance MVR y" with a link to the receipt. |
| Admin, Customer → Deposit → **Send top-up link**; till, Customers → Deposit → **Send top-up link** | A text with a link (`customer_wallet_topup_link`), with an amount or open so the customer picks one. Needs `customers.deposit.receive`. Refused for a number nobody checked; a customer with no phone gets the link to copy. |
| `/wallet/top-up/{token}` | The link's page: amount or the choice, Pay by card, and the receipt once paid (amount, reference, balance after). Lasts 7 days; an app top-up a day. |
| Settings → Credit & wallet | On/off, amounts to offer, smallest and largest top-up, card top-ups a day, the most a wallet may hold (`WalletTopUpRules`, defaults 100/200/500/1,000, MVR 50 to 5,000, MVR 10,000 a day, MVR 20,000). |
| Notifications → Owner: large wallet top-up by card | Owners and managers are texted at or above the amount under Edit → When it sends (`wallet_topup_owner_alert_mvr`, default MVR 2,000). |

How it is wired: `wallet_topups` row + a BML payment with `payments.wallet_topup_id` (no order);
`PaymentService::initiateBmlTopUpPayment` / `confirmTopUpPaymentOnce`; `WalletTopUpService::settle`
credits once per payment through `DepositLedgerService::topUp` (method `online`, `payment_id` on the
ledger row) and the customer's "money added" text carries the page as the receipt. The webhook, the
return URL, the page, the app's poll and the `payments:reconcile-pending-bml` sweep all settle it;
the first wins. A bank refusal leaves the top-up open for another try. Tests:
`tests/Feature/Deposits/WalletTopUpTest.php`, `AddMoneyCard.test.tsx`, `CreditAccountSettings.test.tsx`,
`CustomersPanel.test.tsx`.

## 8d. Spending it better (2026-10-21, phase 3)

| Where | What |
|---|---|
| Order app checkout | The wallet box is offered whenever the wallet has money. Covering the order: "Pay from my wallet". Short of it: "Use my wallet (MVR x) and pay the rest (MVR y) by card", with the Pay button showing only the card part. The wallet money is put on hold and taken only once the bank confirms the card; a failed card frees it. |
| Order app, Account → Wallet | "MVR x is on hold for an order you are paying" while a hold stands; **Wallet first** switch: the box comes ticked at checkout. |
| Till, Charge | A customer who asked for the wallet first finds the wallet tender picked when it covers the ticket, and the wallet box says so. Money on hold for an unpaid online order is not offered at the till. The customer card shows "(MVR x on hold)" and "wallet first". |

How it is wired: a hold is a pending `customer_deposit` Payment on the order (`DepositHolds`:
`hold`, `settle` inside the BML confirm transaction, `release` on a failed card or `DELETE
/api/customer/orders/{id}/hold-wallet`); `getRemainingBalanceLaar` counts it as covered;
`DepositEligibilityService` subtracts `heldLaar()` from what may be spent (`held_laar`,
`available_laar`, `wallet_first` on every summary). The customer's switch is
`customers.wallet_first` through `PATCH /api/customer/profile`. Tests:
`tests/Feature/Credit/CreditSpendTest.php`. The credit account's online payment, statement
and alerts are in `docs/CREDIT_ACCOUNTS_PAGE.md` § Paid online as a whole.

## 8e. A bonus on top-ups, and the rest of phase 4 (2026-10-21)

| Where | What |
|---|---|
| Settings → Credit & wallet → Bonus on top-ups | Extra (%) and the top-up it starts from (MVR). 0% is off. |
| Every top-up at or above the amount, by card from the app or a link, or at the counter | A second wallet row, type `bonus` (no cash movement), and the customer's "money added" text ends " Plus a MVR x bonus." The deposit activity report shows bonuses apart from money received. |
| Order app, Account → Wallet → Add money | "Add MVR 500 or more and get 5% extra." and "+ MVR 25.00 bonus" under the amount picked. |
| Money that only moves pots | No bonus: the extra from a credit repayment, a refund into the wallet, a gift card. |

Wired in `WalletTopUpRules::bonusLaar()` and `DepositLedgerService::topUp()` (`bonusEligible`);
the ledger type list is widened for MySQL and PostgreSQL in
`2026_10_21_190000_wallet_bonus_settle_and_orders_on_account`. The repayment extras, settle
from the wallet and online orders on account are in `docs/CREDIT_ACCOUNTS_PAGE.md` § Phase 4.
Tests: `tests/Feature/Credit/CreditExtrasTest.php`.

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

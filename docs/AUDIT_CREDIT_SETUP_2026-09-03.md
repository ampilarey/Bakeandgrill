# Credit accounts — settings & setup audit

**Date:** 2026-09-03
**Asked:** "Can u audit credit accounts settings and setup"
**Scope:** what is configurable, where it is configured, who may configure it, and
what happens by default. The money mechanics (charge → invoice → repayment →
ledger) were audited on 2026-05-22 — see `CREDIT_ACCOUNT_AUDIT_REPORT.md` — and
are re-verified here only where a setting drives them.

---

## What a credit account is made of

Per customer (`customers` table, migration `2026_05_22_190000`):

| Field | Default | Set by |
|---|---|---|
| `credit_enabled` | `false` | Approve action |
| `credit_status` | `blocked` | Approve / Set status (`active`, `on_hold`, `blocked`) |
| `credit_limit_laar` | `0` | Approve / Update limit |
| `credit_balance_laar` | `0` | Charges and repayments only — never set by hand |
| `credit_payment_terms_days` | `30` | Approve / Update terms (7–90) |
| `credit_reminder_sms` | `true` | Admin, **and the customer themselves** |
| `credit_approved_by` / `credit_approved_at` | — | Stamped on approve |
| `credit_notes` | `null` | Approve, admin-only (never sent to the customer) |

A new customer therefore starts with **no credit, blocked**, which is the right
default: credit is something granted, never assumed.

Site-wide there is exactly one setting: **`credit_limit_max_mvr`**, seeded at
**MVR 50,000** (migration `2026_07_21_200200`), the highest limit a manager may
approve without an owner override.

## Who may do what

| Action | Permission | Who has it |
|---|---|---|
| Approve credit, set limits, hold/block | `customers.credit.manage` | Manager and above |
| Record a repayment | `customers.credit.repay` | **Owner only** |
| Write off a balance | `customers.credit.writeoff` | Owner only |
| Charge a sale to credit at the till | `payments.credit` | Per-role, POS |

## What is enforced, and where

Verified in code, not assumed:

- **The ceiling is real.** `CreditLedgerService::assertLimitWithinMax()` rejects any
  non-owner limit above `credit_limit_max_mvr`; the owner may exceed it only with a
  reason of 5+ characters, and the audit row records `exceeded_max` and the reason.
- **Every limit change needs a reason** (5+ chars), and a limit below the customer's
  current balance is refused unless `override` is passed — which is itself audited.
- **The till cannot be talked into a credit charge.** `payments.credit` is checked
  server-side in `PaymentAllocationService` (line 83), not only in the POS UI, and
  `CreditLedgerService::recordCharge()` locks the customer row and re-asserts
  enabled + active + within available credit before moving the balance.
- **Offline cannot bypass the limit.** `house_account` is in
  `OfflineOrderSyncService::BLOCKED_METHODS`, so a till with no network cannot
  bank a credit sale to be reconciled later.
- **The clock runs by itself.** `invoices:mark-overdue` daily at 07:00 and
  `credit:send-payment-reminders` daily at 09:00 are both scheduled in
  `routes/console.php`.
- Charging to credit raises a real invoice with `due_date = issue + terms`.

That is a sound spine. The findings below are about the setup around it.

---

## Findings

### F1 — The one global setting has no way to change it (medium)

`credit_limit_max_mvr` governs every manager approval, and **nothing in the admin
app edits it**. It exists in `site_settings` with a label and description, the
backend reads it on every approval, but there is no field for it anywhere in
`apps/admin-dashboard` — the only match in the whole app is a code comment.

So the ceiling is whatever the migration seeded, **MVR 50,000**, unless somebody
edits the database by hand. If that number was ever meant to be a decision, it has
never been made.

*Fix:* a field in Settings → Customers, owner-only, alongside the other money
ceilings.

### F2 — A manager can grow the debt but cannot clear it (medium, policy)

`customers.credit.manage` is a manager permission; `customers.credit.repay` is
owner-only. A manager can approve an account and raise its limit, but cannot take
the customer's payment against it — that needs the owner. Day to day this means a
customer walking in to settle their account has to wait for the owner to be
available, or the payment goes in as something else.

This may well be deliberate — money in is the sensitive direction. But the pairing
is unusual (most tills let whoever may extend credit also collect it), so it is
worth an explicit decision rather than an inherited default.

### F3 — Approving credit silently re-subscribes a customer to reminder SMS (low)

`approveCredit()` writes `credit_reminder_sms => true` unconditionally. A customer
can opt out of reminders themselves through `PATCH /credit/preferences`. If anyone
then re-runs **Approve** on that customer — to change terms, or notes — their
opt-out is reversed without a word to anybody.

*Fix:* on approve, keep the existing preference when the customer already has one;
only default to `true` for an account being approved for the first time.

### F4 — No house default for payment terms (low)

`DEFAULT_PAYMENT_TERMS_DAYS = 30` is a constant in `CreditEligibilityService`.
Every new account starts at 30 days unless the approver changes it in the form.
There is no setting for "our terms are 14 days", so the house policy lives in each
approver's memory.

### F5 — The exposure report has no aging (low)

`/reports/credit-exposure` gives the total outstanding, how many customers owe it,
the top 10 by balance, and a count of overdue invoices each. It has no aging
buckets — current / 1–30 / 31–60 / 60+ — which is the split you actually chase
money by, and the one an accountant asks for.

### F6 — Disabling credit says nothing about the balance left behind (low)

`disableCredit()` sets `credit_enabled = false, credit_status = blocked` with no
regard for an outstanding balance. Stopping new charges on an account that still
owes money is correct; saying nothing about the debt that survives is not. The
response and the admin UI should state the balance that remains collectable.

### F7 — There is no global on/off for credit (informational)

Credit is turned off for a site by not granting the permissions. That works, but
there is no single switch, and no way to say "no new credit accounts" while
existing ones wind down.

---

## Not findings — checked and correct

- Defaults are safe: blocked, disabled, zero limit.
- `credit_notes` is admin-only and never reaches `customerFacingSummary`.
- Payment terms are bounded 7–90 days, server-side, on every path.
- A repayment in cash writes a `CashMovement` (`cash_in`), so the drawer reconciles.
- Ledger rows are unique per payment, so a retried settle cannot double-charge.
- Per-customer ledger and exposure snapshot both export to CSV.

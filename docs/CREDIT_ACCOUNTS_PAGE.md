# Credit accounts page

**Date:** 2026-10-05
**Asked:** "Is there any place to manage credit accounts" → "Yes build. Including
sms option payment links etc"

Until now a customer's credit account lived only inside that customer's record in
the Directory. To see who owed what you opened them one at a time, and the only
chasing was the automatic reminder schedule. This page puts every account on one
screen and adds two texts the owner can send by hand.

## Where

Admin → **Customers → Credit accounts** (`/customers/credit`). Visible to anyone
with `customers.credit.manage` or `customers.credit.repay`; the two texts and the
hold/reactivate buttons need `customers.credit.manage`.

## What it shows

Every customer who has credit, ever had it approved, or still owes a balance.
Per account: status pill (Active, On hold, Blocked), balance and open invoice
count, limit with terms and what is still free, overdue amount with how many
invoices and how many days late, when they last paid and were last charged.
Totals across the top: accounts, owed to you, overdue, on hold / blocked.

Chips filter to Owing, Overdue, Active, On hold or Blocked; the search box matches
name or phone digits. On a phone the table becomes cards and the totals a short
strip.

## Per-account actions

| Button | What it does |
|---|---|
| **Open** | The full credit section for that customer (approve, limit, terms, hold, block, disable, record repayment, write-off, ledger CSV). Same component as the Directory. |
| **Hold / Reactivate** | One tap status change (`set_status`). Block and Disable stay inside Open, behind the same audit as before. |
| **Remind** | Texts what they owe. Names the oldest open invoice with a link to its page; with no open invoice it states the balance. The dialog accepts your own wording, with `{{name}}`, `{{balance}}`, `{{invoice_number}}`, `{{amount}}`, `{{due_date}}`, `{{link}}`. |
| **Pay link** | Texts a link to the oldest open credit invoice. Needs an open invoice. |

Both texts refuse a customer with no phone or who opted out of SMS (the buttons are
disabled and say why). They go out as the `credit_payment_reminder` type, so
Settings → SMS → the credit reminder switch and the customer's own opt-outs apply,
and they appear in the SMS log against the customer. Sending the same text to the
same customer twice in a minute is collapsed by the idempotency key.

Templates (SMS → Templates): `credit_reminder_overdue` (already existed, reused
when there is an invoice), `credit_balance_reminder` (new, balance with no invoice),
`credit_pay_link` (new).

## Paying a credit invoice online

The pay link opens the public invoice page (`/invoices/{token}`), which now shows a
**Pay online** button for a credit invoice with a balance due. The button posts to
`/invoices/{token}/pay`, which starts a BML card payment for the balance due and
sends the customer to the gateway. The return URL carries the invoice token, so
they land back on the invoice page with "Payment received" or "Payment was not
completed".

When BML confirms (return URL check or webhook), `CreditOnlinePaymentService`
records a **card repayment** on the customer's credit ledger for the amount paid,
applied to that invoice, exactly as a card repayment at the till would. It runs at
most once per payment however many times the gateway reports it. The customer's
balance drops, the invoice is marked paid, and the account row shows the payment
under "Last paid".

Wholesale trade invoices keep their own path (trade portal, `TradeReceivablePaymentService`);
`PaymentService::confirmInvoicePaymentOnce` picks the ledger by whether the invoice
has a trade account.

## Where things live

| Piece | File |
|---|---|
| List query and totals | `backend/app/Domains/Credit/Services/CreditAccountsService.php` |
| Reminder and pay-link texts | `backend/app/Domains/Credit/Services/CreditChaseService.php` |
| Online settlement | `backend/app/Domains/Credit/Services/CreditOnlinePaymentService.php` |
| API | `CreditAccountsController` — `GET /admin/customers/credit-accounts`, `POST /admin/customers/{id}/credit/remind`, `POST /admin/customers/{id}/credit/pay-link` |
| Public pay route | `POST /invoices/{token}/pay` (`InvoicePageController::pay`), CTA from `InvoicePagePresenter::payCta` kind `credit` |
| Templates | migration `2026_10_05_120000_credit_chase_sms_templates` |
| Admin page | `apps/admin-dashboard/src/pages/CreditAccountsPage.tsx`, tab in `CustomersHub.tsx` |
| Tests | `backend/tests/Feature/Credit/CreditAccountsPageTest.php`, `apps/admin-dashboard/src/__tests__/CreditAccountsPage.test.tsx` |

## When the bank takes the money but we never hear (2026-10-05)

Owner: a bill sent from the POS and paid online by the customer "payment
processed but customer sees pending payment and pos also shows unpaid". A BML
payment normally reaches us two ways, the signed webhook and the return URL, and
both can miss: the webhook does not always arrive, and the return URL fails
closed when the status API cannot be asked or does not yet say CONFIRMED. The
online ordering app already recovered by asking the bank again whenever the
customer's order page loaded; the pay-link flow had no recovery at all.

`PendingBmlPaymentHealer` is that recovery in one place. It asks the bank's
status API about an order's in-flight card payment and settles it through the
normal confirmation path if the bank says CONFIRMED, at most once a minute per
order, never throwing. It runs:

- on the BML return URL for any order still unpaid, whatever the query string said;
- when the receipt page, the pay page or the invoice page is opened for an unpaid order;
- every three minutes as `payments:reconcile-pending-bml`, for card payments
  between two minutes and 48 hours old, so the POS catches up even if the
  customer closed the browser.

Tests: `tests/Feature/Payment/PendingBmlPaymentHealerTest.php`.

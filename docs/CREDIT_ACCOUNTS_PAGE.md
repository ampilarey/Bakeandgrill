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

## Repayments list (2026-10-06)

Owner: card and transfer repayments touched no cash drawer, so they showed up
only on each customer's own history, with nothing to match against the bank
statement. Credit accounts now has an **Accounts / Repayments** switch.

**Repayments** lists every credit repayment in a date range (Today, Yesterday,
Last 7 days, Last 30 days, or any range up to a year), newest first: when, who,
method, amount, the slip or transfer reference, the invoices it paid, and who
recorded it. Tiles across the top give the total received, **Not cash: match to
bank** (card, transfer and online together), cash, card and transfer, and online.
Chips filter by method, the search box by name or phone, and **Download CSV**
gives the same list with totals per method at the foot.

Methods: Cash (into a shift drawer), Card (machine), Bank transfer, and Online
(BML) for a repayment that came through the pay link. Wholesale shops' repayments
sit in the same ledger and are marked "wholesale". Days are counted in Malé time,
whatever clock the device keeps.

Repayments are never sales: the sale was counted on the day of the credit order.

| Piece | File |
|---|---|
| List and totals | `backend/app/Domains/Credit/Services/CreditRepaymentsReport.php` |
| API | `GET /admin/customers/credit-repayments`, `GET /admin/customers/credit-repayments.csv` |
| Admin view | `apps/admin-dashboard/src/components/credit/CreditRepaymentsView.tsx` |

## What the customer is told (2026-10-21)

Audit finding: a sale on credit sent only "Receipt for #…", a repayment sent nothing,
and the receipt page showed the tender as "Credit" with no due date or balance.

| Event | Text | Row in Admin → Notifications |
|---|---|---|
| A till sale charged to the account | Amount, order, due date, what is owed and available, link to view or pay. Replaces the receipt text. | Charged to credit account |
| A repayment, at the till, in Admin, online or from the wallet | Amount, method, balance left and the next due date; or "fully paid" | Credit payment received |
| Reminders (3 days before, on the day, 3 days after, every N days) | Now say "Pay online:" and carry the whole balance beside the one invoice | Credit payment reminder |

The receipt page, its PDF and the confirmation email show a Credit account block: invoice,
due date, what is owed, what is available, and Pay online until the invoice is paid.

Opt-out rule: a customer who replied STOP to offers still gets money texts, by hand and by
the schedule. Remind and Pay link no longer refuse such a customer; only a missing phone does.
The customer's own reminder switch (order app, Account → Credit Account) still turns the
schedule off.

| Piece | File |
|---|---|
| Texts | `CreditAccountNotifier` (`chargedText`, `repaymentReceived`), sent from `PaymentConfirmationNotifier` and `CreditLedgerService::recordRepayment` |
| Account lines on the receipt | `App\Support\ReceiptAccountLines`, `receipt.blade.php`, `receipt-pdf.blade.php`, `emails/order_confirmation.blade.php` |
| Wording | migration `2026_10_21_120000_credit_and_wallet_customer_texts`, `SmsTemplateWording` |
| Tests | `backend/tests/Feature/Credit/CreditAndWalletTextsTest.php` |

## Paid online as a whole, the statement, and overdue alerts (2026-10-21)

Phase 3 of the deposit plan. Before, a customer could pay one invoice online from its page; the
account as a whole had no page and nothing told the owner when credit went overdue.

| Where | What |
|---|---|
| Order app, Account → Credit Account → **Pay online** | "Pay MVR x now by card" for the whole balance, or an amount typed under it; "MVR y of this is overdue" when any is; a link to the printable statement. Back from the bank the panel confirms "MVR x received… You now owe MVR z" (it asks the bank itself while the webhook is on its way). |
| `/credit/{token}` | The customer's statement: what is owed, what is overdue, every open invoice with its page, Pay by card (whole or part), Print. Linked from the monthly statement text. Not indexed. |
| Notifications → **Credit account monthly statement (customer)** | On the 1st, every customer owing money is texted what they owe, what is overdue and the statement link (`credit:send-statements`, once per month, their reminder switch honoured). |
| Notifications → **Owner: customer credit 30 / 60 days overdue** | Owners and managers are texted once when an invoice crosses 30 days and once at 60 (`credit:alert-overdue`, daily 09:07), everyone in one message, "Chase them in Customers → Accounts on credit." |
| Needs attention → **Credit accounts with an overdue invoice** | Counts customers with an invoice past due; red once one is a month late; opens Customers → Accounts on credit. |
| Charged to credit account text | Ends with " Only MVR x of your MVR y limit is left." when a fifth or less of the limit remains. |

| Piece | File |
|---|---|
| Statement, Pay now, settle (oldest first; more than owed → the wallet), heal, sweep, the monthly text | `App\Domains\Credit\Services\CreditPaymentService`, `App\Models\CreditPayment` (`credit_payments`, `payments.credit_payment_id`) |
| Customer API | `CustomerCreditPaymentController`: `GET /api/customer/credit/statement`, `POST /api/customer/credit/pay`, `GET /api/customer/credit/payments/{token}` |
| Page | `CreditStatementPageController`, `resources/views/credit/statement.blade.php`, `GET /credit/{token}`, `POST /credit/{token}/pay` |
| Commands | `credit:send-statements` (1st, 09:30), `credit:alert-overdue` (daily 09:07; `invoices.overdue_alert_stage`) |
| Order app | `CreditPayCard.tsx` (`CreditPayCard`, `CreditPaymentResult`), Account page `?creditpay=&payment=` |
| Wording | migration `2026_10_21_170000_credit_payments_and_wallet_holds` (`customer_credit_statement`, `{{limit_note}}` on the charged text) |
| Tests | `backend/tests/Feature/Credit/CreditSpendTest.php` |

## Saved for later (2026-10-06)

Owner: "save for later, we have something to do with credit acc". Offered in the
conversation and not built yet:

1. **Take repayment on the sale screen.** When a customer is attached to an order,
   their card on the POS sale screen shows what they owe but says "Collect
   repayments in Admin → Customers", which is out of date and sends cashiers the
   wrong way. Put a Take repayment button there (same form as POS → Customers →
   Record repayment) and drop the stale line (`apps/pos-web/src/components/CustomerRewardsPanel.tsx`).
2. **Overpayment goes to deposit.** A repayment larger than the balance is refused
   ("They owe MVR X; enter that or less"). Option: record the balance as the
   repayment and put the rest into the customer's deposit in one step.
3. **Cash received by the owner, away from the till.** Cash repayments need an open
   shift (the drawer count depends on it). Option: an owner-only "cash held by
   owner" method, recorded outside any drawer but visible in the repayments list.
4. **Transfer to credit on the POS.** Moving deposit money onto a credit balance is
   only in Admin (Customers → customer → Deposit → Transfer to credit).

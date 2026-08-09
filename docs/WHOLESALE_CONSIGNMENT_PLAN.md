# Selling to Other Shops (Sale-or-Return) — Plan

Status: proposed, not yet built.

The owner's words: *"we send 10 momo sets to a shop, maybe 5 sold, 5 dustbin. They pay for
5. They might pay all together at the end of the month or middle of the month."*

That is **sale-or-return consignment**. Goods leave the bakery but are not sold yet. Only the
part the shop actually sells becomes a sale, and money moves later on account.

---

## 1. What already exists — this is why the build is smaller than it sounds

The audit found that most of the money machinery is already here and simply unused for this.

| Capability | Where | State |
|---|---|---|
| Trade accounts with a credit limit | `customers.credit_enabled`, `credit_limit_laar`, `credit_balance_laar`, `credit_status`, `credit_payment_terms_days` (default 30), `credit_reminder_sms` | **Built.** A shop is just a customer with credit turned on. |
| Running account ledger | `customer_credit_ledger` — types `charge`, `payment`, `adjustment`, `refund_reversal`, linked to order / invoice / payment / refund / shift | **Built.** This is the shop's statement. |
| Credit services | `App\Domains\Credit\{CreditLedgerService, CustomerCreditService, CreditEligibilityService}` | **Built.** |
| Tax invoices, credit notes, PDF, due dates, part payment | `Invoice` + `InvoiceItem` (`is_tax_invoice`, `due_date`, `amount_paid_laar`, `parent_invoice_id`, `credit_note_reason`), `InvoiceController::generatePdf`, `sendToCustomer` | **Built.** |
| Customer tax identity | `customers.tin`, `is_gst_registered`, `billing_address` | **Built.** |
| GST posting with invoice/payment/hybrid basis | `GstAccountingBasis`, `TaxLedgerEntry`, `PostGstOnOrderPaidListener`, `GstPeriodLock` | **Built** — but posts on *order paid*. See §6. |
| Stock movements with reference + reason | `StockMovement` (`type`, `quantity`, `balance_after`, `unit_cost`, `reference_type`, `reference_id`) | **Built.** New types slot in. |
| Waste recording | `WasteLog` | **Built.** |
| SMS templates, logs, scheduling, opt-out | `SmsTemplate`, `SmsLog`, `SmsSchedulerService`, `SmsTemplateRenderer`, `customers.sms_opt_out` | **Built.** |
| Cash repayments at the till | `cash_movements.category = credit_repayment`, already sub-totalled in the shift close | **Built.** |

**Nothing exists for consignment itself**: no record of goods that have left the building but
are not yet sold, no reconciliation, no wholesale price list. That is the gap.

---

## 2. The one decision everything hangs on

**A consignment is not an order.**

The tempting shortcut is to raise an order for 10 and refund 5. Do not. It would book revenue
that never happened, post GST on goods still sitting in someone else's fridge, inflate every
sales report, and pollute the refund workflow that was just tightened. The refund flow exists
for money that was taken and must go back — not for bread that did not sell.

So: goods move on a **delivery note**; money is invoiced later for the **sold quantity only**.

---

## 3. The model

### 3.1 Trade account (`trade_accounts`)

One row per shop we supply. The shop is still a `Customer` (so credit, SMS, TIN and login all
work); this row holds the trading terms.

| Column | Purpose |
|---|---|
| `customer_id` | The shop. |
| `shop_name`, `contact_name`, `contact_phone` | Who to call and text. Often not the same person who signs. |
| `settlement_mode` | `sale_or_return` (bakery bears unsold) or `firm_sale` (shop pays for everything sent). Default `sale_or_return` — that is what the owner described. Support both; some shops will graduate to firm sale. |
| `billing_cycle` | `weekly` \| `fortnightly` \| `monthly` \| `per_delivery`. Owner said mid-month or end of month — both are just cycles. |
| `payment_terms_days` | Falls back to the customer's existing `credit_payment_terms_days`. |
| `delivery_days` | Which days we normally deliver. Drives the planning screen. |
| `is_active`, `notes` | |

Credit limit, balance and status stay on the customer record. Do not duplicate them.

### 3.2 Wholesale prices (`trade_price_list_entries`)

Per account, per item (optionally per variant): the agreed price, in laari.

Resolution order, and it must be one function used everywhere:
1. account-specific price for this item
2. the item's default wholesale price (new nullable column on `items`)
3. retail price minus the account's default discount percentage

A price is **stamped onto the delivery line at dispatch**. If the price list changes next week,
last week's delivery must not silently re-price. This is the single most common way wholesale
billing goes wrong.

### 3.3 Delivery note (`trade_deliveries` + `trade_delivery_lines`)

What physically left the building.

`trade_deliveries`: account, delivery number, dispatched_at, dispatched_by, driver/user,
status, expected_return_at, notes, signature/photo (reuse the existing media plumbing).

`trade_delivery_lines`: item, variant, `qty_sent`, `unit_price_laar` (stamped), `unit_cost_laar`
(stamped, for margin and waste costing), and later `qty_sold`, `qty_returned_good`,
`qty_returned_waste`, `qty_missing`.

**The arithmetic that must always hold:**

```
qty_sent = qty_sold + qty_returned_good + qty_returned_waste + qty_missing
```

Enforce it in the service and in the database check where possible. `qty_missing` is not
padding — it is the number that catches a shop that neither sold nor returned an item, and it
must be visible, not quietly folded into waste.

Status: `draft` → `dispatched` → `reconciled` → `invoiced` → `settled`, plus `cancelled`.

### 3.4 Reconciliation

When the shop reports, or when the driver collects on the next run:

- record `qty_sold`, `qty_returned_good`, `qty_returned_waste` per line
- goods returned in sellable condition go **back into stock**
- goods returned spoiled become a `WasteLog` entry **at cost**, so the owner can see what
  consignment actually costs him
- the delivery becomes `reconciled` and is ready to invoice

Two sources of truth, deliberately:

- **what the shop reported** (they type it in, or we phone them)
- **what the driver counted back**

If they disagree, the delivery is flagged and cannot be invoiced until someone resolves it.
The physical count is the truth; the reported number is a claim. This one rule is the whole
anti-shrinkage control, and it is the reason to build the shop-facing reporting at all.

### 3.5 Invoicing and the account

At the end of the billing cycle (or per delivery, per the account setting):

- raise **one tax invoice** covering every reconciled delivery in the period, one line per
  item with the total sold quantity — reuse `Invoice` / `InvoiceItem` exactly as they are
- post a `charge` to `customer_credit_ledger` for the invoice total
- the customer's `credit_balance_laar` moves through the existing `CreditLedgerService` —
  never write the balance directly

When the shop pays — cash at the till, transfer, or card — record it as a `payment` on the
ledger and against the invoice. Cash repayments already flow into the shift close as
`credit_repayment`, so the drawer maths keeps working with no change.

**Firm-sale accounts** invoice `qty_sent` at dispatch instead, and unsold stock is the shop's
problem. Same tables, different trigger.

---

## 4. What the shop sees

They are already a `Customer` with phone login, so this is a section in the existing order app,
not a new application.

- **Deliveries** — what arrived, when, quantities, agreed prices.
- **Report sales** — enter how many sold for a delivery. Simple number boxes, one per item.
  Submitting is a record they agreed to it, with a timestamp. Editable until we reconcile.
- **Statement** — invoices, payments, running balance, what is due and when. Downloadable PDF.
- **Pay** — the existing online payment path, applied to the account rather than to a basket.

Written in plain language: "Momo set — 10 delivered — how many did you sell?"

---

## 5. What the owner sees

- **Out on consignment right now** — value at cost and at wholesale, by shop and by item.
- **Unreconciled deliveries older than N days** — the daily nag list. This is where money leaks.
- **Sell-through per shop per item** — "Shop A sells 5 of 10 momo sets every time." With a
  suggested next quantity from the trailing average. Sending 6 instead of 10 is the single
  biggest saving this feature can produce, and it is pure arithmetic on data we will now have.
- **Waste cost by shop** — what sale-or-return is costing, per customer. Some accounts will
  turn out to be unprofitable, and today there is no way to know.
- **Margin per shop** — wholesale price less cost less waste.
- **Ageing receivables** — 0-30 / 31-60 / 60+ per shop, against the credit limit.
- **Credit limit warnings** — before the next dispatch, not after.

---

## 6. GST — get this right or the return is wrong

- **Nothing posts on dispatch.** Moving your own goods to a shop that has not sold them is not
  a supply. `PostGstOnOrderPaidListener` must not see consignments at all.
- **The tax point is the invoice** for the sold quantity (or its payment, if the business is on
  payment basis — `GstAccountingBasis` already models both).
- **Unsold and wasted goods are not a supply.** No output tax. The cost is a business expense.
- **A reconciliation must never post into a period closed by `GstPeriodLock`.** If the shop
  reports late and the period is locked, the invoice belongs in the current period. Block it
  and say so plainly rather than silently back-dating.
- Credit notes for over-invoicing use the existing `parent_invoice_id` / `credit_note_reason`
  path, which already reverses correctly.

---

## 7. SMS

To the **shop** (respecting `sms_opt_out`):

| When | Message |
|---|---|
| Dispatched | "10 momo sets delivered to <shop> today. Tell us how many you sell — reply or use the app." |
| Reminder | Unreported the morning after a delivery. |
| Reconciled | "5 sold. MVR 250 added to your account. Balance MVR X." |
| Invoiced | "Invoice <no> for MVR X. Due <date>." with the PDF link. |
| Payment received | Receipt and new balance. |
| Overdue | On the due date, then +7 days. `credit_reminder_sms` already gates this per customer. |

To the **owner/manager**, never to the shop:

| When | Message |
|---|---|
| Credit limit approaching or exceeded | Before the next dispatch is allowed. |
| Reported vs counted mismatch | Named shop, named item, both numbers. |
| Deliveries unreconciled beyond N days | Daily digest. |
| Waste above a threshold for a shop | Weekly. |

All of it through `SmsTemplate` + `SmsTemplateRenderer` so wording is editable in admin without
a deploy — the same way every other message in this system works.

---

## 8. Permissions

New, following the existing catalog pattern: `trade.view`, `trade.dispatch`, `trade.reconcile`,
`trade.invoice`, `trade.manage_accounts`, `trade.manage_prices`.

Dispatch and reconcile are the sensitive pair: whoever counts what went out should not be the
only person who says what came back. Reconciling a delivery you dispatched yourself should be
allowed but **flagged**, exactly as the refund workflow flags self-approval.

---

## 9. Stock

New `StockMovement` types: `consignment_out`, `consignment_return`, `consignment_sold`,
`consignment_waste`.

Goods on consignment are in a third state — not on our shelf, not sold. Available stock for the
shop and the order app must **exclude** them at dispatch, or the online menu will sell momos
that are sitting in someone else's fridge. This is the same class of bug as the tomorrow-order
stock reservation, and it needs its own test.

---

## 10. Build order

**Stage A — accounts and prices.** `trade_accounts`, price list, admin screens. Safe alone;
nothing moves yet.

**Stage B — dispatch.** Delivery notes, stock leaving, printed/PDF delivery note, dispatch SMS.
Now goods can go out and be tracked. Already useful on its own, even if reconciliation is
manual at first.

**Stage C — reconciliation.** Sold / returned good / returned waste / missing, returns to stock,
waste at cost, the reported-vs-counted mismatch flag.

**Stage D — invoicing and the account.** Period invoice, ledger charge, payments, statement PDF,
GST posting at the right moment. The riskiest stage; it must land with its tests.

**Stage E — the shop's own screens.** Deliveries, report sales, statement, pay online.

**Stage F — the owner's reports.** Sell-through, suggested quantities, waste by shop, margin,
ageing.

A → B → C are one coherent chunk: a dispatch you cannot reconcile is a liability. D can follow
closely. E and F are where the feature starts paying for itself, but nothing breaks without them.

---

## 11. Risks

1. **Booking revenue at dispatch.** The single worst outcome — inflated sales, wrong GST, wrong
   everything downstream. Nothing about a consignment may touch the order or payment tables.
2. **Double-counted stock.** Consigned goods must leave available stock at dispatch and only
   return on a good return.
3. **Re-pricing history.** Prices must be stamped at dispatch, never resolved live at invoice time.
4. **Under-reporting by the shop.** Mitigated by the counted-return control in §3.4. Do not
   weaken it for convenience.
5. **Reconciling into a locked GST period.** Must be blocked with a clear message.
6. **Ledger drift.** Invoice, ledger and customer balance must be written by one service in one
   transaction. Two writers will disagree eventually.
7. **Scope creep into full B2B ordering.** v1 is: we send, they sell, we invoice, they pay.
   Not purchase orders, not their stock levels, not their staff.

---

## 12. Test plan

- Dispatch creates no order, no payment, and no tax ledger entry.
- Dispatch removes the quantity from available stock; the order app can no longer sell it.
- `qty_sent = sold + returned_good + returned_waste + missing` is enforced; a reconciliation
  that does not balance is rejected.
- Returned-good quantity comes back into available stock; returned-waste does not, and lands in
  `WasteLog` at cost.
- A reported quantity that disagrees with the counted return blocks invoicing until resolved.
- The invoice covers only sold quantities, at the price stamped on the delivery line, even after
  the price list changes.
- The invoice posts exactly one `charge` to the credit ledger and moves the customer balance
  once.
- GST posts at invoice (or payment, on payment basis) and never at dispatch.
- Reconciling into a `GstPeriodLock`ed period is refused with a clear message.
- A firm-sale account invoices at dispatch for `qty_sent`.
- A payment reduces the balance once and appears on the statement and, for cash, in the shift
  close as a credit repayment.
- Dispatch is blocked when the account is over its credit limit.
- SMS respects `sms_opt_out` and every message renders from a template.
- The shop can only ever see its own deliveries, invoices and statement.

---

## 13. Sizing and sequencing, honestly

Stages A–D are comparable in size to the home page builder. The foundations already exist,
which cuts the work substantially, but this touches money, stock and tax at once — the three
areas where a mistake is expensive and slow to discover.

It should not be built in the same window as launch testing. Land Stage A and B first: even
with reconciliation on paper, knowing exactly what went to which shop is worth more than the
current situation, which is nothing.

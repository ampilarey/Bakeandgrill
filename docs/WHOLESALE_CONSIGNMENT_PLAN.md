# Selling to Other Shops (Sale-or-Return) — Plan

Status: proposed, not yet built. **Revision 2** — revised after an external review by Terra and
a second pass over the codebase. Every factual claim in that review was checked and confirmed;
two were worse than reported. Changes from revision 1 are listed in §15.

The owner's words: *"we send 10 momo sets to a shop, maybe 5 sold, 5 dustbin. They pay for
5. They might pay all together at the end of the month or middle of the month."*

That is **sale-or-return consignment**. Goods leave the bakery but are not sold yet. Only the
part the shop actually sells becomes a sale, and money moves later on account.

**Owner decisions already taken:**
- Goods that are neither sold nor returned (`qty_missing`) are **charged to the shop** by
  default, at the wholesale price, waivable case by case with an audit trail.
- Wholesale prices are **GST-inclusive**, the same rule retail prices already follow.

---

## 1. What already exists — and what it actually does

Most of the money machinery is here and unused for this. But three of the "reuse this" items
in revision 1 were wrong about how the code behaves. Corrected below.

| Capability | Where | State |
|---|---|---|
| Trade accounts with a credit limit | `customers.credit_enabled`, `credit_limit_laar`, `credit_balance_laar`, `credit_status`, `credit_payment_terms_days` (default 30), `credit_reminder_sms` | **Built.** A shop is a customer with credit turned on. |
| Running account ledger | `customer_credit_ledger` — `charge`, `payment`, `adjustment`, `refund_reversal` | **Built.** This is the shop's statement. |
| Credit services | `App\Domains\Credit\{CreditLedgerService, CustomerCreditService, CreditEligibilityService}` | **Built.** |
| Tax invoices, credit notes, PDF, due dates, part payment | `Invoice` / `InvoiceItem`, `InvoiceController::generatePdf`, `sendToCustomer` | **Built.** |
| Customer tax identity | `customers.tin`, `is_gst_registered`, `billing_address` | **Built.** |
| Goods-received inspection | `KitchenReceivingItem` — `received_qty`, `rejected_qty`, `missing_qty`, `condition`, `action`, `idempotency_key` | **Built.** Copy this shape for consignment returns; do not invent a second one. |
| SMS templates, logs, scheduling, opt-out | `SmsTemplate`, `SmsTemplateRenderer`, `SmsSchedulerService`, `customers.sms_opt_out` | **Built.** |
| Cash repayments at the till | `cash_movements.category = credit_repayment`, sub-totalled in the shift close | **Built.** |
| **Stock movements** | `stock_movements.inventory_item_id` → **`inventory_items`, i.e. ingredients** | **Built but wrong layer.** Finished momo sets are *not* inventory items. See §4. |
| **GST period lock** | `GstLedgerPoster::resolvePeriodKey` | **Built — and it REDIRECTS.** A posting into a locked period is moved to the next open period and logged. It does not fail. See §7. |
| **Payments** | `payments.order_id` is a **NOT NULL** foreign key with cascade delete | **Built, order-only.** Gift card purchases work around this by creating a shadow order. See §8. |
| **Finance reports** | `ReportsService` references orders 53 times, invoices 3 | **Built, order-based.** Wholesale revenue would be invisible. See §9. |

**Nothing exists for consignment itself.** That is the gap.

---

## 2. The one decision everything hangs on

**A consignment is not an order.**

The tempting shortcut is to raise an order for 10 and refund 5. Do not. It would book revenue
that never happened, post GST on goods sitting in someone else's fridge, inflate every sales
report, and pollute the refund workflow that was just tightened. The refund flow exists for
money that was taken and must go back — not for bread that did not sell.

The second tempting shortcut is the **shadow order** that gift card purchases use to satisfy
`payments.order_id`. Also no — a shadow order puts wholesale money straight back into the sales
reports we are trying to keep it out of. See §8.

---

## 3. The model

### 3.1 Trade account (`trade_accounts`)

One row per shop we supply. The shop is still a `Customer` (so credit, SMS, TIN and login work);
this row holds the trading terms.

| Column | Purpose |
|---|---|
| `customer_id` | The shop. |
| `shop_name`, `contact_name`, `contact_phone` | Who to call and text. Often not who signs. |
| `settlement_mode` | `sale_or_return` (bakery bears unsold) or `firm_sale` (shop pays for all sent). Default `sale_or_return`. |
| `billing_cycle` | `weekly` \| `fortnightly` \| `monthly` \| `per_delivery`. |
| `payment_terms_days` | Falls back to the customer's `credit_payment_terms_days`. |
| `missing_policy` | `charge` (default, per the owner's decision) \| `write_off` \| `dispute`. Per account, so a trusted shop can differ. |
| `delivery_days` | Which days we normally deliver. Drives the planning screen. |
| `is_active`, `notes` | |

Credit limit, balance and status stay on the customer record. Do not duplicate them.

### 3.2 Wholesale prices (`trade_price_list_entries`)

Per account, per item (optionally per variant): the agreed price in laari, **GST-inclusive**.

Resolution order, and it must be one function used everywhere:
1. account-specific price for this item
2. the item's default wholesale price (new nullable column on `items`)
3. **base retail price** minus the account's default discount percentage

Rule 3 must read the item's plain retail price — **never** a promotional price, a daily special,
a happy-hour price, a platter price or a channel-specific price. A promotion aimed at walk-in
customers must never silently become a shop's wholesale rate. Resolve it through one dedicated
function with a test proving an active promotion does not change the wholesale price.

Prices are **stamped onto the delivery line at dispatch**. If the price list changes next week,
last week's delivery must not re-price. This is the most common way wholesale billing goes wrong.

### 3.3 Delivery note (`trade_deliveries` + `trade_delivery_lines`)

What physically left the building.

`trade_deliveries`: account, delivery number, `dispatched_at`, `dispatched_by`, driver,
status, `expected_return_at`, notes, signature/photo (reuse the existing media plumbing),
`idempotency_key` (unique).

`trade_delivery_lines`: item, variant, `qty_sent`, `unit_price_laar` (stamped, GST-inclusive),
`unit_cost_laar` (stamped, for margin and waste costing), and later `qty_sold`,
`qty_returned_good`, `qty_returned_waste`, `qty_missing`.

**The arithmetic that must always hold:**

```
qty_sent = qty_sold + qty_returned_good + qty_returned_waste + qty_missing
```

Enforced in the service and by a database check constraint where the engine allows it. A
reconciliation that does not balance is rejected.

**A dispatched delivery note is immutable.** Once goods leave, the note is a record of a
physical event. Corrections are separate, audited adjustment rows that reference it — never an
edit in place. Same principle the refund and shift-close work already follows.

Status: `draft` → `dispatched` → `reconciled` → `invoiced` → `settled`, plus `cancelled`.

### 3.4 Return and reconciliation

Two separate acts, and conflating them is how stock goes wrong:

**a) The shop reports.** How many they sold. A claim, not a fact. Recorded with who said it and
when.

**b) Staff inspect what came back.** Modelled directly on `KitchenReceivingItem`, which already
solves this problem: per line, a counted quantity, a `condition`, and an `action`
(`accept_to_stock` / `reject_to_waste`), plus an idempotency key.

**Returned goods do not go back into sellable stock because a driver counted them.** They go
back only when a staff member accepts them after inspection. Food that has spent a day in
another shop's display is waste unless someone competent says otherwise. Rejected quantity
becomes a `WasteLog` entry **at cost**, so the owner can see what consignment is costing him.

If (a) and (b) disagree, the delivery is **flagged and cannot be invoiced** until someone
resolves it. The physical count is the truth; the reported number is a claim. This is the whole
anti-shrinkage control and it must not be weakened for convenience.

`qty_missing` — sent, not sold, not returned — follows the account's `missing_policy`, default
**charge**: it goes on the invoice at the wholesale price as a distinct line type, so it is
visible as "not returned" and not buried in sales. Waiving it requires a reason and is audited.

### 3.5 Invoicing and the account

**The credit balance moves once, when the invoice is created. Never at reconciliation.**
Reconciliation confirms quantities; it does not move money. (Revision 1 contradicted itself on
this — see §15.)

At the end of the billing cycle (or per delivery, per the account setting):

- raise **one tax invoice** covering every reconciled delivery in the period, one line per item
  with total sold quantity, plus separate lines for charged missing quantity
- write `trade_invoice_allocations` rows: `invoice_id`, `trade_delivery_line_id`, `qty_invoiced`,
  `amount_laar`. **This table is not optional.** Without it the system can double-bill a
  delivery line, cannot trace an invoice back to the deliveries behind it, and cannot correct
  one line later. A delivery line's invoiced quantity may never exceed its sold + charged-missing
  quantity — enforce with a unique key and a service-level check.
- post exactly one `charge` to `customer_credit_ledger`, through `CreditLedgerService`. Never
  write `credit_balance_laar` directly.

Invoice, allocations and ledger charge are written in **one transaction by one service**. Two
writers will disagree eventually.

Over-invoicing is corrected by a credit note through the existing `parent_invoice_id` /
`credit_note_reason` path, which also reverses the allocations.

**Firm-sale accounts** invoice `qty_sent` at dispatch. Same tables, different trigger.

---

## 4. Stock custody — which stock, and deducted once

Revision 1 said "add new `StockMovement` types". That was wrong: `stock_movements` is keyed to
`inventory_items`, which are **ingredients**. A finished momo set is an `Item` with
`stock_quantity` / prepared stock, managed by `StockManagementService`,
`StockReservationService` and `PreparedStockController`.

So:

- A trade delivery moves **finished goods** — `items.stock_quantity` (and variant stock where
  the item has variants). It is the same stock the POS and the order app sell from.
- Dispatch **deducts finished-goods stock once**, at dispatch, and records the movement through
  the existing prepared-stock service so the adjustment is audited like every other one.
- Marking a line sold at reconciliation **must not deduct anything again**. The goods left the
  building at dispatch. A test must prove that sold quantity causes no second deduction.
- Accepted returns add stock back once, on staff acceptance, not on the driver's count.
- Ingredient-level `stock_movements` are untouched: the ingredients were consumed when the
  momos were produced, which the kitchen production flow already handles.

Consigned goods are in a third state — not on our shelf, not sold. Available stock for the POS
and the order app must **exclude** them from the moment of dispatch, or the online menu will
sell momos sitting in someone else's fridge. Same class of bug as the tomorrow-order stock
reservation, and it needs its own test.

---

## 5. Credit exposure — the limit must count goods, not just debt

A shop can owe MVR 0 and be holding MVR 10,000 of unbilled stock. Checking only
`credit_balance_laar` before a dispatch is therefore useless.

Define, in one function used by every dispatch check and shown on the account screen:

```
exposure = credit_balance_laar
         + value of dispatched-but-not-yet-invoiced goods at stamped wholesale price
```

Dispatch is blocked when `exposure + this delivery` would exceed the credit limit. The owner can
override with a reason, audited. The account screen shows both numbers separately — "owes MVR X,
holding MVR Y of our stock" — because they mean different things.

---

## 6. What each side sees

**The shop** (already a `Customer` with phone login, so this is a section in the existing order
app, not a new application):

- **Deliveries** — what arrived, when, quantities, agreed prices.
- **Report sales** — plain number boxes: "Momo set — 10 delivered — how many did you sell?"
  Submitting records that they agreed, with a timestamp. Editable until we reconcile.
- **Statement** — invoices, payments, running balance, what is due and when. PDF download.
- **Pay** — see §8.

v1 access: **one authorised phone per account**, the customer login that already exists. Multiple
named contacts is a later change and needs its own permission thinking.

**The owner:**

- Out on consignment right now — at cost and at wholesale, by shop and by item.
- Unreconciled deliveries older than N days. This is where money leaks.
- **Sell-through per shop per item** with a suggested next quantity from the trailing average.
  "Shop A sells 5 of 10 every time — send 6." This is the single biggest saving the feature can
  produce, and it is pure arithmetic on data we will now have.
- Waste cost by shop — what sale-or-return actually costs, per customer.
- Margin per shop — wholesale price less cost less waste.
- Ageing receivables, and exposure against limit per §5.

---

## 7. GST

- **Nothing posts on dispatch.** Moving your own goods to a shop that has not sold them is not a
  supply. `PostGstOnOrderPaidListener` must never see consignments.
- **The tax point is the trade invoice** (or its payment, on payment basis).
- Wholesale prices are **GST-inclusive**, matching retail. The GST portion is extracted from the
  price, not added to it, and `tax_rate_bp` is stamped on the invoice as it already is.
- Unsold and wasted goods are **not a supply** — no output tax. The cost is a business expense.
- **Locked periods: follow the existing behaviour, do not invent a second one.**
  `GstLedgerPoster::resolvePeriodKey` redirects a posting into a locked period to the next open
  period and logs it. Revision 1 said "block it", which would have made trade invoices the only
  posting in the system that behaves differently. Keep the redirect, and make sure the invoice
  date and the ledger period date are both recorded so the accountant can see when the two
  differ. Show it on the invoice screen rather than hiding it in a log line.
- **Payment-basis GST on a standalone trade invoice needs work.** The existing payment-basis path
  is driven by order payments. If the business is on payment or hybrid basis, posting on a trade
  invoice's payment is new code, not configuration. Scope it explicitly in Stage D and confirm
  the treatment with the accountant before building.

---

## 8. Receivable payments — a real path, not a button

`payments.order_id` is a **NOT NULL foreign key**. A trade invoice payment cannot use the
existing table as it stands, and the gift-card workaround — creating a shadow order — is exactly
what §2 forbids.

Required:

- make `payments.order_id` **nullable** and add a nullable `invoice_id`, with a constraint that
  exactly one of the two is set; migrate nothing (every existing row keeps its order)
- a receivable payment service that records the payment, allocates it to one or more invoices
  (part payment must work), and posts the `payment` entry to the credit ledger — one transaction
- the BML online path currently starts at `PaymentController::initiateOnline($orderId)`; it needs
  an invoice-keyed sibling, with the webhook and return handlers able to settle an invoice
  payment idempotently
- cash at the till keeps working exactly as now, through `cash_movements` with
  `category = credit_repayment`, so the shift close is unaffected

Every write path — dispatch, reconciliation, invoice charge, payment — carries an **idempotency
key with a unique database index**. A driver on bad signal will retry.

---

## 9. Reports — wholesale must be visible, and counted once

`ReportsService` reads orders almost exclusively. Trade invoices would appear in accounts
receivable and nowhere else: not in daily sales, not in P&L, not in cash flow, not in top items.

Add **wholesale as a distinct revenue channel** to the sales, daily summary, P&L, cash-flow and
top-item reports, recognised once at the tax point (invoice, or payment on payment basis) and
clearly separated from retail so the owner can see both. Do not merge it into retail totals —
the margins and the risks are different.

---

## 10. Permissions

New, following the existing catalog pattern: `trade.view`, `trade.dispatch`, `trade.reconcile`,
`trade.invoice`, `trade.manage_accounts`, `trade.manage_prices`.

Dispatch and reconcile are the sensitive pair: whoever counts what went out should not be the
only person who says what came back. Reconciling a delivery you dispatched yourself is allowed
but **flagged**, exactly as the refund workflow flags self-approval.

---

## 11. Build order

**Stage A — accounts and prices.** `trade_accounts`, price list, admin screens. Safe alone;
nothing moves yet.

**Stage B+C — dispatch AND reconciliation, together.** Revision 1 proposed shipping dispatch
alone. That was wrong: dispatch deducts finished-goods stock and nothing returns it without
reconciliation, so stock would drift from day one. They ship as one release: delivery notes,
stock out, inspection and returns, waste at cost, missing quantities, the reported-vs-counted
flag, exposure checks, dispatch SMS.

**Stage D — invoicing, ledger, receivable payments, GST.** The riskiest stage. Includes the
`payments` schema change (§8) and the payment-basis question (§7). Lands with its tests or not
at all.

**Stage E — the shop's screens.** Deliveries, report sales, statement, pay online.

**Stage F — the owner's reports.** Sell-through, suggested quantities, waste by shop, margin,
ageing, and the wholesale channel in the core reports (§9).

---

## 12. Risks

1. **Booking revenue at dispatch.** The worst outcome — inflated sales, wrong GST, everything
   downstream wrong. Nothing about a consignment may touch the order or payment-on-order tables.
2. **Wrong stock layer, or double deduction.** §4. Finished goods, deducted once, at dispatch.
3. **Re-pricing history.** Prices stamped at dispatch, never resolved live at invoice time.
4. **A promotion leaking into wholesale prices.** §3.2 rule 3.
5. **Double-billing a delivery line.** Prevented only by the allocation table in §3.5.
6. **Under-reporting by the shop.** Mitigated by the counted-return control in §3.4.
7. **Returned food going back on sale without inspection.** §3.4. A food-safety risk, not just an
   accounting one.
8. **Credit limit that ignores goods held.** §5.
9. **Ledger drift.** One service, one transaction, for invoice + allocations + charge.
10. **Retries creating duplicates.** Idempotency keys with unique indexes on every write path.
11. **Scope creep into full B2B ordering.** v1 is: we send, they sell, we invoice, they pay.
    Not purchase orders, not their stock levels, not their staff.

---

## 13. Test plan

- Dispatch creates no order, no payment row, and no tax ledger entry.
- Dispatch deducts finished-goods stock once; the order app can no longer sell that quantity.
- Marking a line sold at reconciliation causes **no second stock deduction**.
- `qty_sent = sold + returned_good + returned_waste + missing` is enforced; an unbalanced
  reconciliation is rejected.
- Returned stock re-enters availability only after staff acceptance, never on the driver's count
  alone; rejected quantity lands in `WasteLog` at cost.
- A reported quantity disagreeing with the counted return blocks invoicing until resolved.
- The wholesale price is unaffected by an active promotion or daily special on the same item.
- The invoice uses the price stamped on the delivery line even after the price list changes.
- Missing quantity is invoiced under `missing_policy = charge`, and not invoiced under
  `write_off`; waiving requires a reason and writes an audit entry.
- A delivery line cannot be invoiced twice; allocations sum to no more than sold + charged
  missing.
- The invoice posts exactly one ledger `charge` and moves the balance once.
- GST posts at the invoice, never at dispatch; a posting into a locked period is redirected to
  the next open period exactly as order postings are, and both dates are recorded.
- Dispatch is blocked when balance + unbilled consignment value would exceed the credit limit;
  an override is audited.
- A part payment against a trade invoice reduces the balance once, appears on the statement, and
  for cash appears in the shift close as a credit repayment.
- A retried dispatch, reconciliation, invoice or payment with the same idempotency key creates
  one record, not two.
- Wholesale revenue appears in the sales and P&L reports exactly once, separated from retail.
- The shop can only ever see its own deliveries, invoices and statement.
- SMS respects `sms_opt_out` and every message renders from a template.

---

## 14. Sizing, honestly

Stages A through D are comparable in size to the home page builder, and this one touches money,
stock and tax simultaneously — the three areas where a mistake is expensive and slow to
discover. The existing foundations cut the work substantially, but §8 (payments schema) and §7
(payment-basis GST) are genuine new plumbing, not configuration.

It should not be built in the same window as launch testing.

---

## 15. What changed in revision 2

Prompted by Terra's review; every point below was verified against the code before accepting it.

1. **Contradiction removed.** Revision 1 charged the ledger at invoice time but had the
   reconciliation SMS say the money was "added to your account". Reconciliation now confirms
   quantities only; the SMS says it will be on the next invoice.
2. **Allocation table added** (`trade_invoice_allocations`) — §3.5.
3. **Stock layer corrected** — §4. Revision 1 named `stock_movements`, which is keyed to
   ingredients. Finished goods are `items.stock_quantity` / prepared stock.
4. **Return inspection added** — §3.4, modelled on the existing `KitchenReceivingItem`
   (`condition`, `action`, quantities, idempotency key). Returns need staff acceptance.
5. **Credit exposure defined** — §5. Limit checks now count unbilled goods held by the shop.
6. **`qty_missing` policy decided** — charge by default, per account, waivable and audited.
7. **Receivable payment path added** — §8. `payments.order_id` is NOT NULL; the shadow-order
   workaround is explicitly forbidden.
8. **GST lock corrected** — §7. The existing poster *redirects* to the next open period; revision
   1 wrongly said to block. Payment-basis on a standalone invoice flagged as new work.
9. **Reports section added** — §9. Wholesale as a distinct channel.
10. **Build order corrected** — §11. Dispatch and reconciliation ship together; revision 1
    wrongly proposed dispatch alone.
11. **Smaller additions** — GST-inclusive wholesale prices, base-retail fallback that excludes
    promotions, idempotency keys with unique indexes, immutable dispatched delivery notes, one
    authorised shop phone for v1.

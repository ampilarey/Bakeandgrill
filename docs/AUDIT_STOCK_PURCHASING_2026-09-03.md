# Stock, buying, cost and vendors — audit

**Date:** 2026-09-03
**Asked:** "audit everything related to the stock count and how items that are
bought entered and its price and vendors are there"
**Scope:** how stock is counted and corrected, the two ways a purchase enters
stock, how a purchase sets an item's cost, and what is held about suppliers.

**Audited read-only, then fixed on the owner's "fix all" the same day** — see
Status below. The Findings keep the original wording so the fault is on record;
each one says what was done.

---

## How stock moves

Every change writes a row to `stock_movements` — quantity, `balance_after`, who
did it, the type, and what it refers to. That is a real ledger, not a running
total: `current_stock` can always be re-derived from it.

| Type | Written by |
|---|---|
| `purchase` | A received purchase order, and a verified purchase-request buy |
| `sale` | `InventoryDeductionService` on a paid order (recipe-driven) |
| `refund` | Restore on refund |
| `adjustment` | Manual adjust, and **every stock count** |
| `waste` | Waste log |
| `consignment_in` / `consignment_out` | Trade dispatch and reconcile |

Two protections worth naming, both verified:

- **Receipts are idempotent.** A purchase line writes
  `purchase:{id}:item:{lineId}`, a purchase-request line
  `purchase_request:{prId}:item:{itemId}`, and the writer checks for that key
  first. A retried request cannot double-count stock.
- **Rows are locked.** Both receipt paths and the stock count take
  `lockForUpdate()` on the inventory row before reading the old quantity and
  cost, so two receipts at once cannot interleave and lose one.

Scheduled: `inventory:check-reorder` daily at 08:00, `inventory:check-expiry`
at 08:05.

## How a bought item gets in, and what it does to the cost

There are **two doors**, and they behave differently.

**1. Purchase order** — `PurchaseController::store()`. `unit_cost` is required
per line. On receipt the item's cost becomes the weighted average:

```
unit_cost = (old_stock × old_cost + new_qty × new_cost) ÷ (old_stock + new_qty)
```

`last_purchase_price` is set to what was just paid, and a `SupplierPriceHistory`
row records supplier + item + price + date.

**2. Purchase request → buying list → verify** —
`PurchaseRequestVerificationService::applyStockIn()`. A staff member requests,
someone approves, a runner marks it bought on the POS buying list, and a
verifier receives it. Same weighted-average formula. **`actual_unit_cost_laar`
is optional on this path** — see S1.

`unit_cost` is what the rest of the system means by "what this costs us": it
feeds `RecipeCostCalculator` (and so recipe cost, dish margin and the break-even
calculator), the inventory valuation report, and the spend reports.

## What is held about a vendor

`suppliers`: name, contact name, phone, email, TIN, address, payment terms,
notes, active flag. Plus, around it:

- `supplier_price_history` — every price actually paid, per item, with a date.
- `purchase_items` — the same fact, recorded by the purchase-order path.
- `supplier_ratings` and `supplier_performance_cache` — scoring, refreshed by
  `SupplierIntelligenceController`.
- `inventory_items.preferred_supplier_id` — one nominated vendor per item.

---

## Status — fixed 2026-09-03

All of them, plus one more the fixes uncovered.

| | Finding | Outcome |
|---|---|---|
| S1 | A receipt with no price destroyed the cost | No price, no opinion: stock in, cost untouched |
| S2 | Stock count unreviewed | Valued per line; a reason required over a threshold |
| S3 | Cheapest supplier read one source, all time | Reads price history, windowed to 90 days |
| S4 | No theoretical-vs-actual usage | New Usage Variance report, screen and CSV |
| S5 | Adjustments needed no reason | Same threshold rule as the count |
| S6 | No per-vendor lead time, no invoice check | `suppliers.lead_days`; paid-vs-quote recorded on every buy |
| S7 | Retry duplicated a price point | Moved inside the idempotency guard |
| S8 | Negative stock only showed up later | Logged and audited the moment it happens |
| S9 | *(found while fixing)* an adjustment with no unit cost threw a 500 | `stock_movements.unit_cost` is nullable |

The threshold lives in **Settings → Stock Corrections** (MVR 500 to begin with).

---

## Findings

### S1 — A receipt with no price entered quietly destroys the item's cost (high) — **FIXED**

`applyStockIn()` computes `$newCost = ($item->actual_unit_cost_laar ?? 0) / 100`
and averages it in. On `markBought` and `markPartial` that field is
`nullable`, and the POS buying list sends nothing at all when the price box is
left blank (`mvrToLaar()` returns `undefined` for an empty string).

So a runner who does not type the price causes this:

> 10 kg on hand at MVR 20.00 · receive 10 kg with no price
> → `unit_cost` becomes **MVR 10.00**

Half the cost of that ingredient, silently, on a stock movement that otherwise
looks correct. Do it twice and it is a quarter. `last_purchase_price` is guarded
(`if ($newCost > 0)`) — `unit_cost`, the one everything reads, is not.

It flows straight into recipe cost, dish margin, the break-even calculator and
the inventory valuation, so the damage is not confined to one screen. The
purchase-order path is safe: `unit_cost` is required there.

**Fixed.** Both receipt paths now treat "no price" as no opinion about cost:
the stock arrives, `unit_cost` and `last_purchase_price` are left exactly as
they were, and the movement records `unit_cost` as null — "we do not know",
which a report can tell apart from "this was free". The buy is audited with
`no_price_recorded` so the gap is findable.

### S2 — A stock count is one unreviewed write (medium) — **FIXED**

`POST /inventory/stock-count` takes a list of item ids and quantities, sets
`current_stock` to each, writes an `adjustment` movement and an audit row.
`notes` is optional. There is no count session, no blind entry, no variance
threshold, and no second pair of eyes: anyone with `inventory.manage` can write
the most valuable thing in the store-room down to zero, and nothing asks why.

Worth contrasting with the cash count at close of shift, which is deliberately
blind, has variance thresholds, and raises an alert. Stock has none of that,
though it is the same class of risk.

**Fixed (a and b).** Every count line is valued at what the item costs, the
value comes back in the response and goes into the audit row, and a line worth
more than **Settings → Stock Corrections** (MVR 500 to begin with) is refused
until it says why. Nothing is written until every line passes, so a rejected
count leaves the stock exactly as it was. The threshold is in money, not units:
a kilo of saffron asks sooner than a kilo of rice.

Not done: (c), a full count session with a second person posting it. That is a
workflow, not a guard, and worth doing on its own.

### S3 — Two records of what was paid, and "cheapest supplier" only reads one (medium) — **FIXED**

Purchase orders record price in `purchase_items`; purchase-request buys record
it in `supplier_price_history`. `InventoryController::cheapestSupplier()` queries
`purchase_items` alone, so **every price paid through the buying list is
invisible to it** — which is most of the day-to-day buying.

It also takes an all-time `MIN(unit_cost)` with no date window, so a price from
a year ago beats a real quote from this week.

**Fixed.** It reads `supplier_price_history`, which both paths write, and
windows it — 90 days by default, `?days=` to change it, `days=0` for all time.
The answer says which supplier, when that price was last seen, and whether it
came from inside the window or is an older fallback.

### S4 — Nothing compares what should have been used with what was (medium) — **FIXED**

Recipes deduct ingredients as dishes are sold, and a stock count writes what is
really on the shelf. The difference between the two is the number that finds
theft, over-portioning and unrecorded waste — and nothing computes it. The
`stock-discrepancy` report only lists items already negative, which is the
symptom after the fact.

**Fixed.** **Reports → Inventory → Usage Variance**, with a CSV. Read straight
off the ledger, so it needs no new bookkeeping: per item over a date range, what
came in, what the recipes took, what was thrown away, and what the counts had to
correct — that correction being the unexplained part, valued at what the item
costs, worst first, with the total loss on top.

### S5 — Manual adjustments need no reason (low) — **FIXED**

`POST /inventory/{id}/adjust` takes any signed quantity with `type` in
`adjustment | waste | correction` and `notes` nullable. It is audited and
ledgered, but a stock write-down of any size can be made with no words attached.

**Fixed.** Same rule and same threshold as the count.

### S6 — A supplier record has no price list and no lead time (low) — **FIXED**

Prices exist only as the history of what was actually paid. There is no agreed
price per item, so an invoice cannot be checked against what was quoted, and no
per-supplier lead time (`lead_days` lives on the inventory item, so one item has
one lead time regardless of who supplies it).

**Fixed, using what was already there.** `suppliers.lead_days` gives each vendor
its own lead time. For the price half there is no need for a parallel price
list: the buying list already takes **quotes** per line, so marking an item
bought now compares what was paid against the cheapest quote on that line and
records `cheapest_quote_laar` and `over_quote_laar` in the audit trail. Paying
over the quote leaves a trail instead of passing quietly.

### S7 — A duplicated purchase writes a duplicate price point (low) — **FIXED**

In `PurchaseController::store()` the `SupplierPriceHistory::create()` sits
outside the `StockMovement` idempotency check. The stock is protected; the price
history is not, so a retried create can leave two identical price points and
skew any average built on them.

### S8 — Negative stock is allowed, and only shows up in a report (informational) — **FIXED**

Sales deduct past zero. `inventoryValuation` flags negative lines and
`stock-discrepancy` lists them, but nothing blocks or alerts at the moment it
goes negative — which is when someone could still say why.

**Fixed.** The first time an item crosses below zero it writes a warning to the
log the ops alerting already watches, and an `inventory.went_negative` audit row
naming the item, what it was, what it went to, and the order that did it. Sales
are not blocked — a kitchen that has run out still has to be able to sell what
it has.

### S9 — An adjustment with no unit cost threw a 500 (medium) — **FIXED**

Found while fixing the rest. `POST /inventory/{id}/adjust` passes
`unit_cost => null` when the caller does not send one, and
`stock_movements.unit_cost` was `NOT NULL` — so the insert failed and the
endpoint returned a 500 rather than recording the adjustment. The column is
nullable now, which the S1 fix wanted anyway: null means "we do not know what
this cost", which is a different thing from zero.

---

## Follow-up: backdating, 2026-09-04

Asked the next day: "Can i add an item i bought backdated?" It half worked. A
purchase order already carried its own `purchase_date` and honoured it; the
buying list did not, and neither did the ledger underneath both of them.

| | Finding | Outcome |
|---|---|---|
| B1 | A second backdated purchase entered the same day died on a duplicate PO number | The sequence counts what was entered today, not what is dated today |
| B2 | The buying list stamped `now()` with no way to say otherwise | Optional **Bought on** date, defaulting to today |
| B3 | The expense it raised was dated today, not the day of the buying | Dated from the earliest line's `bought_at` |
| B4 | The stock ledger had no date of its own, so every report saw a backdated receipt as today's | New `stock_movements.occurred_at`; Usage Variance reads it |
| B5 | Nothing stopped a purchase being dated in the future | One window for both doors: no forward dates, 90 days back |

**B1 was the sharp one.** `generatePurchaseNumber()` built `PO-<today>-<seq>`
where the sequence counted purchases *dated* today. A backdated purchase never
advanced that counter, so the next purchase — backdated or not — was handed a
number already taken, and `purchase_number` is unique. The insert failed and
nothing saved. One backdated entry therefore poisoned the numbering for the rest
of the day.

**B4 is the one with reach.** `occurred_at` is when it happened; `created_at`
stays when it was written down. They agree for everything entered as it happens,
which is why the backfill is a straight copy, and rows written before the column
existed hold null and fall back to `created_at`. Without it, backdating a
delivery into last month left last month's Usage Variance still showing the
stock as missing while this month showed a phantom receipt — the report added
the day before would have quietly lied about exactly the case it exists for.

The window lives in `BackdatePolicy` — 90 days, overridable by the
`purchase_backdate_max_days` setting, and forward-dating is refused outright.

---

## Checked and correct

- Both receipt paths are idempotent and lock the row before touching stock or cost.
- Weighted-average costing is applied consistently in both.
- Every movement carries the actor, the type, the balance after, and a reference.
- Stock counts and adjustments are audit-logged with before/after.
- Reorder and expiry checks run daily and alert on failure.
- `inventory.view` / `inventory.manage` gate the endpoints; `manage` implies `view`.

# Stock, buying, cost and vendors — audit

**Date:** 2026-09-03
**Asked:** "audit everything related to the stock count and how items that are
bought entered and its price and vendors are there"
**Scope:** how stock is counted and corrected, the two ways a purchase enters
stock, how a purchase sets an item's cost, and what is held about suppliers.
Read-only — nothing in this pass was changed.

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

## Findings

### S1 — A receipt with no price entered quietly destroys the item's cost (high)

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

*Fix:* skip the cost average when no price was given (take the stock, keep the
old cost), and make the price required to verify — or ask for it at verify time
if the runner did not have it.

### S2 — A stock count is one unreviewed write (medium)

`POST /inventory/stock-count` takes a list of item ids and quantities, sets
`current_stock` to each, writes an `adjustment` movement and an audit row.
`notes` is optional. There is no count session, no blind entry, no variance
threshold, and no second pair of eyes: anyone with `inventory.manage` can write
the most valuable thing in the store-room down to zero, and nothing asks why.

Worth contrasting with the cash count at close of shift, which is deliberately
blind, has variance thresholds, and raises an alert. Stock has none of that,
though it is the same class of risk.

*Fix, in order of value:* (a) require a reason on any line whose variance is
worth more than a set amount; (b) show the variance in MVR as it is entered, and
record it on the movement; (c) a proper count session — open, enter, review the
variance, post — with the posting gated on a second person for large ones.

### S3 — Two records of what was paid, and "cheapest supplier" only reads one (medium)

Purchase orders record price in `purchase_items`; purchase-request buys record
it in `supplier_price_history`. `InventoryController::cheapestSupplier()` queries
`purchase_items` alone, so **every price paid through the buying list is
invisible to it** — which is most of the day-to-day buying.

It also takes an all-time `MIN(unit_cost)` with no date window, so a price from
a year ago beats a real quote from this week.

*Fix:* read `supplier_price_history` (both paths write it, and it carries
`recorded_at`), and window it — last 90 days, say.

### S4 — Nothing compares what should have been used with what was (medium)

Recipes deduct ingredients as dishes are sold, and a stock count writes what is
really on the shelf. The difference between the two is the number that finds
theft, over-portioning and unrecorded waste — and nothing computes it. The
`stock-discrepancy` report only lists items already negative, which is the
symptom after the fact.

*Fix:* a usage-variance report between two counts — opening + purchases − recipe
usage − waste = expected, against counted, valued at `unit_cost`.

### S5 — Manual adjustments need no reason (low)

`POST /inventory/{id}/adjust` takes any signed quantity with `type` in
`adjustment | waste | correction` and `notes` nullable. It is audited and
ledgered, but a stock write-down of any size can be made with no words attached.

*Fix:* require notes when the movement's value passes a threshold, the same rule
S2 wants.

### S6 — A supplier record has no price list and no lead time (low)

Prices exist only as the history of what was actually paid. There is no agreed
price per item, so an invoice cannot be checked against what was quoted, and no
per-supplier lead time (`lead_days` lives on the inventory item, so one item has
one lead time regardless of who supplies it).

### S7 — A duplicated purchase writes a duplicate price point (low)

In `PurchaseController::store()` the `SupplierPriceHistory::create()` sits
outside the `StockMovement` idempotency check. The stock is protected; the price
history is not, so a retried create can leave two identical price points and
skew any average built on them.

### S8 — Negative stock is allowed, and only shows up in a report (informational)

Sales deduct past zero. `inventoryValuation` flags negative lines and
`stock-discrepancy` lists them, but nothing blocks or alerts at the moment it
goes negative — which is when someone could still say why.

---

## Checked and correct

- Both receipt paths are idempotent and lock the row before touching stock or cost.
- Weighted-average costing is applied consistently in both.
- Every movement carries the actor, the type, the balance after, and a reference.
- Stock counts and adjustments are audit-logged with before/after.
- Reorder and expiry checks run daily and alert on failure.
- `inventory.view` / `inventory.manage` gate the endpoints; `manage` implies `view`.

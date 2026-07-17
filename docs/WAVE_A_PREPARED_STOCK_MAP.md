# Wave A — Prepared stock flow map & completion notes

**Status:** Implemented and covered by `tests/Feature/Stock/PreparedStockTest.php` (15 scenarios).  
**Date:** 2026-07-17  
**Policy:** POS immediate deduct · Online reserve → deduct on `OrderPaid` · Release on cancel / stale / refund.

---

## 1. Where `items.stock_quantity` is checked

| Location | Behavior |
|---|---|
| `OrderCreationService::addOrderItems` | Locks item/variant (`lockForUpdate`), calls `StockReservationService::getAvailableStock` / `getAvailableVariantStock` (on-hand − active reservations). Aborts 422 if short. Skipped for offline POS sync. |
| `StockManagementService::checkStock` | **Dead** — no callers. |

Prepared-stock gate: `track_stock` + `availability_type === 'stock_based'` (item) or `variant.track_stock`.

---

## 2. Where payment success is applied

| Path | Stock effect |
|---|---|
| `PaymentService` / settle / BML webhook / `PaymentConfirmedListener` → `OrderPaid` | Dispatched after commit |
| `DeductPreparedStockListener` (queued) | Online only → `StockReservationService::convertToDeduction` → `deductPreparedStock` / `deductVariantStock` (idempotent movement keys) |
| `DeductInventoryListener` (sync) | Recipe ingredients via `InventoryDeductionService` — separate from menu prepared stock |

POS prepared stock is **already deducted at create**; `DeductPreparedStockListener` skips POS types.

---

## 3. Where cancellations run

| Path | Prepared stock |
|---|---|
| `OrderStatusController` (POS cancel) | Inline `restorePreparedStock` / `restoreVariantStock` + `OrderCancelled` |
| `PaymentService::cancelOrderOnPaymentFailure` | `OrderCancelled` → `ReleasePreparedStockOnCancelListener` → `releaseForOrder` |
| `CancelStaleOrders` | Inline `releaseForOrder` + `OrderCancelled` |
| `AdminMaintenanceService` | Cancel + POS restore helpers |

---

## 4. Where refunds run

| Path | Prepared stock |
|---|---|
| `RefundController` | Restore if `wasPreparedStockDeductedForLine`; also `releaseForOrder` for any leftover reservation |
| `RestoreInventoryOnRefundListener` | Recipe inventory only |

---

## 5. Double-deduct risk points (mitigated)

- Duplicate `OrderPaid` → idempotent `StockMovement` keys (`online:order:{id}:item:{orderItemId}`, `pos:order:…`)
- BML webhook retry → covered in `PreparedStockTest`
- POS edit → restore with old line id keys, re-deduct with new line ids (no collision)

---

## 6. Never-deduct risk points (historical — fixed)

Previously: check-only, no deduction. **Current:** POS deducts at create; online converts on pay. Covered by tests.

Remaining ops risk: prepared convert is **queued** — if Redis workers are down, on-hand may lag until worker catches up (reservations still hold availability).

---

## Flow summary

```
POS (dine_in / takeaway / …):
  create → check available → deductPreparedStock
  cancel / edit → restorePreparedStock
  OrderPaid → recipe inventory only

Online (online_pickup / delivery):
  create → check available → reserveForOrder (TTL = payment_pending)
  pay → convertToDeduction → deduct + delete reservation
  fail / stale / cancel → releaseForOrder
  refund after deduct → restorePreparedStock
```

---

## Dead / unused APIs (left in place, not wired)

- `StockManagementService::checkStock` / `deductStock`
- `StockReservationService::reserveStock` / `clearSessionReservations` (cart-session hold; order-level path is live)

---

## Files (live path)

- `app/Services/StockReservationService.php`
- `app/Services/StockManagementService.php`
- `app/Domains/Orders/Services/OrderCreationService.php`
- `app/Domains/Orders/Listeners/DeductPreparedStockListener.php`
- `app/Domains/Orders/Listeners/ReleasePreparedStockOnCancelListener.php`
- `app/Domains/Inventory/Listeners/DeductInventoryListener.php`
- `app/Console/Commands/CancelStaleOrders.php`
- `app/Http/Controllers/Api/RefundController.php`
- `tests/Feature/Stock/PreparedStockTest.php`

**Migrations:** none required for this close-out (reservations table already has `order_id`).

---

## Test coverage

See `PreparedStockTest`: POS deduct, online reserve, pay convert, payment fail release, stale cancel, idempotent double-release, refund restore, last-unit concurrency, duplicate OrderPaid, shared POS+online column, made_to_order skip, BML duplicate webhook.

---

## Risks left before Wave B

1. Queue worker must run on each env for online prepared convert.
2. Do not model the same physical unit as both prepared finished goods and a full recipe BOM deduct.
3. Cart-session `reserveStock` remains unused (checkout holds only after order create).
4. HTTP blocks edits on `payment_pending` online orders (by design).

**Next wave:** B — global online ordering master switch + schedule + override (online endpoints only).

# Wave F — Order status transitions (completion notes)

**Status:** Implemented (close-out 2026-07-17)  
**Tests:** `OrderStatusMachineTest`, `OrderStateMachineParityTest`

---

## Single write path

| Piece | Role |
|---|---|
| `OrderStatusMachine` | Allowed edges (SoT) |
| `OrderStatusTransitionService::transition()` | Preferred write: assert + update |
| `OrderObserver::updating` | Blocks illegal `$order->update(['status' => …])` |
| Domain `OrderStateMachine` | **Deprecated / unwired** — do not swap in |

Callers should use the transition service (or assert then update). External HTTP routes and payloads are unchanged.

---

## Map coverage (Wave F additions)

- Delivery: `ready` → `out_for_delivery` → `picked_up` → `on_the_way` → `delivered` → `completed` / refunds  
- Cook-then-pay: `in_progress` / `ready` → `paid` / `partial`  
- Pay-link re-hold: `pending` / `partial` → `payment_pending`  

---

## Wired writers

- `EloquentOrderRepository::updateStatus` (payments / BML path)
- `SettleOrderPaymentAction` (held→pending, →paid/partial)
- `PaymentController` (→payment_pending)
- `RefundController`
- `CancelStaleOrders`
- `DeliveryDriverController::assignDriver` (ready→out_for_delivery)
- `DriverDeliveryController::updateStatus`

POS/KDS controllers already asserted via the machine before update.

---

## Risks left

- A few merge/cancel helpers may still set status directly; observer still guards.
- Payment lifecycle still overlaps kitchen vocabulary (`paid` as a kitchen-visible status).
- Silent observer block remains if a caller ignores 422 from the service (logs warning).

**Cafe roadmap Waves A–F:** complete.

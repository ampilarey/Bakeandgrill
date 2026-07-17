---
name: Cafe ordering audit roadmap
overview: Phase 1 is the verified audit baseline. Phase 2 implements Waves A–F incrementally; Wave A applies explicit stock policy (POS deduct vs online reserve→deduct). Phase 3 validates each wave with listed deliverables. Execution starts only after explicit approval; Wave A begins with a written flow map, then code.
todos:
  - id: phase1-verify
    content: "Phase 1 complete — audit baseline in this doc; re-verify grep before Wave A coding"
    status: completed
  - id: wave-a-precoding-map
    content: "Wave A pre-coding — document where check/deduct/cancel/refund/payment run; identify double-deduct risks"
    status: completed
  - id: wave-a-implement
    content: "Wave A — prepared stock reserve/deduct/release per policy; wire StockReservationService; idempotency; tests"
    status: completed
  - id: wave-b-online-gate
    content: "Wave B — global online ordering switch + schedule + override; online routes only"
    status: pending
  - id: wave-c-availability-engine
    content: "Wave C — centralized availability pipeline; optional non-breaking API reason fields"
    status: pending
  - id: wave-d-customer-unify
    content: "Wave D — optional POS customer linkage; unified history"
    status: pending
  - id: wave-e-delivery-depth
    content: "Wave E — delivery hours + rider/capacity + zones in pipeline"
    status: pending
  - id: wave-f-order-status
    content: "Wave F — single safe status transition path + compatibility"
    status: pending
isProject: false
---

# Cafe ordering system: audit baseline, roadmap, and waves

This document is the **single source of truth** for Phase 1 (audit), Phase 2 (implementation), and Phase 3 (validation). **No code changes** until you explicitly approve execution; **Wave A** must begin with the **pre-coding flow map** below, then implementation.

---

## Phase 1 — Audit baseline (verified)

### Re-verification note (latest check)

- [`StockManagementService::deductStock`](backend/app/Services/StockManagementService.php) — **no callers** (deprecated; live path is `deductPreparedStock`).
- [`StockReservationService::reserveStock`](backend/app/Services/StockReservationService.php) — **no callers** (deprecated; live path is `reserveForOrder`).

**Wave A close-out (2026-07-17):** Prepared stock policy is live. See [`docs/WAVE_A_PREPARED_STOCK_MAP.md`](../../docs/WAVE_A_PREPARED_STOCK_MAP.md). Phase 1 “check only / no deduction” notes below are **historical**.

### 1. Architecture summary

- Single Laravel app [`backend/`](backend/), Eloquent in [`backend/app/Models/`](backend/app/Models/).
- Domain folders: [`backend/app/Domains/Orders/`](backend/app/Domains/Orders/), [`Payments/`](backend/app/Domains/Payments/), [`Inventory/`](backend/app/Domains/Inventory/), [`Kitchen/`](backend/app/Domains/Kitchen/).
- Routes [`backend/routes/api.php`](backend/routes/api.php); React apps under [`apps/`](apps/).

### 2. Ordering flow summary

- **POS**: `OrderController@store` → `OrderCreationService` → typically `status = pending`.
- **Online takeaway**: `POST /api/customer/orders` → `storeCustomer` → `type` ∈ `online_pickup` per [`StoreCustomerOrderRequest`](backend/app/Http/Requests/StoreCustomerOrderRequest.php).
- **Delivery**: `POST /api/orders/delivery` → `DeliveryOrderController`.
- **Payment**: `payment_pending` → payment listeners → `pending` / `paid`; stale cancel [`CancelStaleOrders`](backend/app/Console/Commands/CancelStaleOrders.php).

### 3. Stock / inventory summary

| Layer | Mechanism | When it runs |
|--------|-----------|----------------|
| **Menu prepared stock** | `items.stock_quantity`, `availability_type` | `checkStock` + lock in [`OrderCreationService`](backend/app/Services/OrderCreationService.php) only — **no deduction** |
| **Recipe ingredients** | [`InventoryDeductionService`](backend/app/Services/InventoryDeductionService.php) | **`OrderPaid`**, idempotent `StockMovement` |

### 4. Customer / account summary

- [`orders.customer_id`](backend/database/migrations/2026_01_27_193009_create_orders_table.php) + [`Customer`](backend/app/Models/Customer.php); online sets customer; dine-in often **null** — unified history requires optional POS link (Wave D).

### 5. Availability summary

- [`KitchenMenuResolver`](backend/app/Domains/Kitchen/Services/KitchenMenuResolver.php), `item_channel_availability`, `kitchen_menu_state`, site `delivery_accepting_orders`.
- No single **global online ordering off + schedule** gate found in audit (Wave B).
- Public item payloads do not expose rich **unavailable reasons** (Wave C).

### 6–9. Problems, races, risks, gaps

(See previous detailed sections — unchanged in substance: no menu stock deduction, unused reservations, fragmented statuses, split availability logic, stale cancel without stock release once reservations exist.)

### 10. Recommended domain direction

- Central **availability decision** pipeline (Wave C).
- Explicit **stock policy** for prepared items — **now specified in Wave A below**.

### 11. Waves B–F (summary)

- **B**: Global online ordering master switch + schedule + override; **online endpoints only**; never block POS dine-in.
- **C**: One availability engine; optional `available_now`, `unavailable_reason`, `available_from` (non-breaking).
- **D**: Optional POS customer attachment; unified history when FK present.
- **E**: Delivery hours, rider, capacity, zones in pipeline.
- **F**: One safe order status transition path; preserve external compatibility.

---

## Wave A — Stock truth / reservation / concurrency (FIRST coding wave)

### Policy (authoritative unless codebase forces a safer equivalent)

**A1 — Prepared / ready items (`track_stock` + `stock_based` or equivalent)**

- **POS dine-in / staff orders**: Deduct **when the order is created and accepted in POS** (order creation success in `OrderCreationService` for staff flows) — i.e. **immediate final deduction** for prepared stock when the business confirms the sale at order creation. *(Refine during pre-coding map if POS sometimes holds orders before payment.)*
- **Online orders** (takeaway + delivery): **Reserve** stock when the order enters **`payment_pending`** (or equivalent checkout-pending state) so the unit is held during payment.
- **Payment success**: Convert reservation → **final deduction** (idempotent: same keys as inventory pattern).
- **Payment fail / expiry / cancel before confirmation**: **Release** reservation; [`CancelStaleOrders`](backend/app/Console/Commands/CancelStaleOrders.php) must release reservations for cancelled `payment_pending` orders.
- **Concurrency**: transactions + `lockForUpdate` on `items`; tests for **two buyers, last unit**.

**A2 — Made-to-order**

- Do **not** consume prepared `items.stock_quantity` unless the item explicitly uses prepared stock.
- Keep [`InventoryDeductionService`](backend/app/Services/InventoryDeductionService.php) on `OrderPaid`; **audit** timing vs Wave A menu stock (no double-charge of the same physical unit).

**A3 — Shared prepared stock**

- Single source: `items.stock_quantity` for prepared items across POS dine-in, online pickup, online delivery.

**A4 — Reservations**

- Wire [`StockReservationService`](backend/app/Services/StockReservationService.php): expiry, release expired, idempotent payment webhooks, safe cancel/refund **without double-adding** stock.

**A5 — Single stock transition path**

- Controllers stay thin; stock moves only through dedicated service(s) inside transactions.

**A6 — Before coding Wave A — mandatory map (deliverable document in repo or PR description)**

Trace and document **exactly**:

1. Where **`items.stock_quantity`** is **checked** today ([`OrderCreationService`](backend/app/Services/OrderCreationService.php)).
2. Where **payment success** is applied ([`PaymentService`](backend/app/Domains/Payments/Services/PaymentService.php), listeners, webhooks).
3. Where **cancellations** run ([`CancelStaleOrders`](backend/app/Console/Commands/CancelStaleOrders.php), admin cancel, customer cancel if any).
4. Where **refunds** run (refund controllers/services).
5. **Double-deduct** risk points (duplicate `OrderPaid`, retry webhooks).
6. **Never-deduct** risk points (current state).

Only after this map is written: implement A1–A4.

### Wave A completion deliverables (Phase 3 for Wave A only)

1. **Audit notes** for end-to-end stock flow (prepared vs recipe).
2. **Exact files changed** (list).
3. **Migrations** (if any — e.g. link reservation to `order_id` if not present).
4. **Reservation flow** summary (create → pay → finalize / release).
5. **Deduction / release** summary (POS vs online).
6. **Test coverage** summary (files + scenarios).
7. **Risks left** before Wave B.

---

## Phase 2 — Implementation order

1. **Wave A** (with pre-coding map + deliverables above).
2. **Wave B** → **C** → **D** → **E** → **F** as previously described; no skip unless risk explicitly accepted.

---

## Phase 3 — Validation (after each wave)

For **every** wave (not only A):

1. Files changed  
2. Migrations added/changed  
3. New services / actions / classes  
4. Routes preserved or adjusted (prefer preserve)  
5. Admin UI changes (minimal)  
6. Customer UI changes (minimal)  
7. Test scenarios covered  
8. Unresolved risks / TODOs  
9. Deployment considerations (migrate, `queue:restart`, schedulers)

Full-project test themes (accumulate across waves): availability engine, stock deduction/reservation, race checkout, online on/off, schedules, service modes, unified customer history, status transitions, delivery gating, POS + online shared stock.

---

## Non-negotiable rules (restated)

- Not a rewrite; **preserve** routes, payloads, working POS/admin/customer behavior unless fixing a verified bug.
- Backend first; **thin controllers**; **transactions** for stock/order integrity.
- **No placeholders** in production paths.
- **Models** stay in `App\Models` unless migration strategy is explicit.

---

## Execution gate

Implementation **starts** only when you say explicitly to **execute** or **implement Wave A** (or the full plan). First concrete step after approval: **Wave A pre-coding map**, then code + tests, then Wave A Phase 3 deliverables.

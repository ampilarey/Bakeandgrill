# Wave D — POS customer linkage & unified history (completion notes)

**Status:** Implemented (close-out 2026-07-17)  
**Tests:** `PosCustomerLinkageTest`, `PosCustomerLookupTest`, `OrderUpdateCustomerTest`, `Customer360EndpointsTest`

---

## Policy

| Channel | `customer_id` |
|---|---|
| Online pickup / customer delivery | Required (authenticated customer) |
| POS dine-in / takeaway / staff delivery | **Optional** — attach via picker or mid-ticket PATCH |
| History (portal + admin 360) | All order types where `customer_id` is set — **no channel filter** |

Contract: unified history = FK present. Unlinked POS tickets stay anonymous.

---

## Flows

1. **Create with customer** — POS cart `attachedCustomer` → `customer_id` on `POST /api/orders`; `last_order_at` updated.
2. **Late attach / detach** — `PATCH /api/orders/{id}/customer` (blocked on completed/cancelled/refunded); attach also refreshes `last_order_at`.
3. **Search / quick-create** — `GET /api/customers/search`, `POST /api/customers/quick`; POS `CustomerPicker`.
4. **Admin** — Customers detail + Customer 360 timeline include POS + online by FK.
5. **Portal** — `GET /api/customer/orders` returns all linked types.

---

## Key files

| Layer | Path |
|---|---|
| Create | `OrderCreationService` |
| PATCH | `OrderCustomerController` |
| POS UI | `CustomerPicker`, `useCart`, `useOrderCreation`, `usePosApp` |
| Admin | `AdminCustomerController`, `Customer360Drawer`, `CustomersPage` |
| Portal | `CustomerController::orders`, `OrderHistoryPage` |

---

## Risks / follow-ups

- Portal UI icons may not distinguish `dine_in` vs `online_pickup` (API `type` is correct).
- Offline sync carries `customer_id` when present on queued tickets.

**Next wave:** E — delivery hours, rider/capacity, zones in pipeline.

# Phase 3 — Cafe ordering + Restock smoke (TEST)

**Env:** `https://test.bakeandgrill.mv`  
**Deploy tip:** Wave F `549cbecc` (or later). No migrate for Wave F; Restock may need earlier migrations already applied.  
**Pull if ff-only fails:** `git fetch origin main && git merge --ff-only origin/main` (then artisan caches + `queue:restart`).

Confirm queue worker is running before online stock / SMS / listener checks:

```bash
ps aux | grep "queue:work redis" | grep -v grep
```

Mark each row **Pass / Fail / Skip** on TEST. Failures: note order #, screenshot, `storage/logs/laravel.log` snippet.

---

## Preflight

| # | Check | Pass? |
|---|--------|-------|
| P1 | TEST pull at tip with Wave F + Restock commits | |
| P2 | `php artisan migrate --force` already clean (no pending) | |
| P3 | Redis queue worker for **test** install is alive | |
| P4 | Admin login (owner/manager) works | |

---

## Wave A — Prepared stock

| # | Check | Pass? |
|---|--------|-------|
| A1 | Stock-based item: POS create reduces on-hand immediately | |
| A2 | Same item: online pickup create holds availability (reservation) without permanent deduct until pay | |
| A3 | Pay online order → on-hand drops; reservation gone (worker must run) | |
| A4 | Abandon / expire `payment_pending` → reservation released; item orderable again | |
| A5 | Cancel unpaid online → stock available again | |
| A6 | Refund paid online line → prepared stock restored | |
| A7 | POS cancel before complete → prepared stock restored | |

Docs: [`WAVE_A_PREPARED_STOCK_MAP.md`](./WAVE_A_PREPARED_STOCK_MAP.md)

---

## Wave B — Online ordering gate

| # | Check | Pass? |
|---|--------|-------|
| B1 | Admin Ordering Control: master **off** → customer menu/checkout blocked | |
| B2 | Master off → **POS still takes orders** | |
| B3 | Master on + outside schedule (no override) → online blocked with clear reason | |
| B4 | Override open → online works despite schedule | |
| B5 | Customer delivery also respects online master (separate from delivery accepting) | |

Docs: [`WAVE_B_ONLINE_ORDERING_GATE.md`](./WAVE_B_ONLINE_ORDERING_GATE.md)

---

## Wave C — Availability

| # | Check | Pass? |
|---|--------|-------|
| C1 | Public/menu item shows unavailable when kitchen/channel off | |
| C2 | Response includes reason / `available_from` when applicable (no client break) | |
| C3 | Turning item available again restores orderability | |

Docs: [`WAVE_C_AVAILABILITY.md`](./WAVE_C_AVAILABILITY.md)

---

## Wave D — Customer linkage

| # | Check | Pass? |
|---|--------|-------|
| D1 | POS attach customer to order succeeds | |
| D2 | Customer history shows POS + online orders when linked | |
| D3 | `last_order_at` updates on attach / new order | |

Docs: [`WAVE_D_CUSTOMER_LINKAGE.md`](./WAVE_D_CUSTOMER_LINKAGE.md)

---

## Wave E — Delivery depth

| # | Check | Pass? |
|---|--------|-------|
| E1 | Delivery accepting off → customer delivery blocked; pickup may still work if online gate on | |
| E2 | Outside delivery hours → blocked with schedule reason | |
| E3 | Zone ineligible address → blocked | |
| E4 | Capacity: set `delivery_max_active_orders` low → accept blocked at capacity; menu still loads | |
| E5 | Admin Delivery Settings: capacity field + schedule hydrate persist after reload | |
| E6 | Checkout status aliases (`accepting`, `zone_eligible`, `reason`) usable by order app | |

Docs: [`WAVE_E_DELIVERY_DEPTH.md`](./WAVE_E_DELIVERY_DEPTH.md)

---

## Wave F — Order status path

| # | Check | Pass? |
|---|--------|-------|
| F1 | KDS/POS: legal forward transitions succeed | |
| F2 | Illegal jump (e.g. completed → pending) returns 422 / blocked | |
| F3 | Delivery: `ready` → assign driver → `out_for_delivery` → driver statuses → `delivered` | |
| F4 | Pay-link / hold path can move to `payment_pending` when allowed | |
| F5 | Stale cancel of `payment_pending` still works (and releases stock — A4) | |

Docs: [`WAVE_F_ORDER_STATUS.md`](./WAVE_F_ORDER_STATUS.md)

---

## Restock polish (Forecasts → Restock)

| # | Check | Pass? |
|---|--------|-------|
| R1 | Restock Plan loads; due-soon / alerts filters work | |
| R2 | Change lookback / lead / cover → persists (localStorage) after reload | |
| R3 | Select-all for current filter selects only visible rows | |
| R4 | Exclude SKU → drops from due-soon; open reorder alert auto-dismisses | |
| R5 | Snooze SKU → hidden from due-soon until snooze ends | |
| R6 | Dashboard restock tiles match plan totals (roughly) | |

---

## Sign-off

| | |
|---|---|
| Tester | |
| Date | |
| Tip SHA | |
| Blockers | |
| Ready for prod? | No / Yes (only after explicit prod deploy request) |

**Cafe roadmap Phase 2 (Waves A–F):** code complete. This checklist is Phase 3 validation on TEST.

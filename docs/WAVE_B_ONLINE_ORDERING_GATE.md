# Wave B — Online ordering gate (completion notes)

**Status:** Implemented (close-out 2026-07-17)  
**Tests:** `backend/tests/Feature/OnlineOrderingGateTest.php`

---

## Policy

| Channel | Gated? |
|---|---|
| Customer online pickup (`POST /api/customer/orders`) | Yes — `OnlineOrderingGateService::assertOpen()` |
| Customer delivery (`POST /api/orders/delivery` as Customer) | Yes — online gate, then `DeliveryGateService` |
| Staff POS (`POST /api/orders`) | **Never** |
| Staff delivery / phone orders | **Never** (bypass both gates) |

---

## Evaluation order

1. **Force-open override** (`online_ordering_override_until` in the future) → open  
2. **Master switch** (`online_ordering_enabled`) → if off, closed  
3. **Schedule** (`online_ordering_schedule` JSON) → if empty, open when master on; else window check  

Closed copy: `online_ordering_closed_message`.

---

## Key files

| Layer | Path |
|---|---|
| Service | `app/Services/OnlineOrderingGateService.php` |
| API | `app/Http/Controllers/Api/OnlineOrderingController.php` |
| Public status | `GET /api/ordering/status` |
| Admin UI | `apps/admin-dashboard/src/pages/OnlineOrderingPage.tsx` (`/online-ordering`) |
| Settings seed | `database/migrations/2026_04_18_000002_seed_online_ordering_gate_settings.php` |

**Not Wave B:** `OpeningHoursService` (café hours), `OrderingEligibilityController` (kitchen/menu groups), `DeliveryGateService` / `DeliverySettingsPage` (Wave E-ish second layer).

---

## Phase 3 checklist

1. **Files:** Gate service, OnlineOrderingController, OrderCreationController (customer), DeliveryOrderController (customer branch), OnlineOrderingPage, settings API helpers  
2. **Migrations:** settings seed only (already shipped)  
3. **New services:** `OnlineOrderingGateService`  
4. **Routes preserved:** yes  
5. **Admin UI:** Ordering Control page  
6. **Customer UI:** badge / menu / checkout read `/ordering/status`  
7. **Tests:** master off blocks pickup + customer delivery; does not block POS or staff delivery; schedule; override; status; admin toggle  
8. **Risks before Wave C:** Delivery has a second gate (accepting + schedule + zone) — do not confuse with online master switch  
9. **Deploy:** no new migrate required for this close-out; `queue:restart` optional  

**Next wave:** C — centralized availability pipeline (optional reason fields).

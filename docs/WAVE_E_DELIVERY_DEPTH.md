# Wave E — Delivery hours, zones, capacity (completion notes)

**Status:** Implemented (close-out 2026-07-17)  
**Tests:** `backend/tests/Feature/DeliveryGateTest.php`, `DeliverySettingsTest.php`

---

## Gate layers (`DeliveryGateService`)

| Order | Setting | Behavior |
|---|---|---|
| 0 | `delivery_override_until` | Force-open (skips remaining layers) |
| 1 | `delivery_accepting_orders` | Master flag |
| 2 | `delivery_schedule` | Per-day hours (optional) |
| 3 | `delivery_zones` | Island whitelist when area provided |
| 4 | `delivery_max_active_orders` | Cap concurrent open delivery tickets (`0` = off) |

Online master gate (Wave B) runs first on customer delivery create. Staff POS delivery bypasses both gates.

---

## Public status aliases

`GET /api/ordering/delivery-status?area=`

| Field | Notes |
|---|---|
| `delivery_open` | Canonical |
| `accepting` | Alias of open result |
| `zone_eligible` | `null` without area; else whitelist check |
| `reason` | `accepting_off` \| `schedule` \| `zone` \| `capacity` |
| `delivery_schedule` | Raw JSON for admin hydrate |
| `max_active_orders` / `active_delivery_orders` / `capacity_enforced` | Capacity |

---

## Admin

- `/delivery-settings` — master switch, override, **capacity**, schedule (hydrated from API), zones/fees
- `POST /api/admin/ordering/delivery-capacity` — `{ max_active_orders }`

---

## Not in this wave

- Rider assignment / per-driver load balancing (ops APIs exist; not in accept gate)
- ETA / dispatch engine
- Zone-aware menu filtering (menu uses gate without area — intentional)

**Next wave:** F — single safe order status transition path.

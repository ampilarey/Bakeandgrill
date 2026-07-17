# Wave C — Item availability engine (completion notes)

**Status:** Implemented (close-out 2026-07-17)  
**Tests:** `backend/tests/Feature/ItemAvailabilityServiceTest.php`

---

## Engine

`App\Services\ItemAvailabilityService::check($item, $channel)` evaluates in order:

1. Item flags (`is_active`, `is_available`)
2. Channel / chef / ICA (`KitchenMenuResolver`)
3. Online gate for `online_pickup` / `delivery` (`OnlineOrderingGateService`)
4. Prepared stock (`StockReservationService`)

Returns `AvailabilityResult`: `allowed`, `reasonCode`, `message`, `availableStock`, `availableFrom`.

---

## Public API (non-breaking)

On **public** `GET /api/items` and `GET /api/items/{id}` (not admin staff list):

| Field | Meaning |
|---|---|
| `availability.available` | Same as before |
| `availability.reason_code` | `item_inactive` \| `item_unavailable` \| `channel_unavailable` \| `ordering_closed` \| `out_of_stock` |
| `availability.reason_message` | Human copy |
| `availability.available_stock` | Prepared stock remaining, or null |
| `availability.available_from` | ISO when known (future ICA `valid_from`, or gate next open) |
| `available_now` | Alias of `availability.available` |
| `unavailable_reason` | Alias of `reason_code` when closed; null when open |
| `available_from` | Top-level alias of nested `available_from` |

Existing clients that only read `is_available` keep working.

---

## Not in this wave

- Order create still asserts gates/stock separately (correct for write path; engine is the read SSOT).
- POS menu batching stays in `PosMenuBuilder` (skips online gate on purpose).
- Delivery zone/capacity depth is Wave E.
- Online UI reason badges optional follow-up.

---

## Key files

- `app/Services/ItemAvailabilityService.php`
- `app/Http/Controllers/Api/ItemController.php`
- `packages/shared/src/types/product.ts`

**Next wave:** D — optional POS customer attachment / unified history.

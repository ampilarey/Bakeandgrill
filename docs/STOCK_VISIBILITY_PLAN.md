# Stock visibility — audit and plan

How stock is calculated today, where the customer-facing gap is, and what to add.

## How it works now

Stock applies only when **both** `track_stock` is on **and** `availability_type`
is `stock_based` (`ItemAvailabilityService.php:87`). Any other combination skips
the stock check entirely — including `track_stock` on with a different
availability type, which is a quiet trap for whoever configures an item.

The available figure is not the raw column. `StockReservationService::getAvailableStock()`:

```
available = stock_quantity − unexpired reservations
```

Reservations are carts in progress; expired ones are released first, so two
customers cannot both take the last one. Untracked items return `9999` — a
sentinel for "unlimited". Orders decrement through `StockManagementService`.

`ItemAvailabilityService::check()` runs in order: inactive → unavailable →
snoozed → channel/menu-group → ordering-hours gate → **stock last**. The payload
carries both the raw `is_available` column and the computed
`availability` / `available_now` / `unavailable_reason` / `available_stock`.

## The gap

`ProductCard.tsx:85` decides everything from the raw flag:

```ts
const isUnavailable = item.is_available === false;
```

Neither `ProductCard` nor `ItemSheet` reads `available_now`, `availability` or
`unavailable_reason` — confirmed by grep. `ItemSheet`'s `canAdd` (line 83) only
checks whether a variant is chosen.

So a sold-out item renders as fully orderable: no badge, still clickable, Add to
cart enabled.

**Scope this accurately.** `OrderCreationService.php:568-577` *does* re-check
stock under a row lock and aborts with 422. Nobody can actually buy stock that
does not exist. The harm is the **late failure**: the customer browses, picks,
configures, adds to cart, reaches checkout, and is told
*"Insufficient stock for Chicken Wrap. Available: 0, requested: 1"* — a developer
error string, after they have invested effort. That is a UX defect, not a data
integrity one.

Corroborating evidence it was always meant to exist: `LanguageContext.tsx:106`
defines `"menu.out_of_stock": "Out of stock"` and **nothing uses it**. The string
was added for a badge that never got wired up.

## Fix — read the computed field

Switch `ProductCard` and `ItemSheet` to `available_now`, falling back to
`is_available` when absent so nothing breaks if an endpoint has not been
annotated. Include `available_now === false` in `canAdd`.

Then use `unavailable_reason` for the message rather than one generic label. The
service already distinguishes them, and the distinctions matter to a customer:

| `unavailable_reason` | Customer sees |
|---|---|
| `out_of_stock` | Sold out |
| `snoozed` | Unavailable today |
| `ordering_closed` | Opens at *{time}* — from `available_from` |
| `channel_unavailable` | Not available for pickup / delivery |
| `item_unavailable` / `item_inactive` | Unavailable |

"Sold out" and "we're closed" are completely different messages. Today both would
render identically, which teaches customers to ignore the badge.

## Recommended additions

### 1. Low-stock indicator — "Only 3 left"

`available_stock` is already in the payload. `low_stock_threshold` (default 5) is
**admin-only** (`ItemController.php:191` gates it behind `$includeAdminExtras`),
so the client cannot currently decide what "low" means.

Expose a boolean rather than the threshold: send `is_low_stock` computed
server-side. That keeps the business rule in one place and avoids publishing
inventory policy to anyone reading the API.

Show "Only N left" when `is_low_stock` is true and `available_stock` is small.

**Recommendation: cap the displayed number.** Show the count only at 3 or fewer,
and a plain "Few left" between 4 and the threshold. A precise "only 5 left" reads
as inventory software; "few left" reads as a restaurant. It also avoids the
awkward case where the number visibly ticks down while someone is deciding.

This only appears on `stock_based` items, which in a restaurant is a minority —
usually prepared items like cakes. That is appropriate: scarcity messaging on
everything is noise, on a genuinely limited item it is useful information.

### 2. Sort sold-out items to the end of their category

An unavailable item occupying a prime position wastes the most valuable space on
the menu. Keep it visible — customers look for it and its absence causes
questions — but move it below the available items in the same category.

### 3. POS has no stock visibility at all

Grep found no stock references anywhere in `apps/pos-web/src`. Staff taking a
counter order cannot see that only two are left, so they promise something the
kitchen cannot deliver and find out when the order fails validation.

Show remaining count on the POS item tile for tracked items. This is the audience
that most needs the number, and the one place where a precise figure is genuinely
better than "few left".

### 4. The TV board still advertises sold-out dishes

`autoSlides.ts` filters on `show_on_signage` only — no availability check. So a
dish that sold out an hour ago keeps getting a full-screen showcase slide,
complete with photo and price.

That is the most visible version of this bug: the board is actively advertising
something the kitchen cannot make. Filter sold-out items out of showcase slides
and strike them through, or drop them, in category lists.

### 5. Admin alerting already exists

`OpsAlertsService.php:74` already flags `stock_quantity <= low_stock_threshold`.
No work needed — worth knowing it is there before anyone builds a second one.

## Testing

- An item with zero available stock renders as unavailable on the card and in the
  sheet, with Add disabled.
- Each `unavailable_reason` renders its own message; `ordering_closed` shows the
  time from `available_from`.
- An untracked item (`available_stock: 9999`) never shows a stock badge.
- `is_low_stock` is true at or below threshold, false above.
- "Only N left" shows at ≤3; "Few left" between 4 and threshold.
- Sold-out items sort after available ones within a category.
- A sold-out item does not produce a signage showcase slide.
- `available_now` absent falls back to `is_available` — no regression on
  un-annotated endpoints.

## Out of scope

- Changing how reservations expire.
- Variant-level stock display (the backend supports it; the UI question is
  separate).
- Automatic reordering or supplier integration.

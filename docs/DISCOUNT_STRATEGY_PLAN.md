# Discount Strategy Enhancements — Implementation Plan

**Status:** Ready to build
**Scope:** Extend the existing promotion engine (NOT the per-customer, per-item promotions) with four
strategy levers: **tiered spend-and-save + quantity breaks**, **BOGO / Buy-X-Get-Y**, **guardrails
(budget cap + margin floor)**, and **free-delivery + first-order offers**.

Section 1 is the verified audit. Section 2 is the build. Section 3 tests; Section 4 deploy.

---

## 1. Verified audit — current engine

- **`Promotion`** (`app/Models/Promotion.php`, migration): `name`, `code`, `type`
  (`percentage`|`fixed`|`free_item`), `discount_value`, `is_active`, `starts_at`/`expires_at`,
  `days_of_week` + `starts_time`/`ends_time` (happy hour), `max_uses`, `max_uses_per_customer`,
  `redemptions_count`, `stackable`, `min_order_laar` (single spend threshold), `scope`
  (`order`|`item`|`category`), **`metadata` (JSON)**, `auto_apply`, `restricted_customer_id`
  (per-customer — OUT OF SCOPE). `promotion_targets` = include/exclude by item/category.
- **`PromotionEvaluator`**: `applyAutomatic()` + coded apply; `calculateDiscount()` switches on type
  (`percentage`/`fixed`/`free_item`); global stacking policy `discount_stacking_policy`
  (`best_wins`|`stack`); `min_order_laar` gate.
- **`DailySpecial`** (separate): per-item sale price / %, day-of-week, limited stock.
- **`EffectiveDiscount`**: allocates promo+loyalty+manual+gift_card+referral, capped at subtotal.
- **Items carry `cost`** (`items.cost`, decimal) → margin floor is feasible.
- **Free delivery** exists only as `config/delivery.php` `free_threshold` (200), not a promo.

**Gaps addressed here:** no tiered/quantity discounts; thin BOGO; no free-delivery/first-order promo;
no per-campaign budget cap; no margin floor.

---

## 2. Build

### 2.0 Schema (migration `extend_promotions_strategy`)
Add to `promotions` (all nullable / safe defaults — non-breaking):
| Column | Type | Purpose |
|---|---|---|
| `budget_laar` | unsignedBigInteger null | Max **total discount spend** for this campaign; stop applying once reached. |
| `spent_laar` | unsignedBigInteger default 0 | Running total of discount granted (for the budget cap + reporting). |
| `first_order_only` | boolean default false | Apply only to a customer's **first** order. |
| `waive_delivery` | boolean default false | Free-delivery promo (waives the delivery fee). |

Extend the `type` set with: `tiered`, `quantity_break`, `buy_x_get_y`, `free_delivery`. Store their
config in the existing **`metadata` JSON** (no per-type columns needed):
- `tiered`: `{ "tiers": [ {"min_laar": 30000, "kind":"fixed|percentage", "value": 3000}, … ] }`
  (highest satisfied tier wins).
- `quantity_break`: `{ "min_qty": 3, "kind":"percentage|fixed", "value": 10 }` — applied to the
  targeted items/category lines meeting the quantity.
- `buy_x_get_y`: `{ "buy_qty": 2, "get_qty": 1, "get_discount_pct": 100, "cheapest": true }`
  (100% = free; `cheapest` picks the lowest-priced qualifying unit as the discounted one).
- `free_delivery`: uses `waive_delivery=true` + optional `min_order_laar` + happy-hour window.

Global settings (SiteSetting): `discount_margin_floor_enabled` (bool), `discount_margin_floor_pct`
(int, e.g. 0 = never below cost; 10 = keep ≥10% margin).

### 2.1 Evaluator — new discount kinds (`PromotionEvaluator::calculateDiscount`)
- **`tiered`**: pick the highest tier whose `min_laar` ≤ applicable subtotal; compute fixed/percentage
  off. (Order scope typically.)
- **`quantity_break`**: from the targeted lines, if total qualifying qty ≥ `min_qty`, apply the % / fixed
  to those lines' amount.
- **`buy_x_get_y`**: group qualifying units; for every `buy_qty+get_qty` set, discount `get_qty` units
  (cheapest first when `cheapest`) by `get_discount_pct`. Never exceeds the qualifying lines' total.
- **`free_delivery`**: returns 0 merchandise discount but flags the order to **waive the delivery fee**
  (see 2.3). Respects `min_order_laar` + window.
- Keep existing `percentage`/`fixed`/`free_item` unchanged.

### 2.2 Guardrails
- **Budget cap:** before granting a promo's discount, check `spent_laar + thisDiscount ≤ budget_laar`
  (when set). If it would exceed, either skip the promo (auto) or reject the code with "This offer has
  reached its limit." On successful application, increment `spent_laar` atomically (in the same
  redemption transaction; decrement on order void/refund alongside `redemptions_count`).
- **Margin floor:** when `discount_margin_floor_enabled`, clamp any **item/category** discount so the
  discounted unit price never drops below `cost * (1 + floor_pct/100)`. Compute per line using
  `items.cost`; reduce the granted discount to respect the floor. Applies across promo + special
  stacking (evaluate against the *already-discounted* price so specials + promos together can't breach
  the floor). Log when a discount is clamped (for reporting).
- **first_order_only:** apply only if the customer has **no prior completed order** (guest → treat as
  first order; require a linked customer for the check). Skip/reject otherwise.

### 2.3 Free delivery wiring
- When an applied promo has `waive_delivery` (type `free_delivery`, or any promo flagged), set the
  order's delivery fee to 0 in the totals pipeline (`OrderTotalsCalculator` / delivery fee step) and
  surface a "Free delivery" line. Only for `delivery` order type; ignored otherwise.

### 2.4 Stacking clarity (small)
- Document + enforce: a line already discounted by a **Daily Special** is not *also* reduced by an
  item-promo unless policy = `stack` (mirror the existing "no double-discount" note in
  `PromotionEvaluator`). Margin floor is the backstop.

### 2.5 Admin (PromotionController + admin promotions editor)
- Extend create/update validation + payload for the new `type`s, `metadata` shapes, `budget_laar`,
  `first_order_only`, `waive_delivery`.
- Admin promotions form: type picker gains Tiered / Quantity break / BOGO / Free delivery, each showing
  the relevant fields (tier rows editor; buy/get qty; min qty; budget; first-order toggle). Show
  `spent_laar / budget_laar` progress on the list. Add the two margin-floor settings to the discount
  settings area.
- Owner-only for budget & margin-floor settings (reuse existing promotion permissions —
  `promotions.manage` / the discounts settings permission).

### 2.6 Customer/POS surfacing
- Offers feed (`OffersService`) + menu badges include the new auto types (tiered/BOGO/free-delivery)
  with clear labels ("Buy 2 Get 1", "Spend 300 save 30", "Free delivery over 200").
- Cart shows the applied promo line and, for free delivery, the waived fee. Budget-exhausted or
  first-order-only rejections show a clear message.

---

## 3. Testing (PHPUnit)
- `TieredPromotionTest`: correct tier selected by spend; below lowest tier → no discount.
- `QuantityBreakTest`: applies only when qty ≥ min on targeted lines.
- `BuyXGetYTest`: buy-2-get-1-free discounts the cheapest qualifying unit; multiple sets; never exceeds
  line totals.
- `FreeDeliveryPromoTest`: delivery fee waived on delivery orders meeting the window/min; ignored for
  pickup.
- `PromotionBudgetCapTest`: promo stops applying once `spent_laar` would exceed `budget_laar`;
  `spent_laar` increments on apply and decrements on void/refund.
- `MarginFloorTest`: a stacked special + promo cannot push a unit below `cost*(1+floor)`; discount is
  clamped and logged.
- `FirstOrderOnlyTest`: applies to a customer's first order only; rejected on the second.
- Regression: existing `percentage`/`fixed`/`free_item`, stacking policy, and `EffectiveDiscount`
  allocation unchanged.

Backend: `cd backend && php artisan test`. Admin frontend from repo root (`npm ci`) then
`cd apps/admin-dashboard && npm test -- --run && npm run build`.

---

## 4. Deploy / rollback
- Additive columns (nullable/defaults) + JSON metadata + new settings → **non-breaking**; existing
  promotions behave exactly as before. `php artisan migrate --force`; rebuild admin bundle →
  `backend/public/admin`. Margin floor + budgets are **off/unset by default**. Rollback = revert
  release; new columns harmless if left.

> Out of scope (backlog): bundle builder ("any 3 for X"), campaign calendar view, per-category
> stacking rules, and the per-customer/per-item promotions (explicitly excluded).

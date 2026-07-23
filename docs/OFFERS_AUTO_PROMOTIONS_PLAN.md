# Offers & Auto-Promotions — Implementation Plan (specials + promotions, unified & displayed)

**Repository:** `ampilarey/Bakeandgrill`
**Branch:** `claude/offers-auto-promotions-plan`
**Status:** Implemented (Phases 1–4 on this branch).
**Author's note:** Separates **VERIFIED findings** (files read) from **RECOMMENDATIONS**.

## 0. Goal

1. Add **automatic promotions** — a promotion applied to **all customers at a specific rate with
   NO code**, targeting items/categories. Keep **customer-specific** (`restricted_customer_id`) and
   **code-based** promotions exactly as they are (they're useful; enhanced later).
2. **Unify pricing** so item/category-targeted auto-promotions show a discounted price + badge on
   item cards, just like Daily Specials — via one resolver.
3. **Display both daily specials AND promotional items** on the **website and order app**, and add
   a smart **"Offers" surface at the top of the menu** (better than a single static banner).
4. Fold in the extra ideas (stacking policy, time windows, urgency, analytics).

## 1. Verified findings

### Daily Specials (per-item display discounts) — works, is the display engine
| Area | Path | Note |
|---|---|---|
| Model | `backend/app/Models/DailySpecial.php`, `DailySpecialVariant.php` | `item_id, badge_label, special_price, discount_pct, start_date, end_date, days_of_week, max_quantity, sold_count, is_active`; variant overrides |
| Engine | `backend/app/Services/SpecialPricingService.php` | `resolveUnitPrice()→SpecialPriceResult{unitPrice, originalPrice, badgeLabel, toApiBlock()}`; `activeSpecialsByItemId()`, `activeSpecialsForDisplay()`; cached `daily_specials:active_map` |
| Result | `backend/app/Services/SpecialPriceResult.php` | `toApiBlock()` → the `special` block on `/api/items` |
| API | `backend/app/Http/Controllers/Api/ItemController.php` | per item/variant `effective_price`, `original_price`, `badge_label`, `discount_pct`; `/api/specials` (`DailySpecialController::active`) |
| Order app | `apps/online-order-web/src/components/menu/ProductCard.tsx` (sale price + `menu-card-price-was` + `badge badge-sale`), `components/home/SpecialsCarousel.tsx` | shows discounted price + badge |
| Website | `backend/resources/views/home.blade.php` (`@foreach($todaysSpecials …)` ~1008) via `HomeController` → `SpecialPricingService::activeSpecialsForDisplay()` | specials strip + badges |
| Admin | `apps/admin-dashboard/src/pages/SpecialsPage.tsx` (`/specials`) | |

### Promotions (order-level, code-required) — powerful but hidden & code-only
| Area | Path | Note |
|---|---|---|
| Model | `backend/app/Models/Promotion.php` | `name, code, type(percentage|fixed), discount_value, is_active, starts_at, expires_at, max_uses, max_uses_per_customer, stackable, min_order_laar, scope, metadata, restricted_customer_id`; **no `auto_apply`** |
| Targets | `backend/app/Models/PromotionTarget.php` | `target_type, target_id` (item/category; incl. exclusions) |
| Applied record | `backend/app/Models/OrderPromotion.php`, `PromotionRedemption.php` | |
| Engine | `backend/app/Domains/Promotions/Services/PromotionEvaluator.php` | `evaluate(code, order, customerId)`, `evaluateForCart(code, lines, customerId)`; targets + exclusions + percentage/fixed; **requires a code** |
| API/controller | `backend/app/Http/Controllers/Api/PromotionController.php` | `validate`, `applyToOrder` (code required), admin CRUD; POS `pos/promos/preview` |
| Order creation | `backend/app/Domains/Orders/Services/OrderCreationService.php` | manual `discount_amount` path (perm `promotions.discounts`); promotions applied via code |
| Admin | `apps/admin-dashboard/src/pages/PromotionsPage.tsx` (`/promotions`) | |
| Customer-specific | `restricted_customer_id` on Promotion | **KEEP AS-IS** |

### Gaps (map to the asks)
1. **No auto-apply** — every promotion needs a code (`applyToOrder` requires `code`).
2. **Promotions never displayed** — no badges, no banner, invisible on both apps.
3. **Two disconnected engines** — `SpecialPricingService` (display prices) vs `PromotionEvaluator`
   (checkout totals) don't compose, so a targeted promotion never shows a discounted item price.

## 2. Proposed architecture

### 2.1 Automatic promotions (new mode on the existing Promotion)
- Add **`auto_apply`** (bool, default false) to `Promotion`. When true: **no code required**, applies
  to **all customers** automatically (subject to `restricted_customer_id` being null — auto-promos
  are all-customer; customer-restricted stays code/targeted as today), respecting `targets`,
  `starts_at/expires_at`, `min_order_laar`, and stacking rules.
- `code` becomes optional when `auto_apply` (nullable). Coded + `restricted_customer_id` promotions
  are unchanged.
- Optional (reuse specials semantics): `days_of_week` + time window on auto-promos for "happy hour".

### 2.2 Unified pricing resolver (the key change)
- **New** `App\Domains\Promotions\Services\AutoPromotionPricing` — given item/category, returns the
  best item-level auto-promo discount (percentage/fixed) active now.
- **New** `App\Services\EffectivePriceService` — the single "what price does the customer see"
  resolver. Composes **Daily Special** (`SpecialPricingService`) **+ item/category-targeted
  auto-promotions**, applying the **stacking policy** (default **best-price-wins**), and returns an
  `EffectivePriceResult{unitPrice, originalPrice, badgeLabel, source: 'special'|'promo', promoId?,
  specialId?}` with a `toApiBlock()` compatible with today's `special` block (so the frontend needs
  no shape change).
- `ItemController` uses `EffectivePriceService` instead of `SpecialPricingService` directly →
  targeted auto-promo items now show discounted price + badge automatically on **both apps**.
- **Order-total auto-promos** (e.g. "10% off orders over MVR 200") are NOT per-item — they stay a
  cart-level auto-discount (§2.3) surfaced via the Offers banner, not an item price.

### 2.3 Auto-apply at checkout
- `PromotionEvaluator` gains `applyAutomatic(order|cart, customerId): AppliedPromotions[]` — finds all
  active `auto_apply` promotions eligible for the order (targets, min order, windows), computes
  discounts, and records them (`OrderPromotion`). Runs during `OrderCreationService` for every order
  (customer + POS), **before** any code-based promo, honoring the stacking policy.
- Item-level auto-promos are already reflected in line prices (via EffectivePriceService); order-level
  auto-promos reduce the total. No double counting — the resolver marks which lines already carry an
  item-level discount so order-level promos exclude them if policy = best-wins.

### 2.4 Stacking policy (explicit — avoids silent double discounts)
- New setting `discount_stacking_policy` — **default `best_wins`** (customer gets the single largest
  eligible discount per line; order-level auto-promo applies only to non-discounted lines). Alternative
  `stack` (specials + auto-promos combine) is available but off by default. Coded promos honor the
  existing `stackable` flag on top.

### 2.5 Offers surface (better than one banner)
- **New public endpoint** `GET /api/offers` — aggregates **active daily specials + active auto-promos**
  into a unified list `{ id, kind: 'special'|'promo', title, badge, discount, target: {items|category},
  ends_at?, link }`. Cached briefly; both apps + website read it.
- **Order app — "Offers" rail at the top of the menu** (`MenuPage`): a horizontal, tappable rail
  auto-generated from `/api/offers`; each card deep-links to the item/category. Collapses to nothing
  when there are no offers. Optional **"Offers" pill in the menu nav** that scrolls to it. Item cards
  keep inline badges (already there via the unified resolver).
- **Website** — render the same offers list at the top of the menu/home (Blade), fixing promotions'
  invisibility; reuse the specials-strip styling.
- **Optional content line** — an admin-authored promo announcement (Content Studio key
  `offers_headline` / `offers_subtext`, order_app + website) shown above the rail for marketing copy.
  Dynamic offers + editable messaging together.

## 3. Data model
- `promotions`: add `auto_apply` (bool default false, indexed), make `code` nullable (only required
  when not auto_apply — enforced in validation), optional `days_of_week` (json) + `starts_time`/
  `ends_time` for windows. Additive; existing rows `auto_apply=false`, unchanged.
- **New settings** (SiteSetting): `discount_stacking_policy` (default `best_wins`); Content keys
  `offers_headline`, `offers_subtext` (order_app + website).
- No change to `daily_specials`, `promotion_targets`, `order_promotions`.

## 4. Backend files
- `backend/database/migrations/…_add_auto_apply_to_promotions.php` (new)
- `backend/database/migrations/…_seed_offers_settings_and_content.php` (new)
- `backend/app/Models/Promotion.php` (modify — fillable/casts + scopes `active()`, `autoApply()`)
- `backend/app/Domains/Promotions/Services/AutoPromotionPricing.php` (new — item/category auto-promo lookup, cached)
- `backend/app/Services/EffectivePriceService.php` + `EffectivePriceResult.php` (new — compose special + auto-promo, stacking policy, `toApiBlock()`)
- `backend/app/Domains/Promotions/Services/PromotionEvaluator.php` (modify — `applyAutomatic()`)
- `backend/app/Domains/Orders/Services/OrderCreationService.php` (modify — apply auto-promos on create, before coded)
- `backend/app/Http/Controllers/Api/ItemController.php` (modify — use EffectivePriceService)
- `backend/app/Http/Controllers/Api/OffersController.php` (new — `GET /api/offers`)
- `backend/app/Http/Controllers/Api/PromotionController.php` (modify — admin CRUD accepts `auto_apply`, code optional)
- `backend/app/Http/Controllers/HomeController.php` (modify — pass offers to Blade)
- `backend/routes/domains/catalog.php` / `marketing.php` (modify — `/offers`, admin auto_apply)
- Cache busting: hook `AutoPromotionPricing`/offers cache into promotion save + specials bust.

## 5. Frontend — order app
- `apps/online-order-web/src/api/menu.ts` (modify — `fetchOffers()`, `Offer` type)
- `apps/online-order-web/src/components/home/OffersRail.tsx` (new — top-of-menu rail from `/api/offers`)
- `apps/online-order-web/src/pages/MenuPage.tsx` (modify — render OffersRail + optional `offers_headline` from settings; "Offers" nav pill)
- `ProductCard.tsx` — no change (already renders the `special` block; auto-promo now flows through it)
- `SpecialsCarousel.tsx` — either fold into OffersRail or keep as the specials subset

## 6. Frontend — website (Blade)
- `backend/resources/views/home.blade.php` (modify — offers rail from the unified list; show promos too)
- Reuse existing `.special-card`/`.special-badge` styles; add promo cards.

## 7. Admin
- `apps/admin-dashboard/src/pages/PromotionsPage.tsx` (modify):
  - "**Automatic (all customers, no code)**" toggle → hides the code field, shows targeting +
    optional day/time window.
  - Keep the existing **code** and **customer-restricted** promotion forms unchanged.
  - **Offers preview** — show exactly what customers will see (badge + affected items).
  - Stacking-policy selector (or in Settings).
- Optional: cross-link Specials + Promotions under an "Offers & Discounts" section in nav.

## 8. Extra ideas included
- **Stacking policy** (best-wins default) — §2.4.
- **Time-window auto-promos** ("happy hour") — reuse specials day/time semantics.
- **Urgency/countdown** — `ends_at` on offer cards → "Ends in 2h".
- **Offer analytics** — extend the existing promotion report (`adminReport`) to include auto-promo
  uplift/redemptions and specials; a simple "Offers performance" view.
- **Later phase (not now):** BOGO / bundle promo types; enhancing customer-specific promotions
  (scheduled per-customer offers) — explicitly deferred, current `restricted_customer_id` behaviour
  untouched.

## 9. Testing (`backend/tests/Feature/Offers|Promotions/`)
- `AutoPromotionTest` — auto_apply promo applies with no code to all customers; respects targets,
  min order, window, expiry; customer-restricted + coded promos unchanged.
- `EffectivePriceTest` — item with special only / auto-promo only / both → best-wins picks the larger;
  `toApiBlock` shape matches today; order-level auto-promo excluded from already-discounted lines.
- `AutoPromoCheckoutTest` — order creation applies auto-promos before coded; no double discount;
  OrderPromotion recorded; POS + customer parity.
- `OffersEndpointTest` — `/api/offers` aggregates active specials + auto-promos; empty when none;
  cached + busts on change.
- Frontend: OffersRail renders/links, empty state; ProductCard shows auto-promo badge/price; website
  offers render.
- **Regression:** existing specials, promotion (code), customer-restricted, POS promo tests stay green.

## 10. Rollout
Phased, additive, defaults preserve behaviour (`auto_apply=false`, `best_wins`). Phase order:
1. auto_apply model + evaluator `applyAutomatic` + order-creation apply (order-level working, no display).
2. EffectivePriceService + ItemController (item-level auto-promos show as prices/badges both apps).
3. `/api/offers` + OffersRail (order app) + website offers + content headline.
4. Admin toggle/preview + analytics + time windows/urgency.
Deploy: `migrate --force`, rebuild dist, `config:cache`. Rollback per phase; nothing changes until
an admin creates an auto-promo.

## 11. Acceptance criteria
1. Admin can create a promotion that applies **automatically to all customers at a set rate with no
   code**, scoped to items/categories, with date (and optional day/time) window.
2. Targeted auto-promo items show a discounted price + badge on the **order app and website**, like
   daily specials; the price is authoritative at checkout.
3. Order-level auto-promos apply automatically at checkout with no code; no double discount
   (best-wins default); recorded on the order.
4. Both daily specials and promotional items appear in a top-of-menu **Offers** rail on both apps,
   each linking to its items; an admin can add a marketing headline.
5. **Code-based and customer-specific (`restricted_customer_id`) promotions behave exactly as before.**
6. Defaults change nothing until an admin creates an auto-promo; all existing tests stay green.

## 12. Constraints (do not improvise)
- **Do not remove or change** code-based or `restricted_customer_id` promotions — auto-apply is a new,
  additive mode.
- One authoritative price via `EffectivePriceService`; never show a discount the checkout won't honor.
- Explicit stacking policy (**best_wins** default); never silently double-discount.
- Reuse `SpecialPricingService`, `PromotionEvaluator`, `PromotionTarget`, `OrderPromotion` — extend,
  don't fork. Keep the `special` API block shape (frontend compatibility).
- Auto-promos default OFF; `discount_stacking_policy` defaults to best_wins; migrations additive.

## Implementation notes

- **SQLite `code` nullability:** MySQL/Postgres make `promotions.code` nullable; SQLite tests keep NOT NULL, so auto-apply rows use a unique `AUTO-*` sentinel in `Promotion::booted()` (never matched by customer code entry).
- **Admin toggle shipped in Phase 1** (not deferred to Phase 4); Phase 4 adds preview + performance analytics + urgency countdown.
- **Item vs order auto-promos:** After EffectivePriceService, `applyAutomatic(..., itemLevelAlreadyInLinePrices: true)` skips item/category-targeted autos so line prices and `promo_discount_laar` never double-count. Order-level autos (no inclusion targets) still write `OrderPromotion`.
- **Stacking:** `discount_stacking_policy` SiteSetting defaults to `best_wins` (single largest auto-promo; special vs auto-promo picks lower unit price). `stack` is supported but off by default.
- **Targets UI:** Admin auto-apply form accepts item/category target IDs (no item picker yet).
- **Website:** Home prefers unified `$offers` feed; falls back to legacy `$todaysSpecials` strip if offers empty.
- **Content keys:** `offers_headline` / `offers_subtext` registered in `config/content.php` and seeded into `site_settings`.

## Build log

| Phase | Commit | Verify |
|---|---|---|
| 1 auto-apply | `03f1cbfe` | backend promo tests green; admin build green |
| 2 effective pricing | `6609b5b4` | backend suite green; DailySpecial + EffectivePrice green |
| 3 offers feed/rail | `06e2db68` | OffersEndpoint + OffersRail/ProductCard tests; order/admin build green |
| 4 preview/analytics/urgency | `dba91f32` | backend 1558 passed; order 94 tests; admin build green |
| dist sync | `6badf7f3` | `./scripts/build-all.sh admin order` → `backend/public/{admin,order}` |

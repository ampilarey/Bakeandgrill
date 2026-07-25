# Specials / Promotions Display Consistency — Implementation Plan

**Status:** Ready to build
**Goal:** Make specials, promotions, and discounted items look and read the same everywhere — the
main website and the order app (mobile-first) — using one price format, one card style, one offers
carousel, and a consistent savings signal. Presentation-only; no pricing/logic changes.

## 1. Verified audit — how it looks today

**Main website (`resources/views/home.blade.php`):** an **Offers** section (specials + auto-promos),
falling back to **Today's Specials** (`@if $homeOffers … @elseif $todaysSpecials`). Rectangular
horizontal-scroll `.special-card`s: 140px image, badge, title/subtitle, **`MVR X.XX`** sale price +
line-through original, `🍽️` emoji placeholder.

**Order app (`online-order-web`):**
- Home renders **two** carousels: `PromoCarousel` + `SpecialsCarousel` (`pages/HomePage.tsx:206,259`).
- Menu: `OffersRail` strip (circular, ZUS) + `ProductCard` grid (circular, ZUS).
- Detail `ItemSheet`; cart `CartDrawer`.
- Promotions surface with clear labels already — `OffersService` builds "Buy 2 Get 1", "Spend 300
  save 30" (tiered), quantity-break, "Free delivery over 200". ✓

**Price format is split** (shared helper `utils/money.ts → formatCardPrice(n) = "N/-"` exists):
| Surface | Format |
|---|---|
| `ProductCard`, `OffersRail` | `12.50/-` ✅ |
| `SpecialsCarousel`, `ItemSheet`, `CartDrawer` | `MVR 12.50` ❌ |
| Main website (both sections) | `MVR 12.50` ❌ |

**Card style is split:** menu + offers rail are circular ZUS cards; the home `SpecialsCarousel` and the
whole website are the old rectangular cards with the emoji placeholder.

**Redundancy:** the same offers appear on the home PromoCarousel, the home SpecialsCarousel, and the
menu OffersRail — up to three times before the customer reaches the item.

## 2. Build

### 2.1 One price format everywhere (order app)
Route every price/discount display through the shared `formatCardPrice` (`N/-`):
- `components/home/SpecialsCarousel.tsx`, `components/ItemSheet.tsx`, `components/CartDrawer.tsx` —
  replace inline `MVR ${x.toFixed(2)}` with `formatCardPrice(x)` for **sale price and struck original**.
  (Line-item money in cart/checkout totals may keep MVR if that reads better for a receipt-style total,
  but item unit prices and discounts should use `N/-` to match the menu — apply consistently.)
- Confirm `CheckoutPage` already uses the helper; align any stragglers.

### 2.2 Consistent price format on the main website (Blade)
- In `home.blade.php` Offers + Today's Specials sections, render prices as `{{ number_format($price,2) }}/-`
  (drop the `MVR` prefix) for both `price-sale` and `price-was`, matching the app. Make it a small Blade
  partial/helper so both sections + any future use share it.

### 2.3 One card style — circular ZUS (both apps)
- **`SpecialsCarousel.tsx`:** restyle its cards to the circular ZUS pattern used by `OffersRail` (square
  1:1 media wrapper, `border-radius:50%`, object-fit cover, soft brand-tint circle, branded
  logo/monogram placeholder instead of `🍽️`; name / short detail / `N/-` price; single sale/spice
  badge). Reuse `OffersRail`'s card (extract a shared `OfferCard` component so `OffersRail` and
  `SpecialsCarousel` share one card).
- **Main website (`home.blade.php` + its CSS):** update `.special-card` / `.product-img` to a circular
  media treatment (round image, faded surround, brand placeholder) so website specials match the app's
  look. Keep it a horizontal-scroll strip.

### 2.4 Consolidate the home carousels (order app)
- Merge `PromoCarousel` + `SpecialsCarousel` into **one** "Offers & Specials" carousel on `HomePage`
  fed by the unified offers feed (`OffersService`/`fetchActiveSpecials` + promos), so offers aren't
  shown twice on home. (If PromoCarousel serves a distinct purpose — e.g. banner promos vs item
  specials — keep both but de-duplicate items and label them clearly.) The menu `OffersRail` stays as
  the in-menu entry point.

### 2.5 Consistent savings signal (order app)
- Show the **savings** wherever a discounted price appears — a small "X% OFF" or "Save N/-" — on the
  **item detail (`ItemSheet`)** and the **cart line (`CartDrawer`)**, not only on menu/offer cards.
  Compute from `original_price − effective_price`. Reuse the badge style from `ProductCard`.

## 3. Testing
- **Order app (Vitest):** SpecialsCarousel renders `N/-` (not `MVR`) and a circular media wrapper
  (aspect-ratio 1/1); ItemSheet + CartDrawer show `N/-` and a "% OFF / Save" signal when discounted;
  the shared `OfferCard` renders the branded circle placeholder when an offer has no image; home shows
  a single consolidated offers carousel (no duplicate offer ids).
- **Main website:** a Blade render/HTTP test asserting the Offers/Specials prices render as `…/-`
  (no `MVR` prefix) and the special card uses the circular image class.

Run order app from repo root (`npm ci`) then `cd apps/online-order-web && npm test -- --run &&
npm run build`. Backend Blade tests: `cd backend && php artisan test`.

## 4. Deploy / rollback
Presentation-only — no schema, no pricing/API changes. Rebuild + sync `apps/online-order-web/dist →
backend/public/order` (bump order SW `CACHE_VERSION`); `view:clear` for Blade. Rollback = revert.

> Out of scope: the pricing/discount calculation (correct + audited already), and admin editors.

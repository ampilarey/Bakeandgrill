# Phase 7 — Long Tail + Cleanup

## Deleted Files

| File | Reason |
|---|---|
| `apps/online-order-web/src/components/MenuCard.tsx` | Zero external imports; replaced by `components/menu/ProductCard.tsx` (Phase 3) |
| `apps/online-order-web/src/components/HeroCarousel.tsx` | Zero external imports; home hero rebuilt in Phase 4/5 |
| `apps/online-order-web/src/components/ItemModal.tsx` | Zero external imports; replaced by `components/ItemSheet.tsx` (Phase 3) |
| `apps/online-order-web/src/components/OrderStatusBar.tsx` | Zero external imports; replaced by `components/shell/ActiveOrderCapsule.tsx` |

Comments in `ProductCard.tsx`, `ItemSheet.tsx`, and `ActiveOrderCapsule.tsx` updated to remove "extracted from X" and "Replaces X" references.

---

## CSS Removed (`src/index.css`)

**Block removed:** `ORDER APP — MOBILE BOTTOM NAVIGATION` (~140 lines)
- `.order-mobile-nav` and `[data-theme="dark"] .order-mobile-nav`
- All `.order-mob-*` rules (grid, item, more-btn, more-backdrop, more-sheet, icon, order, preorder, active states, dark variants)
- Media query rule `.order-mobile-nav { display: block; }` removed from `@media (max-width: 768px)` block; other footer rules in that block kept

**Block removed:** `MOBILE STICKY CATEGORY BAR` / `MOBILE CATEGORY BOTTOM SHEET` (~75 lines)
- `.cat-trigger-bar`
- `.cat-sheet-trigger` and `:active` variant
- `.cat-sheet-panel` and `@keyframes sheetSlideUp`
- `.cat-sheet-item` and `.cat-sheet-item.active`
- `.cat-sheet-card`, `.cat-sheet-card:active`, `.cat-sheet-card.active`

**Updated comment:** Phase 1 foundation block comment updated from "Do not remove … until Phase 7" to note Phase 7 cleanup done.

**Retained:** All active redesign classes (`app-shell`, `bottom-nav`, `page-header`, `floating-cart-bar`, etc.), footer classes (still referenced in Layout/footer JSX).

---

## Service Worker

`apps/online-order-web/public/sw.js`: cache version bumped `bg-pwa-v5` → `bg-pwa-v6`.

Forces old caches to be cleaned up on next service worker activation.

---

## Long-Tail Pages Wrapped with PageHeader

All six pages now open with the `PageHeader` component (`components/shell/PageHeader`) providing a consistent sticky header with back navigation and an `<h1>` title. Duplicate `<h1>` elements removed from page bodies.

| Page | Route | Title source | Notes |
|---|---|---|---|
| `AboutPage` | `/about` | `text('about_page_title', …)` | Emoji + tagline kept below PageHeader |
| `ContactPage` | `/contact` | `text('contact_page_title', …)` | Subtitle kept below PageHeader |
| `HoursPage` | `/hours` | `text('hours_page_title', …)` | Address blurb kept below PageHeader |
| `PrivacyPage` | `/privacy` | `text('privacy_page_title', …)` | PageHeader in both CMS and default branches; `usePageTitle` replaces manual `document.title` effect |
| `PreOrderPage` | `/pre-order` | `text('preorder_page_title', …)` | Subtitle + notice block kept; `usePageTitle` added |
| `ReservationPage` | `/reservations` | `"Table Reservation"` (static) | Custom dark header div removed; `usePageTitle` added |

---

## Automated checks (agent / CI)

| Check | Status |
|---|---|
| Dead CSS/components grep (`order-mob-`, `cat-sheet-`, `MenuCard`, `ItemModal`, `HeroCarousel`, `OrderStatusBar`) in `apps/online-order-web` src/public | Pass (2026-07-18) |
| `CACHE_VERSION = 'bg-pwa-v8'` in `public/sw.js` | Pass (2026-07-18) |
| `tsc && vite build` + vitest | Pass (with English-only UI, `fd841d3b`+) |
| Menu `.menu-grid` 2 cols @390 / no hscroll @320 (ui-audit sweep) | Pass |
| `apps/online-order-web/src` grep clean for UI `dv` / language switcher | Pass (v2.2) |
| Mode entry cards use `public/images/mode-*.jpg` with gradient fallback | Pass (2026-07-18) |
| Long-tail pages (Hours/Contact/About/Account panels) chrome via `t()` | Pass (2026-07-18) |

## §31 QA + Lighthouse (Manual Owner Checks)

The following are manual checks; no automated Lighthouse scores are recorded here.

- [ ] Navigate to each long-tail page on mobile; verify PageHeader renders correctly with back button
- [ ] Verify back button on each page returns to previous history entry (`navigate(-1)`)
- [ ] Confirm no duplicate `<h1>` on any page (browser DevTools Elements panel)
- [ ] Open DevTools → Application → Service Workers: confirm `bg-pwa-v8` is active and older caches are deleted
- [ ] Lighthouse PWA audit: check Installable + Service Worker pass
- [ ] Lighthouse Performance: no regressions vs Phase 6 baseline
- [ ] Lighthouse Accessibility: no new violations (heading hierarchy, touch targets)
- [ ] Smoke-test each deleted component's replacement still works (ProductCard on MenuPage, ItemSheet on item tap, ActiveOrderCapsule on active order)
- [ ] Confirm no 404s in network tab for removed component files (they were never served directly; this is a build check)
- [ ] Account ▸ Settings: dark mode only (no EN/Dhivehi language buttons)
- [ ] Home mode cards show delivery/pickup photos (not emoji fallback)

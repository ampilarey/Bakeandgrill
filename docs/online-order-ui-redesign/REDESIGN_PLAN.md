# ZUS-Style Redesign of the Bake & Grill Order App

## Context

The customer ordering app (`apps/online-order-web`, React 19 + Vite + TS, served at `/order`) works but looks like a responsive website. The user wants it to feel like the ZUS Coffee mobile app — a native-app-like ordering experience — based on 10 ZUS screenshots and a written spec they provided. This is a **frontend-only redesign**: keep every existing feature, route, API call, pricing rule, OTP flow, and backend contract. Keep Bake & Grill branding (existing amber `#D4813A` palette — user explicitly chose NOT to switch to maroon), logo, Plus Jakarta Sans, dark mode, i18n.

**User decisions locked in:**
- Bottom nav (5 tabs): **Home / Menu / Orders / Rewards / Account**; cart is a floating bar, not a tab
- **Pickup/Delivery toggle moves to top of Menu page**, carries into checkout
- Whole customer app in scope; keep amber branding
- **No feature flag** — direct redesign on branch `claude/zus-coffee-app-redesign-f79hfx` (a flag would mean forking Layout/MenuPage/CheckoutPage ~2,000 duplicated lines; rollback = revert the branch). Phase the work so every commit builds.

## Target design (from ZUS screenshots)

- **Home:** "Hello, {name} :)" greeting + avatar; row of 3 stat chips (loyalty points / active order / today's specials); large rounded promo-banner carousel (existing admin hero slides); two big Delivery/Pickup entry cards; horizontal specials carousel with "See all →"; decorative brand footer ("Thanks for being with us"); bottom nav.
- **Menu (most important):** sticky header with `[Pickup|Delivery]` pill + round search button; address/pickup-location row; left sticky icon category rail (~90px, active = left accent bar + colored label); category banner + accent-bar section headers; 2-column product grid (big rounded image, tagline, bold name, price, NEW badge); dimmed SOLD OUT overlay (better contrast than ZUS); floating cart bar (count · total · View cart) above bottom nav; scroll-spy between rail and sections.
- **Login/OTP:** focused screen — centered logo, "Enter your phone number", `+960` prefix (display-only; keep raw phone submission), OTP boxes, terms links. Keep existing channels (SMS OTP, password, guest) — **no WhatsApp OTP** (not supported by backend).
- **Item detail / cart / checkout / tracking:** same language — full-screen sheets, sticky bottom CTAs ("MVR 95.00 · Add to cart", "Total MVR X · Place order"), checkout as accordion sections with collapsed value + "Change", tracking as restyled existing 4-step timeline.

## Verified codebase facts the plan builds on

- `src/api/menu.ts:13-21` — `getSalesChannel()`/`setSalesChannel()` persist `bakegrill_sales_channel` + dispatch `sales_channel_change`; MenuPage:149 and HomePage:66 already listen and reload.
- `src/hooks/useCheckout.ts:207` — `const [orderType, setOrderType] = useState<OrderType>("pickup")`; effect at ~263-279 calls `setSalesChannel` + refetches items + prunes cart.
- `CartContext` has only `updateQuantity(index, qty)` — **edit-in-place is net-new** (`updateEntry`).
- `ItemModal` always opens with modifiers reset to `[]` (state owned by MenuPage) — no edit mode today.
- CheckoutPage already builds section consts (`sectionOrderType`, `sectionDelivery`, `SectionCard`s...) — accordion conversion can reuse them wholesale. AuthBlock renders inline on checkout when signed out, so login-from-checkout already returns with cart intact — keep it inline.
- MenuPage filters one category at a time (no scroll-spy); mobile uses a category bottom sheet; all items fetched in one `fetchItems()` call (good for sectioned render).
- `Category.image_url?: string | null` exists (`packages/shared/src/types/product.ts`) → rail icons; fallback = colored circle with first grapheme (names are admin-driven/Dhivehi-capable — no emoji map).
- Rewards data available today: `getLoyaltyAccount()`, `getMyReferralCode()`, `fetchActiveSpecials()`, `utils/loyalty.ts`. No "my offers" API — don't invent one. Gift cards exist only as checkout redemption — stays there.
- Existing `src/components/ui/` primitives (Badge, Button, Card, Input, Modal, SectionHeader) — extend, don't restart. Tests: `App.test.tsx`, `checkoutTotals.test.ts` (vitest). Build: `tsc && vite build`.

## Implementation

### 1. Foundation (tokens + order-mode context) — ships green, old UI unaffected

`src/index.css` — add tokens (keep everything existing): `--bottom-nav-height: 64px`, `--float-cart-height: 56px`, `--safe-bottom: env(safe-area-inset-bottom, 0px)`, `--shell-max: 640px`, `--cat-rail-width: 90px`, `--menu-header-height`, `--touch-target: 44px`, `--radius-3xl: 1.75rem`, `--chip-height: 64px`, `--shadow-float`. New classes `.app-shell`, `.bottom-nav`, `.float-cart-bar`, `.cat-rail`, `.stat-chip`, `.sheet`, `.section-accent`. Do **not** delete old classes (`order-mob-*`, `cat-sheet-*`, footer) until final cleanup.

**`src/context/OrderModeContext.tsx` (new):** state initialized from `getSalesChannel()`; `setMode(m)` → `setSalesChannel(m === 'delivery' ? 'delivery' : 'online_pickup')`; listens to `sales_channel_change` for sync. Provider added in `main.tsx` beside CartProvider.

**`useCheckout.ts`:** replace line 207 with `const { mode: orderType, setMode: setOrderType } = useOrderMode();` — hook's return shape unchanged, so CheckoutPage needs zero changes for this. Keep the fetch/prune effect; drop only the now-duplicate `setSalesChannel` call at line 265. `deliveryBlocked` guard forcing pickup now updates shared mode (desired).

**Primitives:** `ui/Sheet.tsx` (portal bottom/full sheet: backdrop, focus trap lifted from ItemModal, scroll lock, safe area, sets hideNav), `ui/StickyCtaBar.tsx` (label · price · onClick, uses `--z-pay-bar`), `ui/Accordion.tsx` (title + collapsed summary + "Change"), `shell/PageHeader.tsx`. `useTheme` hook extracted from Layout's darkMode logic.

### 2. App shell

Rewrite `src/components/Layout.tsx` into an app shell: announcement banner (markup moved verbatim), `<Outlet/>`, `shell/BottomNav.tsx`, `shell/FloatingCartBar.tsx`, `#prayer-strip-root` portal target. Delete global sticky header + footer (links rehomed in step 6). 
- **BottomNav:** 5 tabs → `/`, `/menu`, `/order-history`, `/rewards`, `/account`; `aria-current`; safe-area padded; hidden on `/checkout` and when a full sheet sets `hideNav`.
- **FloatingCartBar:** fixed above nav when `cart.length > 0` (not on checkout): "{n} items · MVR {total} · View cart" → opens CartSheet.
- **OrderStatusBar** becomes an active-order capsule stacked above the cart bar (data logic unchanged).
- Add `/rewards` route (lazy) in `main.tsx` with a minimal page.
- Desktop = centered app column (`--shell-max`), bottom nav at all widths; Menu may widen grid to 3-col ≥900px via CSS only.
- Bump `sw.js` cache version in the same commit as the shell swap.

### 3. Menu (largest phase — extract, then swap; 3–4 commits)

Extract while old layout still renders: `menu/ProductCard.tsx` (same callback signatures as MenuCard), `ItemSheet.tsx` (ItemModal logic moved into a full-screen Sheet; new props `initialQty`/`initialModifiers`/`initialVariantId`/`editIndex` — modifier state ownership moves from MenuPage into the sheet), `CartSheet.tsx` (restyled CartDrawer content + per-line Edit + StickyCtaBar → `/checkout`), `menu/CategoryRail.tsx`, `menu/MenuSectionHeader.tsx`.

**`CartContext.updateEntry(index, { quantity, modifiers, variant })` (new)** with unit tests (preselect, variant switch, merge-with-identical-line).

Then swap the MenuPage body:
- Sticky top: `OrderModeToggle` (reads/writes OrderModeContext; on toggle pass channel explicitly to `fetchItems(...)` and prune cart via existing `pruneCartToAllowedItemIds` with a toast if items removed) + search button (expands; reuses `searchQuery`) + address row (delivery: default saved address or "Set your address"; pickup: business address from settings).
- Sectioned render: all parent categories as sections in one scroll (`content-visibility: auto` + `contain-intrinsic-size` + `loading="lazy"` images for perf). Scroll-spy via one IntersectionObserver (`rootMargin` offset by header height); `isProgrammaticScroll` ref suppresses spy during rail-tap `scrollIntoView` (respect `prefers-reduced-motion`); rail auto-scrolls active item (existing `activePillRef` pattern).
- `?category=` deep link scrolls to section; `?item=` unchanged; keep `?openCart=1` working (opens CartSheet).
- Search/dietary/sale filters active → flat `filteredItems` grid (existing memo verbatim), rail dimmed. Sort select folds into filter chip row; back-to-top FAB removed.

### 4. Home

Keep all data effects. New order: greeting header (`useAuth` name, avatar → `/account`, `OpeningStatusBadge` + compact PrayerBar chip) → `home/StatChipsRow.tsx` (loyalty points / active order / specials count; skeletons; signed-out chip) → `home/PromoCarousel.tsx` (HeroCarousel behavior, new markup) → `home/ModeEntryCards.tsx` (set mode → `/menu`) → horizontal specials/featured carousel + "See all →" → reorder strip (existing `handleReorder`) → corporate block → brand footer ("Thanks for being with us" + logo + WhatsApp/Viber CTAs).

### 5. Checkout + Auth (highest regression risk after Menu — restyle only, logic untouched)

Convert each existing section const/SectionCard into `Accordion` (collapsed summaries: "Pickup · ASAP", first address line, applied promo, "−MVR x.xx" loyalty…); one open at a time; errors force-open. Single column + `StickyCtaBar` ("Total MVR X · {placeLabel}"); desktop summary-beside via CSS only (delete the `isMobile` JS branch). Restyle the local `S` styles incrementally, never in the same commit as structural changes. Keep BrandedHeader (back + "Checkout"), AuthBlock inline. Verify after: gate-closed banner, delivery-zone/island check, pickup slots, promo/loyalty/gift/referral, terms checkbox, zero-balance path.

**AuthBlock restyle:** centered logo, "Enter your phone number", `+960` display prefix, OTP boxes, terms links; guest/password/forgot as secondary links. AccountPage signed-out state becomes the ZUS-style login screen (no new route).

### 6. Orders, Rewards, Account

- **Orders:** restyle `OrderHistoryPage` as the Orders tab (PageHeader, status-pill cards, reorder). `OrderStatusPage` keeps `/orders/:id` + `/track/:token`, its `STEPS` timeline and polling — vertical timeline restyle.
- **Rewards (new `src/pages/RewardsPage.tsx`):** points hero card (`getLoyaltyAccount` + `utils/loyalty.ts` helpers), tier progress (existing `--tier-*` tokens), referral share card (`getMyReferralCode` + Web Share/copy), Today's Specials grid. Signed-out → AuthBlock teaser. No wallet/gift-card/offer inventions.
- **Account:** keep Profile/Addresses/OrderHistory sections; add "More" links group absorbing old header/footer/More-sheet destinations (Pre-Order, Reservations, Hours, Contact, About, Privacy, footer legal links) and Settings group (dark-mode toggle, language switcher via `useTheme`/LanguageContext, Logout).

### 7. Long tail + cleanup

PreOrder/Reservations/About/Contact/Hours/Privacy wrapped in PageHeader (pure restyle). Delete dead CSS (`order-mob-*`, `cat-sheet-*`, footer classes) and unreferenced `MenuCard.tsx`/`HeroCarousel.tsx`/`ItemModal.tsx`. Final `sw.js` cache bump.

## Verification (each phase)

- `npm run test` (workspace vitest) — existing `App.test.tsx`, `checkoutTotals.test.ts` + new tests: OrderModeContext persistence, `CartContext.updateEntry`, scroll-spy reducer (if pure fn).
- `npm run build` (tsc strict + vite) must pass every commit.
- Manual matrix via dev server (port 3003): 320 / 375 / 768 / 1280 widths; dark mode on every new surface; reduced-motion (no autoplay/smooth scroll); keyboard pass on Sheet/Accordion/BottomNav; CLS check on Menu (image `aspect-ratio` boxes mandatory).
- End-to-end cart integrity: add item → toggle pickup/delivery → edit item in place → sign in at checkout → cart intact; deep links `?item=`, `?category=`, `?openCart=1` still work.

## Key risks

- MenuPage (917 lines) rewrite → mitigated by extract-then-swap sequencing.
- CheckoutPage (1,109 lines, inline `S` styles, mobile/desktop branch) → reuse section consts wholesale; incremental style migration.
- Whole-menu render perf → `content-visibility` + lazy images; fallback to ±2-section windowing if needed.
- PWA staleness → sw.js cache bumps with shell changes.

## Deliverable

All work committed and pushed to `claude/zus-coffee-app-redesign-f79hfx` in phase-sized commits.

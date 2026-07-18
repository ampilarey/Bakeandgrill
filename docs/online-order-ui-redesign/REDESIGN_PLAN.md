# Bake & Grill Order App — Master UI/UX Design & Implementation Specification

**v2.2 — owner decision: customer app is English-only; Dhivehi UI language removed. `t()` layer retained for future languages.**

**Version 2 (Enhanced).** Version 1 was the approved ZUS-style redesign plan; this revision expands it into the project's long-term Master UI/UX Design and Implementation Specification. All v1 content is preserved (Context and decisions below; the v1 implementation phases live in §30 Migration Strategy; v1 verification and risks in §30–§32).

**Amendment over v1:** the Prayer Time bar is **not** reduced to a compact chip. It remains a full-width banner directly below the Home greeting (§12). This is a mandatory, brand-defining feature.

**v2.1 (implementer-review rulings).** The implementing engineer's pre-build review raised 12 ambiguities and several gaps; the architect's rulings are folded into the affected sections below and marked *(v2.1)*. Headline rulings: deep links stay id-only (`?item=<id>`); PWA "My Orders" shortcut retargets to `/order-history` in Phase 2; the header-mounted PrayerBar moves to Home in Phase 2 (never absent); the `fetchItems` delivery→pickup fallback is authoritative for the mode toggle; checkout uses 6 accordions (time merged into the mode-specific section); ActiveOrderCapsule fully replaces OrderStatusBar; per-card prep times are omitted (global ETA only); all new strings go through `t()` (English UI; see v2.2).

---

## Context (from v1)

The customer ordering app (`apps/online-order-web`, React 19 + Vite + TS, served at `/order`) works but looks like a responsive website. The goal is to make it feel like the ZUS Coffee mobile app — a native-app-like ordering experience — based on 10 ZUS screenshots and a written spec provided by the owner. This is a **frontend-only redesign**: keep every existing feature, route, API call, pricing rule, OTP flow, and backend contract. Keep Bake & Grill branding (existing amber `#D4813A` palette — owner explicitly chose NOT to switch to maroon), logo, Plus Jakarta Sans, dark mode, i18n.

**Owner decisions locked in:**

- Bottom nav (5 tabs): **Home / Menu / Orders / Rewards / Account**; cart is a floating bar, not a tab
- **Pickup/Delivery toggle moves to top of Menu page**, carries into checkout
- Whole customer app in scope; keep amber branding
- **No feature flag** — direct redesign on branch `claude/zus-coffee-app-redesign-f79hfx` (a flag would mean forking Layout/MenuPage/CheckoutPage ~2,000 duplicated lines; rollback = revert the branch). Phase the work so every commit builds.
- Prayer Time banner stays full-width on Home, directly below the greeting (v2 amendment).

**Hard boundaries (unchanged in every section of this document):** no changes to backend architecture, APIs, database, pricing logic, checkout logic, payment logic, OTP logic, reservation logic, pre-order logic, loyalty logic, promotions, POS integration, or KDS integration. Routes change only where strictly additive (`/rewards`). ZUS is a reference for hierarchy, navigation, layout, spacing, flow, and interaction design only — never for colours, illustrations, icons, branding, artwork, or wording.

## Verified codebase facts the plan builds on (from v1, re-verified)

- `src/api/menu.ts:13–21` — `getSalesChannel()`/`setSalesChannel()` persist `bakegrill_sales_channel` + dispatch `sales_channel_change`; MenuPage:149 and HomePage:66 already listen and reload.
- `src/hooks/useCheckout.ts:207` — `const [orderType, setOrderType] = useState<OrderType>("pickup")`; effect at ~263–279 calls `setSalesChannel` + refetches items + prunes cart.
- `CartContext` has only `updateQuantity(index, qty)` — **edit-in-place is net-new** (`updateEntry`).
- `ItemModal` always opens with modifiers reset to `[]` (state owned by MenuPage) — no edit mode today.
- CheckoutPage already builds section consts (`sectionOrderType`, `sectionDelivery`, `SectionCard`s…) — accordion conversion can reuse them wholesale. AuthBlock renders inline on checkout when signed out, so login-from-checkout already returns with cart intact — keep it inline.
- MenuPage filters one category at a time (no scroll-spy); mobile uses a category bottom sheet; all items are fetched in one `fetchItems()` call (good for sectioned render).
- `Category.image_url?: string | null` exists (`packages/shared/src/types/product.ts`) → rail icons; fallback = coloured circle with first grapheme (names are admin-driven/Dhivehi-capable — no emoji map).
- Rewards data available today: `getLoyaltyAccount()`, `getMyReferralCode()`, `fetchActiveSpecials()`, `utils/loyalty.ts`. No "my offers" API — don't invent one. Gift cards exist only as checkout redemption — stays there.
- `PrayerBar.tsx` (~560 lines, self-contained): island selection via geolocation + searchable dropdown (`pt_island`, `pt_islands_list` in localStorage), today's + tomorrow's prayer times cached in localStorage (works offline from cache), live countdown tick to next prayer, portals into `#prayer-strip-root`.
- Push notifications exist: `usePushNotifications(isAuthenticated)` → `pushManager.subscribe` + backend `/push/subscribe` / `/push/unsubscribe`; hand-written `public/sw.js` handles push + offline fallback (`offline.html`).
- Existing `src/components/ui/` primitives (Badge, Button, Card, Input, Modal, SectionHeader) — extend, don't restart. Tests: `App.test.tsx`, `checkoutTotals.test.ts` (vitest). Build: `tsc && vite build`.

---

## 1. Executive Summary

Bake & Grill's online ordering app is functionally complete (menu, modifiers, cart, OTP auth, delivery zones, pickup slots, BML payment, loyalty, referrals, pre-orders, reservations, live order tracking, PWA install, dark mode, English UI via `t()`) but presents as a responsive website. This project restyles and restructures **only the presentation layer** of `apps/online-order-web` into a premium, mobile-first, app-like experience inspired by the usability of the ZUS Coffee app.

What changes: screen hierarchy, navigation (5-tab bottom nav + floating cart), the Menu browsing model (category rail + scroll-spy + sectioned grid), sheet-based product customisation and cart, accordion checkout, a focused OTP login screen, a new Rewards tab surfacing existing loyalty data, and a consolidated Account hub. What does not change: every API call, business rule, price calculation, and backend contract. Delivery is phased (7 phases, §30) so the app builds and works at every commit; rollback is a branch revert.

Success in one sentence: a returning customer on a 390px phone can go from opening the app to a placed pickup order in under 60 seconds and under 10 taps, while every existing feature remains reachable and the app is unmistakably Bake & Grill.

## 2. Design Philosophy

1. **App, not website.** One centred column, fixed bottom navigation, sheets instead of page jumps, sticky CTAs. The browser chrome should be forgettable, especially in installed-PWA mode.
2. **Ordering is the spine.** Every screen answers "how does this get the customer closer to food?" Home is a launchpad, not a brochure; marketing content ranks below ordering entry points.
3. **Bake & Grill identity, ZUS usability.** Warm amber (`#D4813A`), cream backgrounds, Plus Jakarta Sans, own photography, the Prayer Time banner, WhatsApp/Viber contact — laid out with ZUS's calm spacing, image-led cards, and one-hand reachability.
4. **Local first.** Maldives context is a feature: prayer times, MVR/laari money handling, island-based delivery zones. (`name_dv` remains on API/admin contracts but is not shown in the customer UI — v2.2.)
5. **Nothing invented, nothing lost.** UI may only surface data and actions that exist today. Every current feature must have a home in the new IA (§9) before its old home is deleted.
6. **Honest states.** Sold-out, closed-for-orders, gate-closed, offline, and loading states are designed deliberately — dimmed but readable (improving on ZUS's over-faded sold-out treatment).

## 3. UX Principles

- **Thumb-first:** primary actions live in the bottom 40% of the screen; 44×44px minimum touch targets (`--touch-target`).
- **One decision per moment:** checkout is a sequence of accordions, one open at a time; modifier groups are visually separated; the order-mode toggle is binary and always visible on Menu.
- **Never lose customer work:** cart survives mode toggles (with explicit pruning toasts), login round-trips, payment failure returns, and app restarts (localStorage). Editing a cart line preselects its state.
- **Show, don't navigate:** item detail, cart, search, and category selection are overlays/sheets on Menu — the customer never "leaves" the menu to inspect something.
- **Feedback within 100ms:** every tap gets an immediate visual response (press state, skeleton, spinner ≤ one).
- **Progressive disclosure:** collapsed accordions show their chosen value; the floating cart shows count + total before the cart is opened; stat chips summarise before Rewards details.
- **Predictable back:** back always closes the topmost layer (sheet → page → tab root), never dumps the user out of a flow with unsaved state without confirmation.
- **Respect user settings:** dark mode, reduced motion, font scaling, and language are honoured on every new surface.

## 4. User Personas

| Persona | Profile | Primary flow | Design implications |
|---|---|---|---|
| **Aisha, 28 — Malé office worker** | Orders pickup lunch 2–3×/week from her phone; time-poor; logged in; PWA installed | Home → reorder strip or Menu → floating cart → checkout (pickup, ASAP) | Reorder strip near top of Home; remembered mode; ≤10 taps to pay; pickup slot picker fast |
| **Hassan, 41 — family dinner at home** | Orders delivery for 4–5 people in the evening; browses broadly; price-aware | Menu (delivery mode) → several items with modifiers → promo code → delivery checkout | Category rail for broad browsing; clear delivery fee/zone feedback; cart editing in place |
| **Maryam, 19 — student** | Watches for specials and loyalty points; shares referral code | Home stat chips → Rewards → specials → Menu | Copy via `t()` (English-only UI, v2.2); Rewards tab visible in nav |
| **David, 35 — expat/tourist** | First-time guest; no account; unfamiliar with local payment | Menu → cart → guest checkout | Guest flow prominent in AuthBlock; menu browsable with zero login walls; clear MVR pricing |
| **Corporate admin, 45** | Places large pre-orders/catering; occasionally reserves tables | Home corporate block / Account → Pre-Order / Reservations | Pre-order & reservations reachable from Account and Home; forms usable on desktop too |

## 5. Customer Journey

```
DISCOVER            DECIDE                 ORDER                    WAIT                  RETURN
--------            ------                 -----                    ----                  ------
Open app/PWA   →    Menu: rail +      →    Floating cart      →     OrderStatus       →   Home reorder strip
Home greeting       sectioned grid         → Cart sheet             timeline (poll)       Orders tab
Prayer banner       Search overlay         → Checkout accordions    Push notification     Rewards points grow
Stat chips          Item sheet             → AuthBlock (if needed)  Active-order capsule  Referral share
Promo carousel      (modifiers/variants)   → BML payment            Driver map (delivery)
Mode entry cards    Specials strip         → Success/failure return Review prompt
```

Emotional targets per stage: *Discover* = warmth + orientation (greeting, prayer times, offers). *Decide* = confidence (photos, taglines, honest availability). *Order* = control (visible totals at all times, editable everything). *Wait* = reassurance (live timeline, ETA, contact buttons). *Return* = recognition (name, points, "order again").

Drop-off countermeasures: cart persists across sessions; checkout keeps state through login; payment failure returns to a retry screen with cart intact; closed-store state still allows browsing and (where enabled) pre-orders.

## 6. Screen Inventory

Every customer-facing screen/surface. Route basename is `/order`.

| # | Screen | Route / trigger | Status |
|---|---|---|---|
| 1 | Home | `/` | Redesigned (§11) |
| 2 | Menu | `/menu` (+ `?category=`, `?item=`, `?openCart=1`) | Redesigned (§14) |
| 3 | Search overlay | Menu search button | Redesigned (§22) |
| 4 | Item detail sheet | tap product / `?item=` deep link | Redesigned (§16), replaces ItemModal |
| 5 | Cart sheet | Floating cart bar / `?openCart=1` | Redesigned (§17), replaces cart drawer portal |
| 6 | Checkout | `/checkout` (standalone, no bottom nav) | Redesigned (§18) |
| 7 | Login / OTP (AuthBlock) | inline on Checkout + Account signed-out; states: phone → password / OTP → profile setup; guest; forgot/reset | Restyled (§18.6) |
| 8 | Orders (history) | `/order-history` | Redesigned as Orders tab (§19) |
| 9 | Order tracking | `/orders/:orderId` (authed), `/track/:trackingToken` (public) | Restyled (§19) |
| 10 | Rewards | `/rewards` | **New page, existing data only** (§20) |
| 11 | Account hub | `/account` (Profile, Addresses, Order history sections) | Redesigned (§21) |
| 12 | Pre-Order | `/pre-order` | Restyled shell (PageHeader) |
| 13 | Reservations | `/reservations` | Restyled shell |
| 14 | About / Contact / Hours / Privacy | `/about`, `/contact`, `/hours`, `/privacy` | Restyled shell |
| 15 | Not found | `*` | Restyled shell |
| 16 | Offline fallback | `public/offline.html` (service worker) | Keep; retheme colours only |
| 17 | Payment return states | handled inside OrderStatus/Checkout flows | Logic untouched, restyled |

Persistent surfaces: bottom navigation (all shell routes), floating cart bar (cart non-empty), active-order capsule, announcement banner, Prayer Time banner (Home; portal available elsewhere), toasts.

## 7. Component Inventory

Legend: **[N]** new, **[R]** rework of existing, **[K]** kept as-is (restyle at most).

**Shell** — `shell/AppShell.tsx` [R of Layout.tsx], `shell/BottomNav.tsx` [N], `shell/FloatingCartBar.tsx` [N], `shell/PageHeader.tsx` [N], `shell/ActiveOrderCapsule.tsx` [R of OrderStatusBar placement], announcement banner [K, moved].

**Primitives (`ui/`)** — Badge, Button, Card, Input, Modal [K]; `ui/Sheet.tsx` [N], `ui/StickyCtaBar.tsx` [N], `ui/Accordion.tsx` [N], `ui/Skeleton.tsx` [N, consolidates existing skeleton CSS], `ui/EmptyState.tsx` [N], `ui/ErrorState.tsx` [N], SectionHeader [K].

**Ordering** — `OrderModeToggle.tsx` [N], `menu/CategoryRail.tsx` [N], `menu/MenuSectionHeader.tsx` [N], `menu/ProductCard.tsx` [R of MenuCard], `menu/FilterChipsRow.tsx` [N, folds sort+dietary+sale filters], `ItemSheet.tsx` [R of ItemModal], `CartSheet.tsx` [R of CartDrawer host], `CartLineItem.tsx` [N, extracted], `SearchOverlay.tsx` [N].

**Home** — `home/GreetingHeader.tsx` [N], `home/StatChipsRow.tsx` [N], `home/PromoCarousel.tsx` [R of HeroCarousel], `home/ModeEntryCards.tsx` [N], `home/SpecialsCarousel.tsx` [R of specials strip], `home/ReorderStrip.tsx` [R], `home/BrandFooter.tsx` [N].

**Checkout** — CheckoutPage sections [K logic, wrapped in Accordion], AuthBlock [K logic, restyled], BrandedHeader [K, restyled], CartSummary [K].

**Cross-cutting** — `PrayerBar.tsx` [K — full component, §12], PWA bits (`sw.js`, `manifest.json`) [K + cache bumps], Toasts [K], `useTheme` hook [N, extracted from Layout], OrderModeContext [N], LanguageContext/AuthContext/CartContext/SiteSettingsContext/ToastContext [K; CartContext gains `updateEntry`].

## 8. Design System

All tokens live in `src/index.css` `:root` / `[data-theme="dark"]`; Tailwind config maps them. **No existing token is removed.**

### 8.1 Colours (existing palette, unchanged values)

| Token | Light | Dark theme | Use |
|---|---|---|---|
| `--color-primary` | `#D4813A` | (existing dark variant) | CTAs, active nav, accents, rail indicator |
| `--color-primary-hover` | `#B86820` | | pressed/hover |
| `--color-primary-light` | `#FEF3E8` | | chip fills, selected backgrounds |
| `--color-bg` | `#FFFDF9` | | app background |
| `--color-surface` / `-alt` | `#FFFFFF` / `#FEF3E8` | | cards, sheets |
| `--color-text` / `-muted` | `#2A1E0C` / `#8B7355` | | primary/secondary text |
| `--color-dark` | `#1C1408` | | brand footer background |
| success / warning / error | `#16a34a` / `#ca8a04` / `#dc2626` | | status pills, toasts, validation |

Rules: primary-on-white and text-on-bg pairs must hold ≥ 4.5:1 contrast (§26); semantic colours are never the only carrier of meaning; every new class uses `var(--color-*)` so dark mode is automatic.

### 8.2 Typography — Plus Jakarta Sans (existing)

Scale (rem): display 1.75/800 (greeting, points hero) · title 1.25/700 (page & section headers) · body 1.0/500 · label 0.875/600 (chips, nav) · caption 0.75/500 (taglines, legal). Product name: 1.0/700, 2-line clamp. Price: 1.0/700 tabular-nums. Document is `lang="en"` / `dir="ltr"` (v2.2).

### 8.3 Spacing, radius, elevation

- Spacing: existing 8px scale (4/8/12/16/24/32); page gutter `--page-gutter` (1rem mobile).
- Radius: existing sm→2xl + full; add `--radius-3xl: 1.75rem` (promo banners, mode cards, sheets' top corners).
- Shadows: existing sm/md/lg + `--shadow-float: 0 8px 30px rgba(42,30,12,0.12)` for floating cart, sheets, active-order capsule.
- New metric tokens: `--bottom-nav-height: 64px`, `--float-cart-height: 56px`, `--safe-bottom: env(safe-area-inset-bottom, 0px)`, `--shell-max: 640px`, `--cat-rail-width: 90px`, `--menu-header-height`, `--touch-target: 44px`, `--chip-height: 64px`.
- Z-index: existing scale kept (`--z-header` 300, `--z-bottom-nav` 300, `--z-pay-bar` 320, `--z-modal` 400, `--z-toast` 500). Sheets use `--z-modal`; floating cart sits between nav and modal.

### 8.4 Icons & imagery

Inline SVG icons (as today), 24px default / 20px dense, `stroke-width` consistent, `currentColor` fill so they theme automatically. No icon font, no ZUS icons. Product imagery: existing photography, square `aspect-ratio: 1` boxes with `--radius-xl`+, `object-fit: cover`, `loading="lazy"`, cream placeholder background. Category rail: `Category.image_url` 40px rounded thumb → fallback coloured initial circle.

### 8.5 Animation & transition tokens

`--ease-out: cubic-bezier(0.16, 1, 0.3, 1)`; durations: micro 120ms (press, toggle), standard 200ms (fade/slide of chips, accordion), sheet 280ms (translate-Y in, 200ms out), page 150ms fade. Full per-surface spec in §24. Everything collapses to ≤ 1ms under `prefers-reduced-motion` (§26).

## 9. Information Architecture

```
AppShell (/order)
├── TAB 1 Home (/)
│     greeting · PRAYER BANNER · stat chips · promos · mode cards · specials · reorder · corporate · brand footer
├── TAB 2 Menu (/menu)                       ← the ordering workhorse
│     sticky mode header · category rail + sectioned grid
│     ├── overlay: Search
│     ├── sheet: Item detail (add / edit)
│     └── sheet: Cart  ──────────────► /checkout (standalone, no tabs)
│                                        └── inline AuthBlock when signed out
├── TAB 3 Orders (/order-history) ──► /orders/:id · /track/:token (standalone tracking)
├── TAB 4 Rewards (/rewards)   [new route]
└── TAB 5 Account (/account)
      profile · addresses · orders link · settings (theme, language, notifications)
      └── More links: Pre-Order, Reservations, Hours, Contact, About, Privacy, legal
```

Hierarchy rules: tabs are peers and keep independent scroll positions; standalone routes (`/checkout`, `/orders/:id`, `/track/:token`) hide the bottom nav and use a back-arrow header; sheets/overlays stack on top of tabs and are dismissible; the "More" destinations (old header/footer/More-sheet links) all rehome under Account — nothing is orphaned.

## 10. Complete Navigation Specification

**Top navigation.** No global sticky header. Each surface owns its top area: Home = greeting header; Menu = sticky order-mode header (§14.1); tab pages = `PageHeader` (title, optional right slot); standalone pages = `BrandedHeader`/`PageHeader` with back arrow. The announcement banner (server-driven) renders above everything in AppShell, dismissible per session as today.

**Bottom navigation.** 5 items (Home `/`, Menu `/menu`, Orders `/order-history`, Rewards `/rewards`, Account `/account`). Fixed, height `--bottom-nav-height` + `--safe-bottom` padding; icon 24px + 11px label; active = `--color-primary` icon/label + dot indicator, inactive = `--color-text-muted`; `aria-current="page"`; badge on Orders when an order is active. Hidden on: `/checkout`, `/orders/:id`, `/track/:token`, and while a full-height sheet or the search overlay is open (`hideNav` context flag). Visible at all viewport widths (desktop keeps the app column, §25). *(v2.1)* No desktop top nav returns in any phase; the in-app logo never links out to the marketing site (external/marketing links live only in BrandFooter and About).

**Back behaviour.** Android back / browser back pops the topmost layer first: open sheet or overlay closes (sheets push a history entry via `history.pushState` so hardware back closes them, matching current modal behaviour where present); otherwise navigate back within the stack; tab roots fall through to Home; Home lets the browser exit. In-page back arrows mirror this. Leaving Checkout with entered-but-unsubmitted state keeps state in `useCheckout`; the cart is never cleared by navigation (only by successful order or explicit clear, as today).

**Deep links (all preserved, existing semantics).** *(v2.1)* `/menu?category=<slug>` scrolls to that section — slug matching stays exactly today's rule (category **name** lowercased/hyphenated, MenuPage:193; there is no slug field). `/menu?item=<id>` opens the Item sheet — **numeric id only**, as today (MenuPage:190–203); slug support is out of scope. `/menu?openCart=1` opens the Cart sheet. `/track/:token` works logged-out; `/orders/:id` prompts auth via existing flow. PWA shortcuts: "Order Now" → `/menu` unchanged; **"My Orders" retargets from `/account` to `/order-history`** in Phase 2 (a `manifest.json` edit — frontend file, allowed).

**Modal/sheet navigation.** One sheet at a time; opening Item-edit from Cart swaps Cart→Item and returns to Cart on save/close. Sheets: backdrop tap, swipe-down on drag handle, Escape, and hardware back all close. Focus is trapped and restored to the invoking element (§26).

**Search** opens as a full overlay from the Menu header (§22). **Cart** is reachable exclusively through the floating cart bar (+ legacy `?openCart=1`): visible whenever `cart.length > 0` except on Checkout; shows live count and server-consistent subtotal.

## 11. Home Screen Specification

### 11.1 Layout & wireframe (390px reference)

```
┌────────────────────────────────────────┐
│ [announcement banner — if set]         │
│                                        │
│  Hello, Aisha :)              ( AV )   │  GreetingHeader: display type,
│  What would you like today?            │  avatar → /account; signed-out:
│  [● Open until 23:00]                  │  "Hello :)" + Sign in pill
│                                        │
│ ┌────────────────────────────────────┐ │
│ │ 🕌 PRAYER TIMES — Malé             │ │  ← FULL-WIDTH PRAYER BANNER (§12)
│ │ Asr 15:32 · next in 00:41 ▾        │ │     directly below greeting
│ └────────────────────────────────────┘ │
│                                        │
│ ┌──────────┐┌──────────┐┌──────────┐   │  StatChipsRow (--chip-height):
│ │ ⭐ 240 pts││ 🧾 Order ││ 🔥 3     │   │  loyalty · active order · today's
│ │ Rewards  ││ Preparing││ specials │   │  specials — all existing data
│ └──────────┘└──────────┘└──────────┘   │
│ ┌────────────────────────────────────┐ │
│ │                                    │ │  PromoCarousel: admin heroSlides,
│ │      [promo banner  16:9]          │ │  --radius-3xl, autoplay (reduced-
│ │            ● ○ ○                   │ │  motion off), CTA per slide
│ └────────────────────────────────────┘ │
│ ┌─────────────────┐┌─────────────────┐ │
│ │   DELIVERY      ││    PICKUP       │ │  ModeEntryCards: set mode →
│ │   [own photo]   ││   [own photo]   │ │  navigate /menu; images = static
│ └─────────────────┘└─────────────────┘ │  public/images/mode-*.jpg (v2.1)
│ Today's specials            See all →  │  SpecialsCarousel (horizontal)
│ [card] [card] [card] ▸▸                │
│ Order again                            │  ReorderStrip (authed, existing
│ [last order card  →  Reorder]          │  handleReorder)
│ [corporate / catering block]           │
│ ┌────────────────────────────────────┐ │
│ │  (logo)  Thanks for being with us  │ │  BrandFooter: --color-dark bg,
│ │  [WhatsApp]  [Viber]               │ │  contact CTAs, legal links
│ └────────────────────────────────────┘ │
├────────────────────────────────────────┤
│ [floating cart bar — if cart > 0]      │
│  Home   Menu   Orders  Rewards  Acct   │
└────────────────────────────────────────┘
```

### 11.2 Component hierarchy

`HomePage` → `GreetingHeader` (uses `useAuth`, `OpeningStatusBadge`) → `PrayerBar` (full banner) → `StatChipsRow` → `PromoCarousel` → `ModeEntryCards` (uses `OrderModeContext`) → `SpecialsCarousel` → `ReorderStrip` → corporate block → `BrandFooter`. All existing data effects on HomePage (`fetchItems`, `fetchOnlineOrderingStatus`, `fetchActiveSpecials`, `fetchFeaturedReviews`, `fetchCustomerOrders`, corporate form) are kept. *(v2.1)* ModeEntryCards imagery = static files under `public/images/` (e.g. `mode-delivery.jpg`, `mode-pickup.jpg`) with cream-placeholder fallback until real photos are supplied; the corporate block keeps its current markup/logic, wrapped in a card (restyle only).

### 11.3 Spacing & rules

Vertical rhythm: 24px between blocks, 12px within blocks; gutters `--page-gutter`. Home must stay ≤ ~2.5 viewport-heights: lower-priority sections scroll horizontally instead of stacking. Ordering entry (mode cards) must be visible within the first 1.5 screens.

### 11.4 States

- **Loading:** skeleton greeting line, 3 skeleton chips, 16:9 skeleton banner, 2 skeleton mode cards. No layout shift (all media have fixed aspect boxes).
- **Signed-out:** neutral greeting, "Sign in to earn points" chip replaces loyalty chip, no reorder strip. Menu remains fully browsable — no login wall.
- **Store closed:** OpeningStatusBadge shows closed state (existing logic); mode cards stay tappable for browsing; ordering-status messaging appears on Menu as today.
- **Error:** stat chips fail silently to placeholders; carousel falls back to static brand card; page never blanks on one failed fetch.
- **Active order:** capsule (§19) appears above the floating cart bar; the "active order" chip deep-links to `/orders/:id`.

### 11.5 Responsive & a11y

320px: stat chips become horizontally scrollable; mode cards stack vertically. ≥768px: content column capped at `--shell-max`, promo banner max-height capped. Headings h1 (greeting) → h2 (sections) in order; carousel is a `region` with list semantics and reachable dots; all cards are single `<a>`/`<button>` elements with full-card hit areas.

## 12. Prayer Time Banner — MANDATORY FEATURE

The Prayer Time banner is a signature Bake & Grill feature. **It is not reduced to a chip.** It renders full-width on Home, directly below the greeting header, using the existing `PrayerBar.tsx` component (all logic kept: island selection, geolocation, localStorage caching, countdown tick).

### 12.1 Layout

```
Collapsed (default):
┌──────────────────────────────────────────────┐
│ 🕌  Prayer Times · Malé ▾     Asr 15:32      │   height 56px, --color-surface-alt bg,
│     next prayer in 00:41                     │   --radius-xl, left icon, tap = expand
└──────────────────────────────────────────────┘
Expanded:
┌──────────────────────────────────────────────┐
│ 🕌  Prayer Times · Malé ▾            [ ⌃ ]   │
│  Fajr    Sunrise   Dhuhr   Asr*  Maghrib Isha│   * next prayer highlighted
│  04:41   05:58     12:10   15:32 18:14  19:27│   (--color-primary-light pill)
│  ⌖ Use my location        Change island 🔍   │
└──────────────────────────────────────────────┘
```

- Full bleed to the content column's gutters; spacing 16px below greeting, 24px above stat chips.
- Island selector: existing searchable dropdown (`pt_islands_list`), existing geolocation button with its spinner state (`geoSpinning`).
- Countdown updates once per second via the existing tick; only the countdown text node re-renders.

### 12.2 States

- **Loading:** skeleton bar (56px) with shimmering label; never collapses layout (fixed height).
- **Loaded/collapsed:** island name, next prayer name + time, live countdown.
- **Expanded:** all six times in a grid (2×3 on 320px, 6×1 from 390px), next prayer highlighted; expand/collapse animates height 200ms `--ease-out` (instant under reduced motion); expansion state persists for the session.
- **Offline:** serves cached times from localStorage (existing behaviour) and shows a subtle "offline — cached times" caption; if no cache exists, the banner shows a quiet "Prayer times unavailable" row — it never breaks Home.
- **Around prayer time:** if the store pauses orders around prayer (existing `OrderStatusBar`/ordering-status logic), that message renders in the banner's caption line, linking the two features.

### 12.3 Placement elsewhere & a11y

*(v2.1)* Today PrayerBar is mounted in the global header (Layout.tsx:242) and HomePage does not mount it. When Phase 2 deletes the header, **the same commit mounts PrayerBar on Home below the greeting** (basic placement; §12 styling lands in Phase 4) so prayer times are never absent between phases. Exactly **one instance per screen**: Home and Account — no double-mounts. `#prayer-strip-root` portal target stays in AppShell so the existing portal keeps working; the full banner also renders on the Account page. It is **not** shown inside the Menu sticky header (space contested) — the Menu keeps the ordering-status strip which already carries prayer-pause messaging. The banner is a `<section aria-label="Prayer times">`; the expand control is a `<button aria-expanded>`; the countdown has `aria-live="off"` (announced only on prayer change, not every second).

## 13. Promotion System

All promotional surfaces are fed by **existing** admin-driven data: `heroSlides` (SiteSettingsContext), `fetchActiveSpecials()`, sale/badge fields on items, announcement text. No new promo APIs.

- **PromoCarousel (Home):** slides from `heroSlides` in admin-defined order (priority = array order); autoplays every 5s (pauses on hold/hover, off entirely under reduced motion); wraps existing HeroCarousel behaviour with new markup; each slide = image + optional headline + one CTA (existing link field: "Order now" → `/menu`, deep link to category/item where set). Dots are buttons. Loading = 16:9 skeleton; zero slides = static brand-photography card so the slot never collapses; broken image = cream placeholder with logo.
- **Limited offers / campaigns:** rendered from `fetchActiveSpecials()` as the SpecialsCarousel (Home), a "Specials" section in Menu, and the specials grid on Rewards. Sale prices/badges on ProductCards come from existing item fields — presentation only.
- **Meal deals / combos:** these are existing menu items (combo badge) — they get a dedicated rail section when the category exists; no new bundling logic.
- **Rotation & fallback rule:** promotional imagery is lazy-loaded and must never block menu interactivity (§29); if specials return empty, the sections simply don't render (no placeholder ad slots).

## 14. Menu Specification (the core screen)

### 14.1 Sticky order-mode header

```
┌────────────────────────────────────────┐
│ ┌────────────────────┐          ┌───┐  │ row 1: OrderModeToggle pill
│ │ (Pickup)| Delivery │          │ 🔍│  │        + round search button
│ └────────────────────┘          └───┘  │
│ 🏠 Deliver to: H. Example House      ▸ │ row 2: address / pickup row
├────────────────────────────────────────┤
│ [ordering-status strip if closed/etc.] │ existing logic, restyled
└────────────────────────────────────────┘
```

- Sticky at top (`--menu-header-height`), `--color-bg` with bottom hairline on scroll.
- **OrderModeToggle:** two segments, selected = `--color-primary` fill/white text, 120ms slide. Reads/writes `OrderModeContext` (§30 step 1). On switch: refetch via `fetchItems(mode === 'delivery' ? 'delivery' : 'online_pickup')` (channel passed explicitly), prune cart with existing `pruneCartToAllowedItemIds`, toast listing removed items ("2 items unavailable for delivery were removed"). Delivery segment disabled (with existing message) when `deliveryBlocked`.
- **Delivery-empty fallback** *(v2.1)*: `fetchItems` itself silently falls back to pickup when the delivery channel has zero items — it sets `online_pickup` and emits `sales_channel_change` (menu.ts:162–169). `OrderModeContext` **treats that event as authoritative**: the toggle snaps to Pickup and the existing `deliveryFallback` notice explains why. The toggle must never fight the event (no snap-back loop).
- **Address row** *(v2.1)*: delivery → default saved address (`fetchCustomerAddresses`; default = is-default flag, else first saved) or "Set your address ▸"; tap → Account ▸ Addresses when authed, Account (login) when signed out. The row is informational — Checkout remains the authoritative address selection + zone validation step, and browsing is never blocked. Pickup → business address from settings ("Pickup from: Bake & Grill, Malé").
- **Row 3 (conditional):** existing ordering-status strip (closed / pickup-only / prayer pause) and deliveryFallback notice — logic unchanged.

### 14.2 Category rail

Left sticky column, `--cat-rail-width` (90px), independently scrollable, from `fetchCategories()` parents. Item = 40px icon (`image_url` thumb, normalised like the existing `cat-sheet-card` code, else initial circle tinted deterministically from category id) + 2-line-clamped 11px label. Active = 3px left accent bar + `--color-primary` label + `--color-primary-light` bg. `role="tablist"`/`tab` semantics, arrow-key navigation. Rail auto-scrolls to keep the active item visible (existing `activePillRef.scrollIntoView` pattern). Empty categories (0 available items in current channel) are hidden from the rail entirely.

**Narrow fallback (<340px):** rail stays but drops labels (icon-only, 64px) — product column never goes below ~230px.

### 14.3 Sectioned product area + category syncing

- All parent categories render as sections in one page scroll: `MenuSectionHeader` (accent bar + name + optional `image_url` banner, 3:1 ratio, lazy) then the item grid; sub-groups use existing `itemGroups` logic generalised to all parents; uncategorised items → trailing "Other" section.
- Perf: `content-visibility: auto` + `contain-intrinsic-size` per section body; every card image `loading="lazy"` with `aspect-ratio` box (§29). Fallback if a giant menu still lags: window to ±2 sections around the viewport.
- **Scroll-spy:** one `IntersectionObserver` on section headers, `rootMargin: "-{header}px 0px -60% 0px"` → sets `activeCategoryId`. Rail tap → `isProgrammaticScroll` ref suppresses the observer, `scrollIntoView` (smooth; `auto` under reduced motion), release suppression after scroll settles. Extract the active-id decision as a pure function for unit testing.
- **Deep links:** `?category=` (existing slug-matching effect) scrolls to its section on load; `?item=` opens Item sheet; both work together.

### 14.4 Search & filters

Search button expands to the overlay (§22), reusing existing `searchQuery` state and the `filteredItems` memo. `FilterChipsRow` under the header (horizontal chips): dietary filters, sale filter, favourites, and sort (folded from the old select). **When any search/filter is active:** sectioned view is replaced by the flat `filteredItems` grid (existing memo verbatim), rail dims to 40% and is inert, and a "Clear filters" chip appears. Wait-time/ETA display and favourites logic are kept as-is.

### 14.5 States

- **Loading:** rail = 6 skeleton circles; grid = 6 skeleton cards (image box + 2 lines). No spinner-only screens.
- **Error:** `ErrorState` with retry (re-calls `fetchItems`); cached/last-good items keep rendering if present.
- **Empty channel:** if a mode has zero items, `EmptyState` with "Try Pickup/Delivery instead" action that flips the toggle.
- **Closed store:** browsing works; add-to-cart behaviour follows existing ordering-status rules; strip explains state.

## 15. Product Card Specification

```
┌──────────────────┐
│   [image 1:1]    │  ← rounded --radius-xl, lazy, cream placeholder
│  ♥        [NEW]  │  ← favourite toggle (top-left), badge (top-right)
│ SPICY GRILL      │  ← tagline/caption 0.75rem --color-text-muted (from badges/dietary)
│ Chicken Grill    │  ← 1rem/700, 2-line clamp
│ MVR 95.00  MVR75 │  ← price; sale = struck original + --color-error sale price
│            [ + ] │  ← quick-add (only when no mandatory choices)
└──────────────────┘
```

- 2-column grid (16px gap); card = borderless on `--color-bg` with image dominating (~55% of card height); whole card is one button opening the Item sheet.
- **Badges** (existing set: bestseller/new/spicy/mto/combo/sale): max 2 visible, using existing badge colour classes.
- **Availability / Sold out:** card stays in place; image + text at 45% opacity **but** a solid "Sold out" pill (white text on `--color-text-muted`, AA-compliant — deliberately better than ZUS's washed-out treatment); quick-add hidden; card still opens the sheet in read-only mode; existing "back soon" message shown when the API provides one.
- **Quick add [+]:** 44px target; only for items with no required variants/modifiers (same rule the current MenuCard uses); tap = existing add-to-cart + fly-to-cart micro-animation (§24) + toast. Items needing configuration always open the sheet.
- **Preparation time** *(v2.1)*: only a global wait estimate exists today (`getWaitTimeEstimate`, MenuPage ~160–167) — it stays in the menu header area as today. **Per-card prep times are omitted** (no per-item data; never invent).
- **Promotion:** sale badge + dual pricing from existing sale fields; no new promo maths in the client.

## 16. Product Detail (Item Sheet)

Full-screen `Sheet` replacing ItemModal; all ItemModal logic (variants, modifier groups, min/max validation, reviews, pairings) moves in unchanged. New props: `initialQty`, `initialModifiers`, `initialVariantId`, `editIndex` for cart edit-in-place.

```
┌────────────────────────────────────────┐
│ [✕]                          [♥]       │
│ ┌────────────────────────────────────┐ │  Hero: existing item image, 4:3,
│ │            hero image              │ │  (gallery/swipe only if multiple
│ └────────────────────────────────────┘ │  images exist in data — else single)
│ Chicken Grill              MVR 95.00   │
│ Marinated overnight, grilled to order… │  existing description
│ [spicy] [gluten-free]                  │  existing dietary/ingredient tags
│ ── Choose size · Required ─────────── │
│ (•) Regular            +MVR 0.00       │  radios = single-choice group
│ ( ) Large              +MVR 25.00      │
│ ── Extras · up to 3 ────────────────── │
│ [ ] Extra cheese       +MVR 10.00      │  checkboxes = multi-choice
│ [ ] Garlic sauce       +MVR 5.00       │  qty steppers where group allows
│ ── Notes ───────────────────────────── │
│ [ no onions please…               ]    │  existing notes field
│ ── Quantity ──────  [−]  2  [+]        │
├────────────────────────────────────────┤
│ █ MVR 200.00 · Add to cart █           │  StickyCtaBar; in edit mode:
└────────────────────────────────────────┘  "Update item"
```

- **Validation (existing rules, unchanged):** CTA disabled until required groups satisfy min/max; unmet groups show inline "Choose at least 1" and the first unmet group scrolls into view on a disabled-CTA tap. Live price on the CTA = existing price computation (server remains authoritative at checkout).
- **Edit mode:** opened from a cart line → preselects variant/modifiers/notes/qty; CTA calls new `CartContext.updateEntry(index, …)` (merges with an identical existing line per its unit tests) instead of `addItem`.
- **Animation:** sheet slides up 280ms; add-to-cart fires the fly-to-cart affordance then closes; ingredient/description sections are plain content (no accordion nesting inside the sheet).
- Availability: sold-out items open read-only (CTA replaced by "Sold out" static bar).

## 17. Cart

- **Floating cart bar (collapsed):** `"{n} items · MVR {cartTotal} · View cart"` — fixed above bottom nav, `--shadow-float`, appears/disappears with 200ms slide+fade when `cart.length` crosses 0; visible on all shell routes except Checkout; count uses `aria-live="polite"`. Subtotal is client-computed for display but always superseded by server pricing at checkout (existing rule: client prices are never trusted).
- **Cart sheet (expanded):** full-height sheet hosting the existing CartDrawer logic — line items (thumb, name, chosen modifiers summary, qty stepper `updateQuantity`, **Edit** → Item sheet edit mode, swipe/[×] remove), existing upsell recommendations, free-delivery progress bar, earn-points preview, wait-time note. Footer: subtotal + note "Fees, discounts & taxes calculated at checkout" (service charge, GST, delivery fee, promo, loyalty, gift-card lines all remain checkout concerns exactly as today — the cart sheet does not duplicate fee maths). `StickyCtaBar`: "MVR {subtotal} · Checkout" → `/checkout`; "Continue shopping" closes the sheet.
- **Empty cart:** sheet shows `EmptyState` ("Your cart is empty — browse the menu") and the floating bar hides.
- **Integrity rules:** mode toggle prunes with toast (§14.1); cart persists in localStorage (existing versioned key `bakegrill_cart`); login/payment round-trips never clear it; clearing is only via existing explicit actions.

## 18. Checkout

Standalone route; no bottom nav; `BrandedHeader` = back arrow + "Checkout". **All `useCheckout` logic, validations, fees, and payment behaviour are untouched** — this section is purely presentational restructuring of the existing section consts into `Accordion`s.

### 18.1 Accordion sequence (one open at a time; errors force-open)

*(v2.1: six accordions — time is merged into the mode-specific section, mirroring the existing section consts so no extra restructuring is needed.)*

1. Order type — collapsed: "Pickup · ASAP" / "Delivery"
2. **Pickup time (slot/ASAP)** or **Delivery address + island/zone + time** — one mode-specific accordion wrapping the existing `sectionPickupSlot` / `sectionDelivery` consts as-is (existing zone check on island blur; existing gate-closed banner above all sections)
3. Contact details (or AuthBlock, §18.6)
4. Promo / Loyalty / Gift card / Referral — collapsed shows applied value ("PROMO10 · −MVR 15.00")
5. Special instructions
6. Payment method (existing options; BML gateway)

*(v2.1)* Error force-open mapping: derive from the existing `useCheckout` error keys — each existing validation error is mapped to its accordion id; the mapping table is documented in the Phase 5 PR description and reviewed there.

Each collapsed row: title + chosen value + "Change" (44px target). Terms checkbox sits above the pay bar (existing requirement). Order summary (CartSummary with server-fetched fees preview) renders above the pay bar on mobile and as a side column ≥900px via CSS only (the `isMobile` JS branch is deleted).

### 18.2 Sticky pay bar

`StickyCtaBar`: "Total MVR {serverTotal} · {placeLabel}" — disabled until existing validations pass; pressing shows inline progress on the bar (never a full-screen blocker), then hands off to the existing payment flow.

### 18.3 Success / failure / confirmation

Unchanged flows, restyled surfaces: success → existing order-status route with the §19 timeline (add one 300ms success check-draw animation); payment failure/cancel → existing return handling, presented with `ErrorState` + "Try again" (cart intact) + WhatsApp/Viber help buttons (already present today); zero-balance path unchanged.

### 18.4–18.5 States & edge cases (all existing logic)

Gate closed, delivery blocked → forced pickup (context makes this globally consistent), out-of-zone island error, expired pickup slots refresh, session expiry → AuthBlock inline, API failure → retry `ErrorState`.

### 18.6 Auth / OTP (AuthBlock restyle — logic byte-identical)

Focused, ZUS-login-inspired layout: centred logo (settings `logo`), "Enter your phone number", input with fixed **+960** display prefix (submission still sends the raw phone exactly as today — `localPhone()`/backend normalisation untouched), primary "Continue" button; then existing branches: password entry, **SMS OTP** (large 6-box code input, existing resend timer), profile setup, guest checkout link, forgot/reset links, terms/privacy links. **No WhatsApp OTP** (backend doesn't support it). Renders inline on Checkout (login returns you exactly where you were, cart intact) and as the signed-out state of Account (§21). Loading/error states inline under the active field.

## 19. Orders

- **Orders tab (`/order-history`, restyled OrderHistoryPage):** `PageHeader` "Orders"; active orders pinned on top as rich cards (order #, type icon, status pill, ETA, total, "Track" CTA); past orders as compact cards (date, first items summary, total, status, "View" + "Reorder"). Reorder uses the existing revalidating flow (unavailable items and price changes handled by existing logic + toast). Signed-out → AuthBlock teaser. Empty → `EmptyState` "No orders yet — see the menu".
- **Tracking (`/orders/:id`, `/track/:token` — routes, polling, and status model unchanged):** restyled vertical timeline from the existing `STEPS` (pending → preparing → ready/out-for-delivery → completed, with existing paid/in_progress normalisation); current step pulses (§24); big status illustration/photo area; delivery orders keep the existing live driver map block; action row: call/WhatsApp/Viber, directions (pickup), receipt.
- **Active-order capsule** *(v2.1)*: AppShell-level pill above the floating cart bar on Home/Orders ("Order #123 · Preparing · ~12 min ▸" → tracking). It **fully replaces `OrderStatusBar`** (verified: OrderStatusBar is an active-order widget — fetches customer orders and surfaces the active one — not the open/closed strip). Same fetch/status logic, one component; OrderStatusBar is deleted in Phase 7 once unreferenced.
- **Receipt/invoice:** existing order-detail data rendered as a clean itemised list (items, modifiers, fees, GST, discounts, total, payment state) — print/share via the browser; **no new invoice backend**.

## 20. Rewards (layout only — zero business-logic changes)

`/rewards` (new lazy route in the shell). Content strictly from existing APIs:

```
[PageHeader: Rewards]
┌────────────────────────────────────┐
│  ⭐ 240 points    ≈ MVR 24.00      │  getLoyaltyAccount + utils/loyalty
│  Tier: Regular ▓▓▓░░ 60% to Gold   │  existing tier_progress + --tier-* tokens
│  "Earn 1 pt per MVR 10"            │  existing program message
└────────────────────────────────────┘
┌────────────────────────────────────┐
│  Refer a friend — your code: BG123 │  getMyReferralCode
│  [Copy]  [Share]                   │  Web Share API → clipboard fallback
└────────────────────────────────────┘
Today's specials
[specials grid — fetchActiveSpecials]
How points work  ▸  (existing static copy)
```

Signed-out → points hero is replaced by an AuthBlock teaser card ("Sign in to see your points"). Redemption itself stays at checkout (existing loyalty section) — the hero links there via "Use points at checkout". **No wallet, no gift-card store, no offers inbox, no invented tiers.**

## 21. Account

`PageHeader` "Account". Signed-out: ZUS-style AuthBlock login screen (§18.6). Signed-in, grouped settings list (existing components/hooks: ProfileSection, AddressesSection, OrderHistorySection, useAccountProfile, useAccountAddresses):

1. **Profile card** — name, phone, edit (ProfileSection).
2. **Prayer times** — the full PrayerBar banner (§12).
3. **My addresses** — AddressesSection (add/edit/delete/default, unchanged).
4. **Orders** — link to Orders tab + recent list (OrderHistorySection).
5. **Bookings** — Pre-Order ▸, Reservations ▸ (existing pages).
6. **Settings** — dark-mode toggle (`useTheme`, relocated from old header); push notifications toggle (`usePushNotifications`: hidden when `!supported`, existing subscribe/unsubscribe). Language switcher removed (v2.2 — English-only).
7. **More** — Hours, Contact, About, Privacy, footer legal links, WhatsApp/Viber (rehomed old header/footer/More-sheet destinations).
8. **Log out** (existing logic; confirm dialog).

Rows: 56px min height, icon + label + chevron/toggle, hairline separators.

## 22. Search

Full-screen overlay from the Menu header (not a route; hardware-back closes it). Auto-focused input with clear [×] and Cancel. *(v2.1)* The overlay is full-screen and sets `hideNav`, so it covers the bottom nav by construction — **no on-screen-keyboard detection is needed or attempted** (visual-viewport heuristics are unreliable on iOS).

- **Idle state:** popular items (existing bestseller badge holders, first 6) and category shortcut chips. **Recent searches** only if a recents mechanism already exists — otherwise omitted (do not add new storage without approval; a session-only in-memory recents list is acceptable as pure presentation).
- **Results:** live client-side filtering via the existing `filteredItems` memo (name/description, existing matching rules — no new search API); grouped "Items" (standard ProductCards — identical add/sheet behaviour) and "Categories" (chips that close search and scroll the rail).
- **Empty:** "No results for '{q}'" + Clear + popular items. Sold-out matches render in their §15 sold-out state, never hidden.
- **Keyboard/a11y:** Enter keeps focus in results list; arrow keys traverse results; overlay is a focus-trapped `role="dialog"` with `aria-label="Search menu"`; results count announced via `aria-live="polite"`.

## 23. Notifications

All channels exist today — this section only assigns presentation.

- **Push (existing `usePushNotifications` + `sw.js` + `/push/*`):** opt-in toggle lives in Account → Settings; never an auto-prompt on first load. Order-ready / status pushes deep-link to `/orders/:id` (existing sw click handling; verify the URL after the shell swap).
- **Announcement banner (existing, server-driven):** top of AppShell, dismissible per session; single line + optional link; `role="status"`.
- **In-app toasts (existing ToastContext):** bottom-anchored above the floating cart bar (stack-aware offset), 3.5s auto-dismiss, max 2 stacked; used for add-to-cart, cart pruning, promo applied, errors.
- **Order-ready surfaces:** push (if opted in) + active-order capsule state change + tracking timeline update — all driven by existing polling/status data.
- **Promotion notifications:** only via the existing announcement/push mechanisms — no new campaign engine.
- **Prayer reminder:** the PrayerBar countdown and existing prayer-pause ordering status are the in-app reminders. **No new scheduled prayer push notifications** (backend has none; do not invent).

## 24. Animation Specification

Tokens from §8.5. Every entry below is disabled or reduced to ≤1ms under `prefers-reduced-motion` (§26); autoplaying carousels stop entirely.

| Surface | Animation |
|---|---|
| Tab switch (bottom nav) | content cross-fade 150ms; no slide (tabs are peers); nav icon dot scales in 120ms |
| Sheet open/close | translate-Y up 280ms `--ease-out` + backdrop fade to 40%; close 200ms; drag-handle follows finger, release past 30% dismisses |
| Search overlay | fade+scale from 0.98, 200ms; input focused after transition ends |
| Accordion (checkout) | height auto-animate 200ms; chevron rotates 180° |
| Floating cart bar | slide-up+fade 200ms on first item; count change = scale pulse 1→1.15→1 (120ms); total text cross-fades |
| Add to cart | card [+] press scale 0.96; thumbnail "fly" to the cart bar 300ms arc, then bar pulse |
| Order-mode toggle | selected pill slides 120ms; grid cross-fades 200ms on channel refetch |
| Scroll-spy rail | active accent bar slides between items 200ms; rail auto-scroll smooth |
| Skeletons | existing shimmer, 1.2s linear loop |
| Order timeline | current step ring pulses 2s ease-in-out loop; completed steps check-draw 300ms once |
| Payment success | check-draw 300ms + single subtle scale settle (no confetti) |
| PrayerBar expand | height 200ms `--ease-out` |
| Page headers | hairline shadow fades in after 8px scroll |

Implementation: CSS transitions/keyframes only (no animation library); JS only to toggle classes; all transforms GPU-friendly (`transform`/`opacity` only — never animate layout properties).

## 25. Responsive Rules

Single source of truth: the app column (`--shell-max: 640px`) centred at all sizes; bottom nav always present in the shell.

| Width | Rules |
|---|---|
| **320px** | Rail icon-only (64px); stat chips horizontal-scroll; mode cards stack; 2-col grid holds (min card ~124px); font scale unchanged; no horizontal page scroll (hard requirement) |
| **360px** | Rail with labels (90px); everything else as designed |
| **390px** | Reference design width (wireframes) |
| **430px** | Same layout, larger imagery; grid gap 20px |
| **Tablet portrait (768px)** | Column capped 640px, centred, subtle `--color-surface-alt` side fill; Menu may widen to 760px so the grid becomes 3-col (CSS `minmax` only, no JS) |
| **Desktop (≥1024px)** | Same centred app column (decision: app-like on desktop; deletes all dual-layout JS branches); checkout order summary docks beside the accordions ≥900px via CSS grid |
| **Landscape phone** | Sticky headers shrink (menu header collapses address row into the toggle row); sheets become full-screen; bottom nav persists |

Rules: media/container queries in CSS only — no new `isMobile` JS branches (the existing ones in CheckoutPage/MenuPage are removed during migration); images always in `aspect-ratio` boxes; text containers tolerate 200% font scaling with wrapping, not clipping (§26).

## 26. Accessibility

- **Touch targets:** ≥44×44px everywhere (`--touch-target`) — nav tabs, steppers, [+], rail items, accordion "Change", toggle segments.
- **Screen reader:** semantic landmarks (`nav`, `main`, `header`); one h1 per screen; sheets/overlays = `role="dialog" aria-modal` with focus trap (lifted from ItemModal) and focus restore; cart count & totals `aria-live="polite"`; sold-out conveyed in the accessible name ("Chicken Grill, sold out"), not colour alone; prices read as "95 rufiyaa" via visually-hidden text where truncated; toggle = `role="radiogroup"`; rail = `tablist` with arrow keys; toasts `role="status"`.
- **Keyboard:** full traversal — nav, rail, grid, sheet controls, accordions; visible focus ring (existing token) on every interactive element; Escape closes topmost layer; no positive `tabindex`.
- **Reduced motion:** global `@media (prefers-reduced-motion: reduce)` kill-switch (§24); carousel autoplay off; smooth scroll → instant.
- **Contrast:** all text pairs ≥4.5:1 (large ≥3:1); verify amber-on-white CTA text (white on `#D4813A` is ~3.2:1 — CTA labels must be ≥18.66px bold, or use `--color-primary-hover` `#B86820` for small-text-on-amber; audit in Phase 1 and encode the rule in the button styles); sold-out pill AA on its dim background; dark theme re-audited separately.
- **Other:** meaning never by colour alone (icons/labels accompany status pills); inputs have visible labels (no placeholder-only); errors are text + icon, associated via `aria-describedby`; language switch updates `lang` attribute (Thaana `dir` handling as today); 200% text zoom doesn't break layout.

## 27. Folder Structure

```
apps/online-order-web/src/
├── components/
│   ├── shell/            AppShell.tsx · BottomNav.tsx · FloatingCartBar.tsx
│   │                     PageHeader.tsx · ActiveOrderCapsule.tsx
│   ├── ui/               (existing) Badge · Button · Card · Input · Modal · SectionHeader
│   │                     (new) Sheet.tsx · StickyCtaBar.tsx · Accordion.tsx
│   │                     Skeleton.tsx · EmptyState.tsx · ErrorState.tsx
│   ├── menu/             CategoryRail.tsx · MenuSectionHeader.tsx · ProductCard.tsx
│   │                     FilterChipsRow.tsx
│   ├── home/             GreetingHeader.tsx · StatChipsRow.tsx · PromoCarousel.tsx
│   │                     ModeEntryCards.tsx · SpecialsCarousel.tsx · ReorderStrip.tsx
│   │                     BrandFooter.tsx
│   ├── OrderModeToggle.tsx · ItemSheet.tsx · CartSheet.tsx · CartLineItem.tsx
│   ├── SearchOverlay.tsx
│   ├── PrayerBar.tsx     (kept intact) · AuthBlock.tsx (restyled) · BrandedHeader.tsx
│   └── CartDrawer.tsx / CartSummary.tsx (logic reused by CartSheet; drawer chrome retired)
├── context/              (existing 5) + OrderModeContext.tsx
├── hooks/                (existing) + useTheme.ts
├── pages/                existing pages + RewardsPage.tsx
├── api/ · utils/ · styles (index.css tokens)
Deleted at cleanup only (§30 phase 7): MenuCard.tsx · ItemModal.tsx · HeroCarousel.tsx
                                        + dead CSS (order-mob-*, cat-sheet-*, footer classes)
```

## 28. Component Hierarchy

```
main.tsx providers: SiteSettings > Language > Auth > Toast > Cart > OrderMode > Router

AppShell
├── AnnouncementBanner
├── <Outlet/>
│   ├── HomePage → GreetingHeader(OpeningStatusBadge) → PrayerBar → StatChipsRow
│   │              → PromoCarousel → ModeEntryCards → SpecialsCarousel
│   │              → ReorderStrip → CorporateBlock → BrandFooter
│   ├── MenuPage → StickyMenuHeader(OrderModeToggle · SearchButton · AddressRow · StatusStrip)
│   │             → FilterChipsRow
│   │             → CategoryRail ⟷ scroll-spy ⟷ [MenuSectionHeader + ProductCard grid]×N
│   │             ⤷ SearchOverlay · ItemSheet(Sheet+StickyCtaBar) · CartSheet(Sheet+CartLineItem×n+StickyCtaBar)
│   ├── OrderHistoryPage → PageHeader → ActiveOrderCard×n → PastOrderCard×n
│   ├── RewardsPage → PageHeader → PointsHero → ReferralCard → SpecialsGrid
│   ├── AccountPage → PageHeader → (AuthBlock | Profile → PrayerBar → Addresses
│   │                → Orders → Bookings → Settings → More → Logout)
│   └── static pages → PageHeader → content
├── ActiveOrderCapsule
├── FloatingCartBar
├── BottomNav
└── #prayer-strip-root (portal target)

Standalone (no AppShell chrome): CheckoutPage → BrandedHeader → Accordion×6(+AuthBlock)
                                 → CartSummary → StickyCtaBar
                                 OrderStatusPage → BrandedHeader → Timeline → Map → Actions
```

Data flow rule: pages own data fetching (existing hooks/effects); `menu/`, `home/`, `ui/`, `shell/` components are presentational (props in, callbacks out) — API logic never moves into them.

## 29. Performance

Budgets (mid-range Android, Fast-3G, Lighthouse mobile): Menu interactive < 3.5s cold / < 1.5s warm; CLS < 0.1 on every screen; tab switches & category jumps < 100ms; JS added by the redesign ≤ +30KB gzip (no new runtime libraries — CSS-only animation, native IntersectionObserver/Share APIs).

- **Lazy loading:** all routes stay `React.lazy` (add Rewards the same way); every product/banner image `loading="lazy"` + `decoding="async"`; promo images never block menu paint.
- **Image optimisation:** fixed `aspect-ratio` boxes (CLS); `srcset/sizes` where the backend already serves sizes (do not add a new image pipeline); cream placeholder fill.
- **Rendering:** sections use `content-visibility: auto` + `contain-intrinsic-size`; scroll-spy = one IntersectionObserver (no scroll listeners); PrayerBar tick re-renders only its text node; memoised ProductCard.
- **Caching:** existing menu fetch/cache behaviour and localStorage keys untouched; mode toggle refetch reuses the existing in-flight pattern; sw.js precache list updated + cache-name bumped with each shell-changing phase (§30) so PWA users get the new UI on next load.
- **Prefetching:** on Home idle (`requestIdleCallback`), prefetch the Menu route chunk (likely next hop); hovering/focusing rail items does nothing extra (data is already loaded — single `fetchItems`).
- **No accidental work:** rail taps and filter toggles are pure client state (no API calls); mode toggle is the only interaction allowed to refetch.

## 30. Migration Strategy (v1 implementation phases, preserved & extended)

Direct redesign on branch `claude/zus-coffee-app-redesign-f79hfx` (no feature flag; rationale in Context). Extract-then-swap per phase; every commit builds (`tsc && vite build`) and leaves the app fully usable. `main` stays the working UI until merge; rollback = revert/redeploy. *(v2.1 / v2.2)* **Every new user-facing string goes through `t()`** (English copy in `LanguageContext`; structure retained for a future language) — BottomNav labels, empty/error states, Rewards, toasts, all of it; untranslated hardcoded strings fail review.

### Phase 1 — Foundation (ships green, old UI unaffected)
`src/index.css`: add §8 tokens + new classes (`.app-shell`, `.bottom-nav`, `.float-cart-bar`, `.cat-rail`, `.stat-chip`, `.sheet`, `.section-accent`); **do not delete old classes** (`order-mob-*`, `cat-sheet-*`, footer) until Phase 7. New `OrderModeContext` (init from `getSalesChannel()`; `setMode` → `setSalesChannel`; listens to `sales_channel_change`), provider in `main.tsx`. `useCheckout.ts`: swap line-207 state for `useOrderMode()` — hook return shape unchanged ⇒ CheckoutPage needs zero changes; keep fetch/prune effect, drop only the duplicate `setSalesChannel` call (~line 265); `deliveryBlocked` guard now updates shared mode (desired). Primitives: Sheet, StickyCtaBar, Accordion, PageHeader, Skeleton, EmptyState, ErrorState; `useTheme` extracted. Amber-contrast audit (§26).

### Phase 2 — App shell
Rewrite Layout.tsx → AppShell + BottomNav + FloatingCartBar + ActiveOrderCapsule + `#prayer-strip-root`; delete global header/footer; add `/rewards` (lazy, minimal); old page bodies render inside the new shell (self-contained ⇒ still work, just chromeless). **Bump sw.js cache in this commit.**

*(v2.1 — hard gates for this phase, since the header/footer carry live functionality):*
- **Temporary Account links block** (minimum set): Pre-Order, Reservations, Hours, Contact, About, Privacy, legal/footer links, Order history. No orphaned route at any commit.
- **Dark-mode toggle moves to Account in this phase** (not Phase 6) — the header that hosts it is deleted here. *(v2.2: language switcher removed entirely.)*
- **PrayerBar mounts on Home** (below greeting, basic placement) in the same commit that removes the header instance (§12.3).
- **`AnalyticsTracker` stays mounted** in AppShell (route-change tracking must not silently die with Layout).
- **Retarget manifest "My Orders" shortcut** to `/order/order-history`; set a document title for `/rewards` via the existing per-page title mechanism.

### Phase 3 — Menu (largest; 3–4 commits: extract → extract → swap)
Extract ProductCard / ItemSheet (modifier state moves in; edit props) / CartSheet / CategoryRail / MenuSectionHeader while old layout still renders. Add `CartContext.updateEntry` + unit tests (preselect, variant switch, merge-with-identical-line). Then swap the MenuPage body: sticky mode header, sectioned render + scroll-spy (§14.3), deep links (`?category=`, `?item=`, `?openCart=1`) preserved, filters → flat grid mode.

### Phase 4 — Home
GreetingHeader, **PrayerBar full banner below greeting**, StatChipsRow, PromoCarousel, ModeEntryCards, SpecialsCarousel, ReorderStrip, BrandFooter — all existing data effects kept.

### Phase 5 — Checkout + Auth (highest regression risk after Menu; restyle only)
Accordion conversion reusing existing section consts wholesale; single column + StickyCtaBar; desktop summary via CSS ≥900px (delete `isMobile` branch); restyle the local `S` styles incrementally, **never in the same commit as structural changes**. AuthBlock restyle (+960 display prefix; submission unchanged). Verify after: gate-closed, delivery-zone/island check, pickup slots, promo/loyalty/gift/referral, terms checkbox, zero-balance path, full BML pay flow.

### Phase 6 — Orders, Rewards, Account
Orders tab restyle; OrderStatus timeline restyle (routes/polling untouched); RewardsPage real content (§20); Account full assembly (§21) including Settings + More groups (permanent rehoming of old header/footer/More links).

### Phase 7 — Long tail + cleanup
PreOrder/Reservations/About/Contact/Hours/Privacy wrapped in PageHeader; delete dead CSS + MenuCard.tsx/HeroCarousel.tsx/ItemModal.tsx once unreferenced; final sw.js bump; docs/screenshots refresh; full §31 QA pass + §26 audit + Lighthouse run.

## 31. QA Checklist (screen-by-screen; run per phase and fully before merge)

**Global (every screen):** builds (`tsc && vite build`); vitest green (`App.test.tsx`, `checkoutTotals.test.ts`, new OrderModeContext / updateEntry / scroll-spy-reducer tests — plus Layout/AppShell smoke updates budgeted in Phase 2); 320/360/390/430/768/desktop widths — no horizontal scroll; dark mode; English UI via `t()` (v2.2); reduced-motion; keyboard-only pass; screen-reader smoke (VoiceOver/TalkBack); content never hidden behind nav/cart bar; safe-area on notched iPhone (installed PWA); `AnalyticsTracker` route events still fire after the shell swap.

- **Home:** all sections render per §11 order; prayer banner below greeting, expandable, offline-cached; stat chips reflect real data & degrade; carousel autoplay/pause/reduced-motion; mode cards set mode then land on Menu; reorder works; corporate form submits.
- **Menu:** mode toggle switches channel, refetches, prunes with toast; disabled-delivery state; address row per mode/auth; rail syncs both directions (tap-scroll & scroll-spy) incl. rapid taps; deep links `?category=` `?item=` `?openCart=1`; filters/search → flat grid + dimmed rail + clear; sold-out per §15; quick-add only on no-mandatory items; skeletons; error retry; empty channel state.
- **Item sheet:** required min/max enforced (CTA gating, first-unmet scroll); price updates; notes/qty; edit-mode preselects & updates in place; identical-line merge; sold-out read-only; back/swipe/Escape close.
- **Cart:** bar appears/hides at 0-crossing; count/total live; sheet edit/remove/qty; upsell, free-delivery progress, points preview intact; empty state; checkout handoff.
- **Checkout:** each accordion opens/collapses with true summary; errors force-open; pickup slots, delivery zone/island errors, gate-closed banner; promo/loyalty/gift/referral apply & reflect in totals; totals match server preview at all times; terms gating; pay bar states; success → tracking; failure/cancel → retry with cart intact; guest checkout; login-from-checkout round-trip.
- **Auth:** phone → password / OTP branches; resend timer; profile setup; forgot/reset; +960 display doesn't alter submitted phone; error states.
- **Orders/tracking:** active pinned; history paginates as today; reorder revalidation; timeline mirrors backend statuses incl. cancelled/refund states; polling continues in background tab; `/track/:token` logged-out; driver map on delivery orders.
- **Rewards:** points/tier/referral against real account; copy/share fallbacks; signed-out teaser; specials grid; no invented UI.
- **Account:** profile edit; addresses CRUD + default; theme toggle persists; push toggle (supported/unsupported paths); all More links reachable; logout confirm.
- **PWA:** install both platforms; new UI after sw bump without manual cache clear; offline → offline.html; push deep-links land correctly; shortcuts work.
- **Perf:** Lighthouse mobile on Home/Menu/Checkout — CLS < 0.1, budgets per §29.

## 32. Acceptance Criteria

**Per phase (measurable):**

| Phase | Done when |
|---|---|
| 1 | Build + tests green; tokens/primitives in; order-mode context live with checkout behaviour unchanged (manual checkout smoke passes); contrast audit documented |
| 2 | 5-tab nav + floating cart on all shell routes; every pre-existing destination reachable (temporary Account links ok); sw bumped; no dead route |
| 3 | Menu = rail + sections + scroll-spy at all widths; all 3 deep-link params work; cart edit-in-place with passing unit tests; old MenuPage layout fully replaced |
| 4 | Home matches §11 order with prayer banner full-width below greeting; all v1 Home features still present |
| 5 | Checkout = accordions + sticky pay bar; §31 checkout list passes incl. a real end-to-end pickup **and** delivery order on staging; totals byte-identical to pre-redesign for identical carts |
| 6 | Orders/Rewards/Account complete; zero orphaned links from old header/footer/More |
| 7 | Dead code removed (grep-clean for `order-mob-`, `cat-sheet-`, MenuCard/ItemModal/HeroCarousel imports); full §31 pass; Lighthouse budgets met |

**Project-level (from v1, kept verbatim + v2 additions):** every current customer-ordering feature remains accessible; backend contracts unchanged; menu reachable in one tap from Home; pickup/delivery mode always visible on Menu; selected address/location visible; category switching without leaving the page; cart visible whenever non-empty; checkout totals match the current app; OTP, payment and order placement work exactly as before; active and past orders available; works from 320px up; no POS/KDS regressions; **the Prayer Time banner is prominent on Home below the greeting**; the app visibly reflects Bake & Grill, not a ZUS copy.

## Key risks (from v1, carried forward)

- MenuPage (917 lines) rewrite → extract-then-swap sequencing (Phase 3).
- CheckoutPage (1,109 lines, inline `S` styles, mobile/desktop branch) → reuse section consts wholesale; incremental style migration, structure and styling never in the same commit.
- Whole-menu render perf → `content-visibility` + lazy images; fallback ±2-section windowing.
- PWA staleness → sw.js cache bumps with every shell-changing phase.
- Amber small-text contrast → audited and encoded in button styles in Phase 1.

## Deliverable

All work committed and pushed to `claude/zus-coffee-app-redesign-f79hfx` in phase-sized commits, with this document kept up to date as the Master UI/UX Design and Implementation Specification.

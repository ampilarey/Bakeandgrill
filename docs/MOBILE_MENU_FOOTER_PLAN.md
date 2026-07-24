# Mobile UX + Menu Redesign + Website Footer — Implementation Plan

**Status:** Ready to build
**Goal:** Three connected improvements across the **online-order-web** app and the **main website
(Blade)**:
1. **Menu redesign** — fix the "messy / picture in a corner" cards; make them clean and consistent.
2. **Main website footer** — add the missing pieces (hours, social, Order CTA, trust, dynamic year).
3. **Mobile UX pass** — sticky action bars, safe-area insets, bigger tap targets, sticky category nav.

Section 1 is the **verified audit**. Sections 2–4 are the **build** (one per goal). Section 5 is
testing; Section 6 is deploy.

---

## 1. Verified audit

### 1.1 Order-app menu (online-order-web)
- Cards: `apps/online-order-web/src/components/menu/ProductCard.tsx` — vertical card, image on top via
  `MenuImageSlider`, then content (`padding: 0.875rem 1rem 1rem`, flex column).
- Image: `components/menu/MenuImageSlider.tsx` — `aspectRatio` default `4 / 3`,
  `object-fit: cover`, width/height 100%; **placeholder is an emoji (`🍽️`)** when no slides — this is
  the "pic in a corner" look (a small glyph in a large box, and low-res thumbs don't fill the frame).
- Grid: `src/index.css` `.menu-grid` → mobile `repeat(2, 1fr)`, larger screens
  `repeat(auto-fill, minmax(190px→220px, 1fr))`. Cards are **not equal height** (variable name/desc
  length), so the grid looks ragged.
- Favourite button is **30px** (below the 44px touch target).

### 1.2 Main website footer (Blade)
- `resources/views/layout.blade.php` `<footer class="site-footer">` (~line 1154). Already has: brand +
  blurb, WhatsApp/Viber, Quick Links (Home, Order Online, Catering, Hours, Contact), Location +
  directions, Contact (phone, email), Privacy/Terms/Refund, and a `footer-bottom`.
- **Missing:** opening hours block, social icons (Instagram/Facebook/TikTok), a real Order-Now button,
  a trust/payment strip, and a dynamic copyright year. Content is driven by `content('…')` keys — new
  bits should be editable the same way (Content Studio).
- Mobile bottom nav exists (`.mobile-bottom-nav`, `.mob-nav-*`).

### 1.3 Order-app footer (reference — already good)
- `components/home/BrandFooter.tsx`: thanks message, link to main site, WhatsApp, Viber, Privacy,
  Terms, Refund. Clean and friendly — mirror this tone on the website footer.

---

## 2. Menu redesign (order app)

**Goal:** a clean, uncluttered ZUS-style menu — compact 2-column cards, tap-to-detail, and no page
chrome getting in the way. Grounded in the live screenshots (test.bakeandgrill.mv).

### 2.0 Declutter the menu page (MenuPage.tsx)
- **Remove the page heading** "Our Complete Menu" + subtitle "Browse and add items to your cart"
  (the `<h1>` + subtitle block near the top). Go straight to the filters/menu.
- **Remove the "Online ordering is open · Pickup only · Delivery from…" status banner**
  (`.ordering-status-bar`, MenuPage ~line 595). Replace its role with:
  - **Pickup/Delivery toggle:** if pickup is off, tapping **Pickup** shows a **toast/popup** ("Pickup is
    currently unavailable") instead of switching; same for **Delivery** when delivery is off. (Reuse the
    existing service-availability signals: `isServiceAvailable('online_pickup'/'online_delivery')`,
    `deliveryAvailable`, `gateMessage`.)
  - **Browsing + add-to-cart stay enabled even when online ordering is off** — customers can build a
    cart. Only at the **cart/checkout** does it gate: when all online ordering is off, the cart's
    **"Proceed" button is replaced by a disabled "Online ordering is off"** state (message from the
    service entry), matching `ServiceBanner`/`CheckoutPage` copy. Do not block adding to cart.

### 2.1 ZUS-style compact card (ProductCard.tsx)
Replace the tall, crowded card with a compact one — **circular image + 3 lines** (name / short detail /
price), **no inline quantity stepper or add button**. Tapping the card opens the **existing item
detail** (variants, packaging, quantity, Add to cart).
- **Circular media:** render the primary image inside a **circle** (fixed size, e.g. ~120–140px,
  `border-radius:50%`, `object-fit:cover`) centered on a soft brand-tinted background — even when the
  uploaded asset is rectangular or a video (crop to the circle; surrounding card area is a faded tint,
  like the ZUS reference). **Auto-rotate** through multiple photos/videos (reuse `MenuImageSlider`'s
  auto-slide; keep `posterOnly` for videos in the grid). Branded fill placeholder (logo/monogram in the
  circle) when there's no media.
- **Three info lines under the image, centered:** ① **name** (clamp 1–2 lines), ② **short description**
  clamped to **1 line** (the "little detail"), ③ **price** (with strikethrough original when on sale).
- **Keep (small, non-crowding):** the **favourite heart** (top corner), a **single** sale/spice
  **badge** on the image, and **unavailable dimming** + "Unavailable" label. Move diet tags, prep time,
  and the qty stepper/add button **into the detail view only**.
- **Equal-height, airy cards:** consistent circle size + line clamps → even 2-column grid; generous
  padding; price line pinned to the bottom.
- Tapping anywhere on the card (not the heart) → `onSelectItem` opens the detail modal.

> Net effect: the grid reads like the ZUS screenshot — a circular picture and three tidy lines — and the
> "add to cart" action lives in the detail sheet where variants/packaging are chosen, so nothing is
> cut off or crowded.

### 2.2 Layout & navigation
- **Category navigation — KEEP the existing ZUS-style left rail (do NOT switch to horizontal chips):**
  - The order app **already has** `components/menu/CategoryRail.tsx` (`.cat-rail`) — a sticky vertical
    left column with icon + label, active item highlighted (`is-active`), scroll-spy synced. This is
    exactly the ZUS Coffee layout the owner wants. **Preserve it.**
  - **Bug to fix (mobile):** on mobile the CSS hides the labels (`index.css` ~2421-2422:
    `.cat-rail { width: 64px } .cat-rail__item { font-size: 0 }`) — icon only. ZUS shows **icon +
    short label**. Widen the mobile rail a little and show the category label under/next to each icon
    (truncate long names) so it reads like the ZUS reference, keeping the active highlight and
    scroll-spy. Keep the right-side 2-column item grid.
  - Do NOT remove the rail or replace it with chips.
- **Optional compact list view toggle:** a grid/list switch — list = left square thumbnail + name /
  price / one-line desc on the right (great for fast scanning; store the preference locally).
- Keep existing badges (sale/spice/combo) inside image bounds; cap at two visible.

> This directly fixes "the menu is a mess / pic is in a corner": images fill the frame, empty items get
> a designed placeholder, and cards line up in an even grid.

---

## 3. Main website footer (Blade)

Extend `<footer class="site-footer">` in `layout.blade.php` (keep the current columns), all new text
driven by `content('…')` keys so it's editable in Content Studio:

- **Opening hours** column: list the week with **today highlighted**; show a Ramadan-hours note when the
  Ramadan preset is active (the data already exists in settings). Reuse `/hours` data.
- **Social row:** Instagram, Facebook, TikTok icons (+ existing WhatsApp/Viber). New content keys
  `social_instagram`, `social_facebook`, `social_tiktok` (hide an icon if its key is empty).
- **Order Now button:** a prominent amber button (not a text link) using `$navOrderCta` → `/order/menu`.
- **Trust strip** above `footer-bottom`: accepted payments (BML / cards / MVR) + "Delivery across
  Malé & Hulhumalé" (content-driven), small muted icons/text.
- **Dynamic year:** `footer-bottom` → `© {{ date('Y') }} {{ $siteName }}. {{ $footerRightsSuffix }}`.
- Mirror the order-app footer's warm one-liner (`content('footer_thanks', …)`).
- Responsive: the footer grid already collapses to 1 column on mobile (`index.css:977`); ensure the new
  blocks stack cleanly and are centered on mobile.

---

## 3B. Main website mobile — bottom nav + de-duplicate WhatsApp/Viber

Two concrete fixes on the **main website (Blade)** the owner called out from the live mobile view:

### 3B.1 Redesign the fixed bottom nav (currently Home / Menu / Order / More)
- `layout.blade.php` `<nav class="mobile-bottom-nav">` (~line 1227) is **Home · Menu · Order · More**.
  "More" is a catch-all sheet and the set feels thin. Replace with a cleaner 5-tab bar modelled on the
  ZUS reference and the order-app footer's tone.
- **Confirmed set:** **Home · Menu · Order (center CTA) · Offers · Account**
  - `Order` as a raised/filled amber center button — the primary action.
  - `Offers` → the specials/promotions page; `Account` → order-app account (or login).
  - Drop the generic "More"; move any leftover links into the footer.
- Keep it icon + label, ≥44px targets, active state highlighted, safe-area padding at the bottom.

### 3B.2 De-duplicate WhatsApp / Viber (currently shown 3×)
On the home page these render **three times** as you scroll:
1. `home.blade.php` ~1325 — chat block in the location/contact section (WhatsApp + Viber),
2. `home.blade.php` ~1383 — a second chat block (Viber/WhatsApp),
3. `layout.blade.php` footer ~1163 — WhatsApp + Viber.
- **Fix:** keep **one** primary contact placement — the **footer social row** (§3, alongside
  Instagram/Facebook/TikTok) — and **one** optional single floating WhatsApp button. Remove the
  duplicate home-page chat blocks (or collapse the two home blocks into a single "Chat with us" row).
  Result: WhatsApp/Viber appear once in-page + once in the footer, not three times.

---

## 4. Mobile UX pass (both apps)

- **Sticky bottom bars** (thumb-reachable, respect safe area):
  - Order app: a floating **logo cart FAB** (count badge + total, opens `CartSheet` on tap) **already
    exists** — `components/shell/FloatingCartBar.tsx` + `CartSheet.tsx` + `useShellNav`. **Do NOT add a
    new cart bar.** Only enhance the existing one: ensure it clears the safe-area inset (not cut off on
    iPhones), meets the ≥44px tap target, and doesn't overlap the last menu card / footer. Leave its
    logo-FAB → expand-sheet behaviour as-is.
  - Main website: a sticky **Order / Call / WhatsApp** bar (the `.mobile-bottom-nav` exists — polish it,
    ensure it doesn't overlap the footer, and add safe-area padding).
- **Safe-area insets:** add `padding-bottom: env(safe-area-inset-bottom)` (and top where relevant) to
  fixed bars/headers in both `online-order-web/src/index.css` and the Blade `<style>`, plus
  `viewport-fit=cover` in the meta viewport.
- **Tap targets ≥44px:** bump the favourite button (currently 30px), category chips, and small footer
  links.
- **Sticky category nav** on the menu (shared with §2).
- **Image performance:** aspect-ratio boxes everywhere (no layout shift), `loading="lazy"` +
  `decoding="async"` on menu/gallery images, correct thumb sizes.
- **Header on scroll:** shrink the header (logo/nav) after a small scroll to give content room on small
  screens.
- **Type & spacing:** consistent mobile type scale and card spacing; line-clamp long text.
- Keep `prefers-reduced-motion` handling intact.

---

## 5. Testing
- **Order app (Vitest):**
  - `ProductCard`: renders the branded placeholder (not the emoji) when an item has no photo; name is
    clamped; price row present; favourite button meets the min-size style.
  - `MenuImageSlider`: with no slides renders the fill placeholder; with an image renders an `<img>`
    that fills (width/height 100%, object-fit cover) and is lazy-loaded.
  - Sticky category chips render and reflect the active category.
  - Existing `FloatingCartBar` still shows total when the cart is non-empty and is hidden when empty
    (regression check only — behaviour unchanged, just safe-area/tap-size styling).
- **Main website:** a lightweight Blade render/HTTP test asserting the footer contains the hours block,
  social links (when keys set), Order-Now button, and the dynamic year; and that empty social keys hide
  their icons.
- **Manual/mobile:** verify on a narrow viewport (≤390px) that cards are even, the menu image fills, the
  bottom bar respects the safe area, and nothing overlaps the footer.

Run order app from repo **root** (`npm ci`) then `cd apps/online-order-web && npm test -- --run &&
npm run build`. Backend Blade tests: `cd backend && php artisan test`.

---

## 6. Deploy / rollback
- Order app: rebuild + sync `apps/online-order-web/dist → backend/public/order`; bump the order-app SW
  `CACHE_VERSION` (clients must load the new JS/CSS).
- Main website: Blade changes are server-rendered — `php artisan view:clear` / `config:cache` on deploy;
  new `content('…')` keys fall back to sensible defaults so nothing breaks before they're filled in.
- Purely presentational + additive content keys — no schema, no API changes. Rollback = revert the
  release.

---

## Appendix — new Content Studio keys (all with defaults)
`social_instagram`, `social_facebook`, `social_tiktok`, `footer_hours_heading`, `footer_payments_text`,
`footer_delivery_text`, `footer_thanks`. Empty social keys hide their icon; everything else defaults to
current copy so the footer is unchanged until edited.

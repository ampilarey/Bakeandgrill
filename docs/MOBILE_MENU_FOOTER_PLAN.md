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

**Goal:** every card looks intentional and identical in shape; the image always fills its frame.

- **Image fills the frame (`MenuImageSlider` / `ProductCard`):**
  - Fixed aspect box (keep 4:3, or switch to 1:1 for a tighter 2-col mobile grid — pick one and apply
    consistently), `object-fit: cover`, full width/height.
  - **Branded fill placeholder** when an item has no photo: a soft brand-tint background filling the
    whole box with a centered small logo/monogram + item initial — **not** a floating emoji. Same
    dimensions as a real image so the grid stays even.
  - Prefer the **full `image_url`** on cards (lazy-loaded, `loading="lazy"`, `decoding="async"`); use
    the thumb only for the list view (§2, compact).
- **Equal-height, tidy cards (`ProductCard`):**
  - Clamp the **name to 2 lines** and **description to 1 line** (`-webkit-line-clamp`).
  - Pin the **price/CTA row to the bottom** (`margin-top: auto`) so every card is the same height.
  - Tighten padding; ensure the quick-add and favourite buttons are **≥44px** touch targets.
- **Navigation (`MenuPage` + `index.css`):**
  - **Sticky horizontal category chips** under the header (scrollable), active category highlighted,
    tapping scrolls to that section; keep section headers.
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

## 4. Mobile UX pass (both apps)

- **Sticky bottom bars** (thumb-reachable, respect safe area):
  - Order app: a persistent **cart bar** (item count + total + "View cart") when the cart is non-empty.
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
  - Cart bar shows total when the cart is non-empty; hidden when empty.
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

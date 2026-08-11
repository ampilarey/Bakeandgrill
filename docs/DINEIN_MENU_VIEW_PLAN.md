# Dine-In Digital Menu (view-only) — Implementation Plan

Status: **Built.** Order-app `MenuViewPage` at `/view` is registered and tested. Body is design history for the shipped dine-in view.

> Rescued from branch `claude/dinein-menu-view-plan` (not written fresh on this branch).

---

## 1. Audit — what already exists (reuse, don't rebuild)
- **Public menu API (no auth):** `/categories`, `/items`, `/items/{id}`, **`/specials`** (active daily
  specials) and **`/offers`** (unified specials + promotions) — `routes/domains/catalog.php`. All data
  needed is already public.
- **UI components:** ZUS `ProductCard` (already **voids add-to-cart** — tap opens detail), `CategoryRail`,
  `OfferCard`, section headers, circular media, `/-` pricing, EN/DV `LanguageContext`.
- **Routing:** the order app (`main.tsx`, `basename="/order"`) already has **standalone routes with no
  `AppShell`** (checkout, track, orders) — the pattern for a chrome-less page exists.
- **Item detail:** `ItemSheet` renders photo/variants/packaging/price + Add-to-cart (to be hidden in
  view mode).

## 2. Build

### 2.1 New standalone route + page
- Add route `view` (URL `/order/view`; optionally also a short alias `/menu` at the web layer) **outside
  `AppShell`** in `main.tsx`. New page `apps/online-order-web/src/pages/MenuViewPage.tsx`.
- **No** login, cart, bottom nav, pickup/delivery toggle, or service-availability gating — pure browse.
- Data: fetch categories + items + offers from the existing public endpoints (one load; cache-friendly).

### 2.2 Layout (mobile-first, attractive)
- **Header:** brand logo + name, a small "Dine-in menu" / "View only" label, and the EN/DV language
  toggle. Nothing transactional.
- **Body:** left `CategoryRail` (icon + label, scroll-spy) + right content, exactly like the order menu.
- **Sections order:** ① **Offers & Discounts** (from `/offers`, reusing `OfferCard`) → ② **New items**
  (see 2.3) → ③ each category with its items (reusing `ProductCard` in view mode + subcategory
  sub-headers).
- **Item tap → view-only detail:** reuse `ItemSheet` in a `viewOnly` mode that **hides** the qty stepper
  and Add-to-cart button; shows photo(s), description, variants + prices (`/-`), dietary/spice tags,
  packaging info as text. No ordering.
- Keep circular cards, `/-` price format, sale badges, sold-out/unavailable badges (view-only, just
  informative), and the default-item-image fallback.

### 2.3 "New items" (auto from created_at)
- Backend: ensure the public `/items` payload includes **`created_at`** (add if missing).
- Setting **`menu_new_days`** (int, default 30) in SiteSetting + public settings payload; small admin
  input (Settings → Website/Branding or Menu settings).
- Client: an item is **New** if `created_at` is within `menu_new_days`. Render a "New items" section
  (and optionally a small **NEW** badge on the card). Cap the section (e.g. latest 12).

### 2.4 Print + QR
- **Print stylesheet** (`@media print`) on the view page: clean, ink-friendly, multi-column list with
  item name + short detail + `/-` price grouped by category, brand header, page breaks between
  categories, hide the rail/toggles. A **"Print menu"** button triggers `window.print()`.
- **QR / share (admin):** a small "Dine-in menu" card in the admin (Settings → Website or the Menu page)
  showing the `/order/view` URL, a generated **QR code** (client-side qrcode lib or a QR image), a
  **Copy link** button, and **Open / Print** buttons. Optionally a short URL (`/m`) via a web redirect.

### 2.5 SEO/meta (nice-to-have)
- The page can carry a simple title/description ("Bake & Grill — Menu") so a scanned link previews well.

## 3. Testing
- **Order app (Vitest):** MenuViewPage renders categories/items/offers with no cart/login/nav; item tap
  opens the view-only detail with **no Add-to-cart**; a recently-created item appears in "New items"
  and an old one does not; language toggle works.
- **Backend:** `/items` includes `created_at`; `menu_new_days` is in public settings; the view page
  route (if a web alias/redirect is added) resolves.
- Print: manual check that `@media print` produces a clean menu.

## 4. Deploy / rollback
- Additive: new route + page + one setting + `created_at` exposure. No schema change beyond the setting
  (SiteSetting is key/value; `created_at` already exists on items — just expose it). Non-transactional,
  so no availability/gating concerns.
- Rebuild + sync `apps/online-order-web/dist → backend/public/order` (bump order SW `CACHE_VERSION`);
  rebuild admin if the QR card is added there. Rollback = revert.

> Out of scope: ordering from this page (intentional), and any pricing logic (view-only reuse of
> existing data). If you later want ordering, the app's normal `/order/menu` already does that.

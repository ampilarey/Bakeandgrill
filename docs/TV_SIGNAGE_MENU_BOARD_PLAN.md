# TV Signage / Digital Menu Board — Implementation Plan

**Status:** Ready to build
**Goal:** A public fullscreen page you open in a **TV browser** that **auto-plays a presentation** of
menu content — featured items (photos/videos), offers & discounts, new items, best-sellers — mixed with
**admin-added custom slides** (images/videos/promos). Runs unattended, **updates itself** from the live
menu, and supports **day-parting** (different playlists by time of day). No interaction, no login.

## 1. Audit — reuse, don't rebuild
- **Live public data:** `/categories`, `/items`, `/offers` (specials + promotions), `/specials`;
  **best-sellers** already have a signal (`isBestsellerItem` in the menu); **new** = `created_at`
  within `menu_new_days` (see the dine-in menu plan).
- **Custom slides mechanism exists:** `hero_slides` JSON (SiteSetting) + admin `HeroSlidesEditor`
  (image/video slides with titles) — mirror/extend this for the signage playlist.
- **Video autoplay works:** `MenuImageSlider` autoplays muted/looped/playsInline clips — item videos +
  custom video slides play on the TV.
- **Standalone route pattern exists** (order app `main.tsx`, non-`AppShell` routes) — for a chrome-less
  fullscreen page.

## 2. Build

### 2.1 Public signage page (order app)
- New standalone route `tv` (URL `/order/tv`, optionally per-screen `/order/tv/{screen}`) **outside
  AppShell**. Page `apps/online-order-web/src/pages/SignagePage.tsx`.
- **Fullscreen, landscape, non-interactive**: large type, high contrast, brand-styled, no nav/cart/login;
  hide cursor; `requestFullscreen` optionally; keep-awake best-effort (Wake Lock API where available).
- **Slide engine:** cycles the resolved playlist; each slide has a **duration**; smooth cross-fade/slide
  transitions; video slides play for their length (or the set duration); auto-advance; loops forever.
- **Auto-update (silent):** re-fetch menu/offers every N minutes and re-read the active playlist so
  price/special/new changes and admin edits appear **without touching the TV**; switch playlist when the
  **day-part** changes. Keep the last good data on network blips (offline-tolerant).
- **Resilience:** built to run for hours — clean up timers/video elements between slides (no leaks),
  cache-busting on deploy, graceful reconnect.

### 2.2 Slide types (menu-driven + custom)
Each slide in a playlist is one of:
- `offers` — a rotating showcase of current offers/discounts (from `/offers`, big % OFF).
- `new` — new items (created within `menu_new_days`).
- `bestsellers` — top sellers (from the bestseller signal; expose top-N publicly).
- `category` — a category showcase (grid/hero of that category's items).
- `featured_item` — one hero item with big photo/**video**, name, price, discount.
- `custom_image` / `custom_video` — an admin asset (Media Library / uploaded) shown full-bleed.
- `promo_text` — a styled text/announcement slide (headline + subtext + optional bg image).
Auto slides pull live data at render; custom slides come from the config.

### 2.3 Signage config + day-parting (backend)
- Store as SiteSetting JSON **`signage_config`** (mirror `hero_slides`), shape:
  ```
  { "default_slide_seconds": 8, "transition": "fade",
    "playlists": [
      { "id": "dinner", "name": "Dinner",
        "windows": [ {"start":"16:00","end":"23:59","days":[0,1,2,3,4,5,6]} ],
        "slides": [ {"type":"offers","seconds":10}, {"type":"featured_item","item_id":42,"seconds":8},
                    {"type":"custom_video","media_id":123,"seconds":15}, … ] } ,
      { "id":"default", "name":"All day", "windows":[], "slides":[…] } ]
  }
  ```
- **Resolution:** pick the first playlist whose window matches `now()`; else the `default` playlist. A
  public endpoint `GET /signage` returns the **resolved** playlist for the current time + the top-N
  bestsellers + `menu_new_days` (the page fetches menu/offers from the existing public endpoints).
- Admin endpoints (permission `website.manage` / a new `signage.manage`): `GET/PUT /admin/signage` to
  read/save the config; audit-logged.

### 2.4 Admin "TV Menu / Signage" page
- New admin page: manage **playlists** (add/rename/reorder), **day-part windows** (time + days),
  and each playlist's **ordered slides** (add auto-section slides or custom slides, set per-slide
  seconds, drag-reorder). Reuse `HeroSlidesEditor`/Media Library picker for custom image/video slides.
- **Live preview** (a scaled iframe of `/order/tv`), the **TV URL + QR code** + "Open on this screen"
  and copy-link, and a "which playlist is active now" indicator. Gate by permission.

### 2.5 Best-sellers exposure
- Add a public top-sellers source (endpoint or field) using the existing bestseller signal / a sales
  aggregate (last 30 days), returning top-N item ids for the `bestsellers` slide.

## 3. Testing
- **Order app (Vitest):** SignagePage renders the resolved playlist; advances slides on the timer;
  renders each slide type (offers/new/bestsellers/category/featured/custom image+video/promo); a video
  slide mounts an autoplaying muted `<video>`; no interactive chrome; silent refresh updates data.
- **Backend:** `signage_config` saves/loads; `/signage` resolves the correct playlist by time-of-day
  (day-parting) and falls back to default; top-sellers endpoint returns top-N; permission-gated admin
  save + audit.
- Manual: run `/order/tv` for a long session; confirm it keeps advancing, updates after an admin edit,
  and survives a brief network drop.

## 4. Deploy / rollback
Additive: new route/page + `signage_config` setting + admin page + a top-sellers endpoint. Non-
transactional. Defaults: a sensible `default` playlist so the TV shows something before customization.
Rebuild + sync `backend/public/order` (bump order SW `CACHE_VERSION`) + `backend/public/admin`;
`view:clear`. Rollback = revert.

> Shares the public data layer with the dine-in QR menu (`/order/view`); this one is the passive,
> fullscreen, auto-playing TV variant. Out of scope for v1: multi-screen distinct URLs (structure allows
> `/order/tv/{screen}` later), remote device management.

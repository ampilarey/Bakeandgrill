# Content & Branding Unification Plan

Status: **Built** (branding unified under Content / Brand Kit). Nav label is “Content & Branding”; branding blocks edit in the hub rather than a separate Settings island. Confirm any edge-case keys in the body before further moves.

> Rescued from branch `claude/content-branding-unification-plan` (not written fresh on this branch).

---

**Owner:** Bake & Grill admin platform
**Goal:** Collapse the five overlapping content/branding/media editing surfaces into **one "Content & Branding" hub** with a plain-language model, fix the scope-divergence bugs that make edits silently not apply, and route every write/upload through a single path. Storage model and the ~130 registry keys stay; we unify the doors on top of them.

---

## 1. Why

The owner reports content editing is *"very complicated and confusing,"* with *"many bugs, duplicate content."* A full audit confirms the cause: **one data store, five different admin doors**, and the doors do not behave the same.

### 1.1 Current data model (unchanged by this plan)

Everything lives in `site_settings` as `(key, scope, locale)` rows. `scope ∈ {shared, website, order_app}`. Readers resolve **app-scope → shared → registry default** via `App\Domains\Content\ContentResolver`. Registry: `backend/config/content.php` (~130 keys), typed through `App\Domains\Content\ContentRegistry`.

### 1.2 The five doors (the problem)

| Door | Route | Write path | Scope written |
|---|---|---|---|
| Website Content | `/content/website` | `ContentWriter` (revisions, sanitise, audit, draft cleanup) | `website` |
| Order App Content | `/content/order-app` | `ContentWriter` | `order_app` |
| "Branding" nav item | `/content/website?group=Branding` | **same page as Website Content, filtered** | `website` |
| Settings → Website tab | `PUT /api/site-settings` | `SiteSettingsController` — **direct `SiteSetting::set`, bypasses `ContentWriter`** | `shared` |
| Media Library "Use as" | `POST /api/admin/media/{id}/use-as` | direct `SiteSetting::set` | `shared` only (except `default_item_image`) |

Three upload backends exist: `SiteSettingsController::upload` (stores `site/`, no thumb/master, not cataloged), `ContentController::upload` (thumbs + masters), `MediaLibraryController` (full catalog + dedupe).

---

## 2. Confirmed bugs (must fix)

- **🔴 B1 — Branding changes silently don't apply (scope divergence).** `logo`, `logo_dark`, `favicon`, `og_image` are `shareable` keys targeting both apps, but **only `default_item_image`** is auto-synced across scopes (`ContentRegistry::isSyncedAcrossApps()` returns true only for it). Media Library "Use as → Logo" and the legacy Settings upload write **`shared` only**; if a `website`-scope row exists (Content Studio writes it), the resolver prefers it and the live site keeps the old asset. The success toast lies.
- **🔴 B2 — Logo differs between website and order app / KDS.** A logo set in Website Content lands in `website` scope only. `?app=order_app` resolves `order_app → shared → default` and never sees the `website` row, so order app / admin / KDS fall back to default. Same asset, three surfaces, different results.
- **🟠 B3 — Same key, two behaviours.** `default_item_image` and `menu_new_days` are editable in **both** Content Studio (Branding group) **and** Settings → Website. The Settings path bypasses `ContentWriter` → no revision history, no sanitisation, no audit-through-content, no draft cleanup.
- **🟠 B4 — Uploads scatter.** Assets uploaded via the legacy Settings endpoint get no thumbnail/master and never enter the Media Library catalog or dedupe.
- **🟡 B5 — Dead duplicate media browser.** `apps/admin-dashboard/src/pages/ContentStudio/MediaLibrary.tsx` + `getContentMedia()` + `GET /admin/content/media` are superseded by `MediaPicker` → `MediaLibraryPage`. Nothing imports the component anymore; endpoint still walks storage.
- **🟡 B6 — Confusing surface.** "Branding" looks like its own tool but is `/content/website?group=`. The `shared/website/order_app` scope model + Share/Split/Copy verbs + "resolved fallback" text is expert-level. Deprecated `hero_slide_1/2/3` still in the registry.
- **🔴 B7 — Collapsing to "Same" can delete a live image file (data loss).** `ContentController::share()` calls `MediaFileCleaner::deleteIfOwnedAndUnreferenced($row->value)` when it removes per-app override rows. That helper's `isReferenced()` only inspects the `items`, `item_photos`, and `categories` tables — it **never consults `site_settings` or `media_assets`**. So when an image block that differs per app is collapsed back to "Same", the app-scope file can be deleted from disk even though another content key, the other scope, or the Media Library still references it. Today this hides behind a rarely-used "Share" button; **this plan promotes that exact code path to a toggle owners will click constantly**, so it must be guarded before shipping. Fix in §4.5.

---

## 3. Target architecture — one Content & Branding hub

### 3.1 Principles

1. **One nav entry, one page.** Replace *Website Content + Order App Content + Branding + Settings→Website (content bits)* with a single **Content & Branding** hub.
2. **Website and order app stay independent — same content is opt-in.** Each block that targets both apps shows a **"Content: ◉ Same in both · ○ Different per app"** link/unlink control. **Same = `shared`** (edit once, both apps update); **Different** splits into independent `website` and `order_app` values edited side by side. Same→Different auto-splits (copy resolved value into each app scope); Different→Same collapses to `shared` and clears app overrides. The old Share/Split/Copy verbs disappear behind this one control.
3. **Per-section on/off, per app.** Each major section (Hero, Specials, Featured, etc.) has an **Enable/Disable** toggle that can be set independently for the website and the order app. This reuses the exact same link/unlink mechanism from principle 2, applied to a boolean block (see §3.3). On/off is **section-level only** — individual text fields never get their own switch (hiding a lone field breaks layouts).
4. **Branding always syncs everywhere.** `logo`, `logo_dark`, `favicon`, `og_image`, **`primary_color`** behave like `default_item_image` already does — every write mirrors to all scopes. Branding blocks have **no** link/unlink control (they are always Same).
5. **One write path.** Every content/branding mutation goes through `ContentWriter` → history + sanitise + audit + draft cleanup for all keys, always.
6. **One uploader, one picker.** Every upload goes through the Media Library backend (catalog + dedupe + thumbnails). Every "browse/pick" uses `MediaPicker` → Media Library.

### 3.2 Section model

The hub replaces the two-editor split with a single section navigator, driven by registry `group`, ordered:
`Branding · Homepage · Menu · Footer · Legal · SEO · Order App · Status banners · Pre-Order · Contact · Pages · About · General · Announcements`.

Each block card shows: label, description, the value editor (existing per-type editors reused verbatim), the **Content: Same / Different per app** link/unlink control (hidden for Branding + always-shared keys), History, and Media (for image blocks). Live preview frame retained.

### 3.3 Per-section enable/disable (per app)

Each major section is gated by a **boolean block** `section_<name>_enabled` (default `'true'`). Because booleans use the same `shared`/`website`/`order_app` scopes as content, the **same link/unlink control gives per-app on/off for free**: "Same in both" → one switch for both apps; "Different per app" → an independent switch for website and order app.

Sections to gate (add any `*_enabled` key that does not already exist; keep existing ones):

| Section | Key | Apps | Already exists? |
|---|---|---|---|
| Announcement bar | `announcement_enabled` | both | ✅ keep |
| Office orders card | `office_orders_enabled` | order_app | ✅ keep |
| Hero | `section_hero_enabled` | both | new |
| Specials / Offers rail | `section_specials_enabled` | both | new |
| Featured items | `section_featured_enabled` | both | new |
| Categories ("Made for Malé") | `section_categories_enabled` | both | new |
| Social proof | `section_proof_enabled` | both | new |
| CTA band | `section_cta_enabled` | both | new |
| Location (website) | `section_location_enabled` | website | new |
| Reviews (order app) | `section_reviews_enabled` | order_app | new |

The hub renders these enable toggles **at the top of their section**, not as loose blocks. Readers gate rendering:
- **Website (Blade):** wrap each section in `@if(content('section_hero_enabled', 'true') === 'true') … @endif` in `backend/resources/views/home.blade.php` (and the relevant partials).
- **Order app (React):** the `/api/content?app=order_app` payload already returns these public keys; gate each section component on the flag.

All new keys seed `'true'` so **nothing disappears on deploy**.

---

## 4. Backend changes

### 4.1 Registry / sync

- `ContentRegistry::isSyncedAcrossApps()` → return true for **all brand keys**: `default_item_image`, `logo`, `logo_dark`, `favicon`, `og_image`, `primary_color`. (Add a `BRAND_SYNCED_KEYS` const; keep the method for back-compat.) **`primary_color` is included deliberately** — it sits in the Branding group, is `shareable`, and targets both apps, so leaving it out reproduces B1 for the brand colour.
- Add a helper `ContentRegistry::linkState(string $key): 'same'|'different'` derived from live rows (are there per-app override rows?), for the Same/Different link control.
- Mark `hero_slide_1/2/3` with `'deprecated' => true` (already present) and **exclude deprecated keys from the hub** entirely (they are read-fallback only).
- **Add the new `section_*_enabled` boolean keys** (see §3.3) to `config/content.php` with `type => boolean`, `default => 'true'`, `public => true`, `shareable => true`, and the correct `apps`. Group them under their section's group so they render at the top of that section in the hub. Seed rows via a migration so existing installs get them.

### 4.2 Single write path

- **`ContentWriter`** stays the only writer. It already mirrors synced keys across scopes (`isSyncedAcrossApps` loop) — this now covers all brand keys.
- **Retire the legacy write/upload endpoints:**
  - `PUT /api/site-settings` (`SiteSettingsController::update`) — remove, or make it delegate to `ContentWriter` for the handful of keys it still touches. Prefer **remove** and repoint the (soon-removed) Settings→Website UI.
  - `POST /api/site-settings/upload` (`SiteSettingsController::upload`) — remove; the hub uploads via Media Library.
  - Keep `GET /api/site-settings/public` (it is just an alias of `ContentResolver::for('order_app')->allPublic()` and is consumed by clients) **or** migrate callers to `/api/content?app=order_app` and remove. Verify consumers first (`apps/*`, Blade).
- **`MediaLibraryController::useAs`** — change `$scopes` so brand keys write **all** scopes (`['shared','website','order_app']`), matching `default_item_image`. Route the setting write through `ContentWriter` so "Use as" also creates a revision + audit row.

### 4.3 Dead code removal

- Remove `GET /admin/content/media` (`ContentController::media`) and the frontend `getContentMedia` + `ContentStudio/MediaLibrary.tsx` (superseded by `MediaPicker`). Keep `ContentController::upload`/`uploadVideo` **only** if the hero/embed video flow still needs a content-scoped upload; otherwise fold into Media Library upload. (Hero video currently uses `ContentController::uploadVideo` and already best-effort registers into `media_assets` — keep, but ensure it always catalogs.)

### 4.4 Backfill migration (correctness)

New migration to reconcile existing divergent brand rows so the live site matches intent **before** the sync rule takes over:

```
for each key in [logo, logo_dark, favicon, og_image]:
    source = first non-empty of (website scope, shared scope, order_app scope)   # app-scope wins, mirrors resolver
    if source is non-empty:
        set the same value on shared, website, order_app (locale 'en' and any existing locales)
```

This closes B1/B2 for data already in the wild. Idempotent; safe to re-run.

Include `primary_color` in the same backfill loop (non-image, but same divergence risk).

### 4.5 Guard against file deletion on collapse-to-Same (fixes B7 — **must ship with Phase 1**)

The Same/Different control makes `ContentController::share()` a high-traffic path, and today it can delete a file that is still in use. Two changes, both required:

1. **Teach `MediaFileCleaner::isReferenced()` about content + catalog rows.** Add checks for:
   - `site_settings` — any row (any scope/locale) whose `value` equals the URL, excluding the rows being removed;
   - `media_assets` — any catalog row whose `url` / `thumb_url` / `original_url` equals the URL.

   Guard both with `Schema::hasTable()` so the helper stays safe on partially-migrated installs, mirroring the existing `categories` check.

2. **Do not delete files from `share()` at all.** Collapsing per-app overrides is a *content* operation; the underlying asset belongs to the Media Library and must outlive it. Drop the `deleteIfOwnedAndUnreferenced` call in `ContentController::share()` and let Media Library deletion/reconcile own file lifecycle. (Change 1 still lands — it protects every other caller, including `ContentController::upload`'s replace path.)

**Regression test:** an image block set to "Different per app" (website = A.jpg, order app = B.jpg) collapsed back to "Same" must leave **both files on disk** and keep any Media Library catalog row intact.

---

## 5. Frontend changes (`apps/admin-dashboard`)

### 5.1 New hub

- New `pages/ContentHub/ContentHubPage.tsx` built by generalising `ContentStudio/AppContentEditor.tsx`:
  - Drop the `app` prop as a hard split. Load **all** blocks once; render one section navigator (by `group`).
  - Per block, render existing type editors (`HeroSlidesEditor`, `CategoriesEditor`, `RichTextEditor`, image, boolean, textarea/json, text) unchanged.
  - Add a **Content: Same in both / Different per app** link/unlink control per non-brand block that targets both apps. When "Different," show the website and order-app value editors side by side. On toggle, reuse existing `share`/`split`/`copy` controllers under the hood (Same → `share`, Different → `split`) — hide the verbs behind the one control.
  - **Section enable toggles:** render each `section_*_enabled` boolean at the top of its section header (not as a loose block), using the same Same/Different control so it can be set per app. Label it "Show this section" with a website/order-app pair when Different.
  - Branding + SEO image blocks: no link control; single value; always synced.
  - Keep autosave-draft, publish, schedule, history, export/import, live preview.
- Media: use `MediaPicker` for every image/video block (already the pattern in `AppContentEditor`); remove the `MediaLibrary` modal import path.

### 5.2 Navigation & routing

- `components/navConfig.ts` **System** group: replace the three entries (`/content/website`, `/content/order-app`, `/content/website?group=Branding`) with **one**: `{ to: '/content', label: 'Content & Branding', icon: LayoutTemplate, permission: 'website.manage', description: 'Website + order app copy, branding & visuals' }`. Keep `/media` (Media Library) as a sibling.
- `App.tsx`: route `/content` → `ContentHubPage`. Keep `/content/website`, `/content/order-app`, `/content-studio` as **redirects to `/content`** (deep links + muscle memory). Support `?group=` and `?section=` deep-links (Settings and other callers use `?group=Branding`).
- `SettingsPage` (`WebsiteSettingsSubPage.tsx`): remove the **Default item photo** and **New items window** editors — both live in the hub's **Branding** section (the registry already assigns `default_item_image` *and* `menu_new_days` to `group => 'Branding'`; do not move `menu_new_days` to a Menu group). Keep the **Dine-in menu QR / link / print** card (a Settings utility, not content). Remove `getSiteSettings`/`updateSiteSettings`/`uploadSiteLogo` usage from this file, and repoint its remaining "Content editors" links from `/content/website?group=Branding` + `/content/order-app` to the single `/content?group=Branding`.

### 5.3 Delete

- `pages/ContentStudio/MediaLibrary.tsx`, `getContentMedia` in `api/content.ts`, and their tests.

---

## 6. Tests

**Baseline:** record the suite result on `main` **before** starting and keep it green. (Do **not** target 1703 passed / 3 skipped — that figure was measured on the `claude/tv-signage` branch, which is ahead of `main`; this work branches off `main` and will have its own baseline.) Add/adjust:

- **Backend**
  - `useAs` writes all three scopes for `logo`/`favicon`/`logo_dark`/`og_image`/`primary_color` and creates a revision + audit row (extend `MediaUsageResolverTest` area or a new `BrandingSyncTest`).
  - **B7 regression:** an image block differing per app, collapsed back to "Same", leaves both files on disk and the `media_assets` row intact; `MediaFileCleaner::isReferenced()` returns true for a URL referenced only by a `site_settings` or `media_assets` row.
  - `ContentResolver` returns the same `logo` for `website` and `order_app` after a single hub write (regression for B2).
  - Backfill migration reconciles a pre-seeded divergent set (website=A, shared=B) to A everywhere.
  - Removing `PUT /api/site-settings` / `/site-settings/upload`: update or delete `SiteSettings*` tests; assert the routes are gone (or delegate correctly if kept).
- **Section gating**
  - `home.blade.php` hides a section when its `section_*_enabled` resolves to `'false'` for the website scope, and shows it (default) otherwise.
  - Order app gates the matching section component on the flag; a `section_specials_enabled` = false on `order_app` scope hides the rail in the order app while the website (still true) keeps it — proves per-app independence.
  - New `section_*_enabled` keys seed `'true'`; a fresh migrate leaves every section visible.
- **Frontend** (`apps/admin-dashboard`)
  - Hub renders sections; the **Same / Different per app** control splits a block and shows two editors, and collapsing back re-shares.
  - Section enable toggle renders at the section header and can be set differently per app.
  - Branding block has no link control and a single value.
  - Nav shows one "Content & Branding" entry; `/content/website` redirects to `/content`.
  - `WebsiteSettingsSubPage` no longer renders the default-photo / new-items editors.

Existing Content Studio tests (`ContentStudio*.test.tsx`) get renamed/retargeted to the hub.

---

## 7. Rollout (Phase 1 — the unified hub; section reordering is Phase 2, see §9)

1. Backend: sync rule + `useAs` all-scope + **B7 deletion guard (§4.5, ship together — the hub makes that path high-traffic)** + backfill migration + retire legacy write/upload + remove dead media endpoint. Ship behind no flag (data-correct on deploy).
2. Frontend: hub page + nav collapse + redirects + Settings cleanup + dead-code delete.
3. Build sync: rebuild `apps/admin-dashboard`, copy `dist` → `backend/public/admin`, verify committed bundle hash matches a fresh build. No order-app SW bump needed unless the order app changed.
4. `php artisan migrate` runs the backfill; `php artisan view:clear` for Blade.

---

## 8. Acceptance criteria

- [ ] Exactly **one** sidebar entry leads to content/branding editing (plus Media Library).
- [ ] Setting the logo once (hub **or** Media Library "Use as") updates website **and** order app **and** admin/KDS immediately. (B1, B2)
- [ ] No editor writes `site_settings` except through `ContentWriter`; every content/branding change produces a revision + audit row. (B3)
- [ ] Every upload lands in the Media Library catalog with a thumbnail and dedupe. (B4)
- [ ] `ContentStudio/MediaLibrary.tsx`, `getContentMedia`, `GET /admin/content/media`, `PUT/POST /api/site-settings*` write/upload endpoints are gone (or delegating). (B5)
- [ ] A non-technical user can give the website and order app **different** copy for the same block (unlink), or keep them identical (link), without seeing the words *scope*, *share*, or *split*. (B6, clarification #1)
- [ ] Each major section can be **shown/hidden independently on the website and the order app**, and all sections default to visible after migrate. (clarification #2)
- [ ] Switching an image block between "Same" and "Different per app" **never deletes a file** that any `site_settings` row or Media Library asset still references. (B7)
- [ ] Backend suite green against the **`main` baseline recorded at start**; admin + order app builds green; committed bundles match fresh builds.

---

## 9. Phase 2 — drag-to-reorder sections (deferred, separate build)

Not in the Phase 1 hub build; gets its own plan + Cursor prompt after Phase 1 lands. Recorded here so intent is preserved.

**Goal:** let the owner reorder the movable home sections ("this section comes after that one," "move this to the top") from the hub, **independently for website and order app**, without breaking layout.

**Model:**
- Store a section order as content: `home_section_order` = JSON array of section ids, e.g. `["specials","featured","categories","proof","cta","location"]`. It is `shareable` + targets both apps, so the same **Same / Different per app** link control gives the website and order app **independent orders** (per the owner's choice).
- **Pinned, non-movable:** top bar / nav, announcement bar, **Hero (always first)**, footer. Only the middle content sections are draggable.
- Reuses the §3.3 enable flags — a disabled section is skipped in the order.

**Layout-safety refactor (the real work):**
- Refactor `backend/resources/views/home.blade.php` so the movable sections become **self-contained partials** (each owns its vertical padding) rendered by looping over the resolved order, instead of a hardcoded top-to-bottom sequence.
- Background striping (cream/white alternation) is computed from **loop index**, not hardcoded per section, so any order alternates cleanly and two same-colored blocks never touch.
- Mirror the same ordered-loop approach in the order app home screen.
- Unknown/missing ids are ignored; any movable section absent from the stored order is appended in default order (forward-compatible when new sections are added).

**Admin UI:** a drag-to-reorder list of the movable sections in the hub, next to the enable toggles, with the Same/Different control for per-app order.

**Acceptance:** reordering in the hub changes the live section sequence on the target app only; hero stays first; striping stays clean at any order; a section with no stored position still renders in a sensible default slot.

---

## 10. Explicitly out of scope

- Rewriting the `(key, scope, locale)` storage model or the ~130 registry keys.
- Inline/click-to-edit-on-live-preview authoring (possible later; the live preview frame stays read-only here).
- Menu **item** content (name/description/price/photos) — that stays in Menu Items; only the *marketing* copy and branding move into the hub.
- Signage / TV board (separate feature).

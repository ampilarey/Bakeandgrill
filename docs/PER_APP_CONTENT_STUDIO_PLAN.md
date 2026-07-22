# Per-App Content Management ("Content Studio") — Implementation Plan

**Repository:** `ampilarey/Bakeandgrill`
**Status:** Plan only — no feature code written yet.
**Goal:** Let the admin manage the **marketing website** and the **order app** content **independently**, while being able to **share** any block across both when desired (e.g. one contact number, one hero for both). Maximum soft-coding — new content editable without code changes — behind one outstanding, modern admin panel.
**Author's note:** Separates **VERIFIED findings** (files actually read) from **RECOMMENDATIONS**. New paths marked **(new)**.

---

## 0. TL;DR

- Today both apps read **one** `site_settings` table. The Blade site reads **every** key server-side; the order app reads **only `is_public` keys** via `/api/site-settings/public`. Result: content is entangled, and ~75 keys the order app references are private, so editing them changes the website but **not** the order app (verified divergence bug).
- **The change:** add a **scope** dimension — `shared` / `website` / `order_app` — to every content block, plus a **resolver** (`override → shared → default`). Same key can be shared (one value, both apps) or split (a different value per app), toggled by the admin.
- **Soft-coding:** a **Content Registry** (`config/content.php`) is the single source that defines every block (label, group, type, which apps, shareable, default, validation). The admin UI, the resolver's known-keys, and seeded defaults all come from it. Adding new editable content = add a registry entry + seed, no component code.
- **Admin:** a redesigned **Content Studio** — per block a "Shared / Different per app" toggle, per-app tabs, live preview, media with crop, revision history, and publish. Evolves the existing dynamic Website Settings page, not a blind rebuild.
- **Back-compatible:** existing rows migrate to `scope = shared`; existing `SiteSetting::get('key')` calls keep returning the shared value. Nothing changes on deploy until an admin creates an override.

---

## 1. Verified findings

### Storage & resolution
| Area | Path | Note |
|---|---|---|
| Settings table | `backend/database/migrations/2026_03_15_003320_create_site_settings_table.php` | `key` **unique**, `value`, `type`, `group`, `label`, `description`, `is_public` |
| Model | `backend/app/Models/SiteSetting.php` | `get(key,default)` caches raw value `Cache::rememberForever("site_setting.{key}")`; `set()` busts key + `site_settings.public/all`; `allPublic()` = `where('is_public',true)->pluck('value','key')`; preserves seeded metadata on update |
| Public API | `backend/app/Http/Controllers/Api/SiteSettingsController.php` | `public()` → `allPublic()`; `index()` → grouped by `group`; `update()` bulk PUT (only updates existing keys); `upload()` stores brand/hero/cat images to `site/` disk **with no crop/resize** |
| Routes | `backend/routes/api.php:154` (`GET /site-settings/public`), `backend/routes/domains/staff.php:170-172` (`GET/PUT /site-settings`, `POST /site-settings/upload`, `permission:website.manage`/`settings.update`) | |
| CMS seeds | `2026_03_15_100000_add_cms_site_settings.php`, `2026_04_10_add_extended_cms_settings.php`, `add_final_cms_settings.php`, `add_remaining_cms_settings.php`, `2026_04_10_seed_business_contact_site_settings.php`, `2026_03_22_000001_mark_hero_trust_site_settings_public.php` | ~124 CMS keys across 12 groups (Pages 34, Homepage 30, Contact 22, Order App 7, Footer 7, Pre-Order 6, Announcements 4, Legal 3, Hero 3, About 3, Menu 2, Hours 2) |
| **Divergence (BUG)** | is_public split ≈ **51 true / 75 false** | Verified private-but-order-app-referenced keys: `home_categories_title`, `home_delivery_tagline`, `contact_page_title`, `home_proof_eyebrow`, `homepage_categories`, `proof_stat`, `cta_band_headline` → order app never receives them → shows hardcoded default regardless of admin edits |

### Marketing website (Blade) — reads ALL keys server-side
| Area | Path | Note |
|---|---|---|
| Controller | `backend/app/Http/Controllers/HomeController.php` | passes items/hours/specials; hero & copy read inside views |
| Home view | `backend/resources/views/home.blade.php` | reads `hero_slide_{i}`, `trust_items`, `homepage_categories`, `proof_*`, `cta_band_*`, `business_*`, `home_*`, `meta_*` via `SiteSetting::get(key, 'HARDCODED DEFAULT')` |
| Other views | `contact.blade.php`, `hours.blade.php`, `privacy/terms/refund.blade.php`, `layout.blade.php`, `partials/*` | all read `SiteSetting::get()` directly |
| View composer hook | `backend/app/Providers/AppServiceProvider.php:53` (`View::composer([...])`) | existing injection point to reuse |

### Order app (React) — reads PUBLIC subset only
| Area | Path | Note |
|---|---|---|
| Settings context | `apps/online-order-web/src/context/SiteSettingsContext.tsx` | fetches `/api/site-settings/public`; exposes `text(key, default)`, typed `heroSlides`, `DEFAULT_SETTINGS`, `DEFAULT_TRUST_ITEMS`, `DEFAULT_CATEGORIES` (hardcoded fallbacks), row parsers; `SiteSettings` has `[key:string]:string` index signature |
| Consumers (~40 files) | `pages/{HomePage,AboutPage,ContactPage,HoursPage,CheckoutPage,CateringPage,PrivacyPage,MenuPage,OrderStatusPage}.tsx`, `components/home/*` (`TrustStrip`, `CategoryShortcuts`, `PromoCarousel`, `SpecialsCarousel`, `ModeEntryCards`, `GreetingHeader`), `components/shell/*` (`TopNav`, `AppShell`), `BrandedHeader`, `ServiceBanner`, `CartDrawer`, `AuthBlock` | all read via `useSiteSettingsContext().text(...)` |
| PWA | `apps/online-order-web/public/sw.js` | `/api/site-settings/public` is **network-first** cached (fresh online, stale offline) |

### Admin content UI (already dynamic)
| Area | Path | Note |
|---|---|---|
| Website settings | `apps/admin-dashboard/src/pages/SettingsPage/WebsiteSettingsSubPage.tsx` (519 lines) | tabs rendered dynamically from `group`; custom editors: `HeroSlideEditor` (image upload + eyebrow + title + subtitle + 2 CTAs), `TrustItemsEditor`, `HomepageCategoriesEditor`, `ProofDetailsEditor`, `AboutValuesEditor`, `PreorderStepsEditor`, `BusinessHoursEditor`; generic fields by `type` (text/textarea/json/image/color/boolean); saves bulk `PUT /site-settings` |
| API client | `apps/admin-dashboard/src/api/*` (site settings calls) | `GET/PUT /site-settings`, `POST /site-settings/upload` |

**Conclusion:** the infrastructure (dynamic admin tabs, per-key metadata, caching, both consumers) is strong. We extend it with a **scope** dimension + a **registry**, not a rebuild.

---

## 2. Proposed architecture

### 2.1 The scope model (the core idea)
Every content block resolves per app through three layers, highest priority first:

```
  order app value(key) = override(key, 'order_app')  ?? shared(key) ?? registry_default(key)
  website   value(key) = override(key, 'website')     ?? shared(key) ?? registry_default(key)
```

- **Shared** = no per-app override exists → both apps read the one `shared` value.
- **Split** = an override row exists for `website` and/or `order_app` → that app reads its own value; the other still reads `shared`.
- Admin toggles a block between **Shared** and **Different per app**; "Reset to shared" deletes overrides; "Copy website → order app" seeds one from the other.

This delivers exactly the requirement: independent per-app content, with opt-in sharing (contact number stays one `shared` block; hero can be split).

### 2.2 Storage — extend `site_settings`, don't fork it
- Add `scope` enum(`shared`,`website`,`order_app`) default `shared`.
- Change the unique key from `key` → **composite `(key, scope)`**.
- Existing rows all become `scope = shared` (zero behaviour change).
- New override rows are created only when an admin splits a block.

*(Alternative considered: a separate `content_blocks` table. Rejected — it would create two sources of truth and duplicate the caching/upload/admin machinery. Extending `site_settings` reuses all of it.)*

### 2.3 Content Registry — the soft-coding engine
**New** `backend/config/content.php`: the single declarative catalog of every editable block:
```
'business_phone' => [
  'label' => 'Phone number', 'group' => 'Contact', 'type' => 'text',
  'apps' => ['website','order_app'], 'shareable' => true, 'default' => '+960 912 0011',
  'public' => true, 'validate' => 'string|max:40',
],
'hero_slides' => [ 'type' => 'repeater', 'schema' => [...], 'apps' => ['website','order_app'], 'shareable' => true, ... ],
```
The registry drives: admin editors & tabs, validation, the resolver's known-key list, seeded defaults, and which apps a block targets. **Adding new editable content = add a registry entry + a seed row.** Defaults live here **once** (removing the scattered hardcoded fallbacks in Blade and React — those become a last-resort safety net only).

### 2.4 Resolver
**New** `backend/app/Domains/Content/ContentResolver.php`:
- `for(string $app): ScopedContent` where `$app ∈ {website, order_app}`.
- `get(string $key, $default = null)`, `all(): array` (resolved map for that app, registry-ordered), `json(string $key)`.
- Merge order: app override (non-empty) → shared (non-empty) → registry default.
- Cache the **resolved per-app map** in Redis (`content.resolved.website`, `content.resolved.order_app`) — busted on any write (reuse `SiteSetting::set` bust + a content bust).

### 2.5 Delivery to each app
- **Website (Blade):** a `View::composer` (extend the existing one at `AppServiceProvider.php:53`) injects `$content = ContentResolver::for('website')` into all public views. A `content('key','default')` Blade helper **(new)** replaces the scattered `SiteSetting::get(...)`. Server-side, always fresh.
- **Order app (React):** `GET /api/content?app=order_app` **(new, replaces/augments `/site-settings/public`)** returns the resolved public map for the order app. `SiteSettingsContext` fetches this; `text(key)` reads it. Keep `/site-settings/public` as a thin alias (returns order_app scope) for back-compat with the deployed bundle until the SW updates.

### 2.6 Security & correctness
- Only registry blocks marked `public: true` are ever emitted to a client. System/secret settings stay server-only (the resolver's public map filters by registry).
- Rich-text/HTML blocks (hero title, CTA, announcements, legal bodies) are **sanitised on save** (allow-list) and escaped appropriately on render — closes the stored-XSS surface that exists today.
- Media (hero/category/brand images) route through the **`MenuImageProcessor`** crop/thumbnail pipeline per scope (fixes today's no-optimisation `site/` uploads), reusing the media-hardening work already merged.

---

## 3. Data model

### `site_settings` (modified)
| Column | Change | Purpose |
|---|---|---|
| `scope` | **new** enum(`shared`,`website`,`order_app`) default `shared`, indexed | which surface this row's value applies to |
| unique | **change** `key` → **`(key, scope)`** | one value per key per scope |
| (existing) `key,value,type,group,label,description,is_public` | unchanged | — |

Back-compat: `SiteSetting::get(key)` (no scope) resolves `scope = shared`. Existing callers unaffected.

### Optional revision history
Reuse the existing **`audit_logs`** table (`AuditLogService`) — log every content change as `content.updated` with `{key, scope, old, new, actor}`. No new table needed for v1. (A dedicated `content_revisions` table with restore is a Phase-4 nicety.)

### Registry (config, not a table)
`config/content.php` — declarative; version-controlled; the source of block metadata + defaults.

---

## 4. Backend changes

**New**
- `backend/config/content.php` — the block registry.
- `backend/app/Domains/Content/ContentResolver.php` — per-app resolver + cache.
- `backend/app/Domains/Content/ContentRegistry.php` — typed access to `config/content.php` (list blocks, defaults, validation, per-app, shareable, public).
- `backend/app/Http/Controllers/Api/ContentController.php` — `public` (`GET /api/content?app=`), admin `index` (registry + all scope values + resolved), `update` (scoped bulk save), `share`/`split`/`copy` actions, `upload` (scoped, cropped).
- `backend/app/Http/Requests/UpdateContentRequest.php` — validates against registry (type/validate rules per key).
- `backend/app/Http/Resources/ContentBlockResource.php` — block + per-scope values + resolved + "is shared/split" state.
- `backend/app/Support/ContentSanitizer.php` — HTML allow-list for rich blocks.
- `backend/database/migrations/…_add_scope_to_site_settings.php` — add `scope`, change unique.
- `backend/database/migrations/…_backfill_content_scope_and_publicity.php` — set existing rows `scope=shared`; mark registry-public content keys `is_public=true` (fixes the divergence).
- `backend/database/seeders/ContentSeeder.php` — idempotent seed of shared defaults from the registry.
- `backend/app/Console/Commands/ContentSyncRegistry.php` — reconcile DB rows with the registry (adds missing shared rows; never deletes).

**Modified**
- `backend/app/Models/SiteSetting.php` — scope-aware `get(key, default, scope='shared')`, `set(key, value, scope='shared')`, scope-aware cache keys + bust; keep old signatures working.
- `backend/app/Providers/AppServiceProvider.php` — extend the `View::composer` to inject `$content` (website scope); register a `content()` Blade helper.
- `backend/app/Http/Controllers/HomeController.php` + all public Blade views — replace `SiteSetting::get('k','d')` with `content('k','d')` (website scope). Mechanical, view-by-view.
- `backend/routes/api.php` — `GET /api/content` (public, throttled); keep `/site-settings/public` as alias.
- `backend/routes/domains/staff.php` — admin content routes under `permission:website.manage`.
- `backend/app/Http/Controllers/Api/SiteSettingsController.php` — delegate `public()`/`upload()` to the content system (or keep as thin compatibility shim).

**Risks:** the Blade view sweep (many `SiteSetting::get` call sites) must preserve every default; do it mechanically with a codemod + snapshot tests. The unique-key migration must be done carefully (add column, backfill, then swap index) to avoid collisions.

---

## 5. Public website (Blade) changes

- Introduce `content('key','default')` + `$content` composer; convert `home/contact/hours/privacy/terms/refund/layout/partials` views from `SiteSetting::get` to `content(...)` (website scope).
- Hero/category images resolve to the cropped/thumb variants.
- Rich blocks rendered with the sanitiser output (safe HTML) instead of raw.
- No visual change by default (shared values == today's values).

---

## 6. Order app (React) changes

- `SiteSettingsContext.tsx` → fetch `GET /api/content?app=order_app` (fall back to `/site-settings/public`). Keep `text(key, default)` API identical so the ~40 consumer files don't change.
- Move the big hardcoded `DEFAULT_SETTINGS`/`DEFAULT_*` blocks to be a **last-resort** only; the server now returns registry defaults, so admin edits always win. (Optional: generate a typed `content-keys.ts` from the registry for autocomplete.)
- Because content keys the order app uses are now delivered (divergence fixed), edits to homepage/contact/about copy finally reflect in the order app.
- PWA: `/api/content` stays network-first (short-lived), same as today; bump `CACHE_VERSION` on release.

---

## 7. Admin panel — "Content Studio" (the outstanding modern UI)

Rename/evolve **Website Settings** into **Content Studio** (`apps/admin-dashboard/src/pages/ContentStudio/`), rendered from the registry:

**Layout**
- **Left rail:** content groups (Hero, Homepage, Contact, Hours, About, Footer, Announcements, Legal, SEO, Brand, Order-App). Search + "unsaved changes" indicator.
- **Main:** a list of **content block cards**. Each card shows: label, where it's used badges (**Website / Order App / Both**), and current state (**Shared** or **Split**).
- **Per block — the scope control (the key UX):**
  - A segmented toggle: **`Shared (both apps)`** ⇄ **`Different per app`**.
  - *Shared:* one editor.
  - *Different per app:* two tabs — **Website** | **Order App** — each with its own editor; actions **Copy Website→Order App**, **Copy Order App→Website**, **Reset to Shared** (deletes overrides).
- **Editors** by type: text, rich-text (sanitised toolbar), image (crop modal + per-scope), repeater (hero slides, categories, trust items, proof, about values, footer links), color, boolean, business-hours.
- **Live preview:** a per-app preview pane (Website / Order App) so the admin sees the block in context before publishing. Modern, reduces guesswork.
- **Publish flow:** stage changes → "Publish" (bulk scoped save) → cache bust → toast. **Revision history** per block (from `audit_logs`) with who/when and a diff.
- **Mobile admin:** cards stack; scope toggle + tabs remain reachable.

**Safeguards:** `permission:website.manage`; confirmation on "Reset to Shared" (destroys an override); rich-text sanitised server-side regardless of client.

**API client:** `apps/admin-dashboard/src/api/content.ts` — registry+values fetch, scoped save, share/split/copy, scoped upload.

---

## 8. Migration & backfill (safety first)

1. Add `scope` column (default `shared`) — all existing rows become shared. **No behaviour change.**
2. Swap unique index `key` → `(key, scope)`.
3. Backfill: mark all registry-`public` content keys `is_public = true` (fixes divergence so the order app receives them). Values unchanged.
4. Seed any registry blocks missing a shared row from registry defaults (idempotent).
5. Deploy order: backend (migrate+seed) → website (Blade helper) → order app (bump SW) → admin (Content Studio). Each step is backward-compatible (old order-app bundle keeps using `/site-settings/public` alias).
6. Rollback: `scope` is additive; the resolver falls back to shared; revert admin/website UI. No data loss.

**Defaults preserved:** because shared values equal today's stored values (and registry defaults equal today's hardcoded fallbacks), the sites look identical until an admin deliberately splits or edits a block.

---

## 9. API contract (additive)

- `GET /api/content?app=order_app|website` → `{ content: { key: value, ... } }` (resolved public map for that app). Throttled.
- `GET /api/site-settings/public` → alias of `?app=order_app` (compat).
- `GET /api/admin/content` → `{ blocks: [ { key, label, group, apps, shareable, type, public, shared, website, order_app, resolved_website, resolved_order_app, state:'shared'|'split' } ] }`.
- `PUT /api/admin/content` → `{ changes: [ { key, scope, value } ] }` (validated against registry).
- `POST /api/admin/content/{key}/share` / `/split` / `/copy` `{ from, to }`.
- `POST /api/admin/content/upload` → `{ key, scope, file }` → cropped URL.
Errors: 422 registry-validation shape; 403 permission.

---

## 10. Security & privacy

- Only `public: true` registry blocks are emitted to any client; system settings never leak.
- Server-side HTML sanitisation (`ContentSanitizer`) on every rich block save; render escaped/safe.
- `permission:website.manage` on all admin content routes; audit every change.
- Image uploads: MIME allow-list + crop pipeline + size caps (reuse media-hardening).
- Rate-limit public `/api/content`.

---

## 11. Testing plan

**Backend — `backend/tests/Feature/Content/`**
- `ContentResolverTest` — override>shared>default precedence per app; shared read by both; split isolates apps; unknown key → registry default.
- `ContentScopeApiTest` — `?app=order_app` vs `website` return correct resolved maps; only public blocks emitted.
- `ContentAdminTest` — save scoped value; share/split/copy/reset; validation from registry; audit written; permission enforced.
- `ContentBackfillTest` — existing rows → shared; public backfill fixes divergence (previously-private key now delivered to order app); no value changes.
- `ContentSanitizerTest` — script/onclick stripped; allowed tags kept.
- `ContentMediaTest` — scoped hero upload cropped + thumbnailed; cleanup on replace (reuse media observers).
- **Regression:** existing `SiteSetting` get/set, `/site-settings/public` alias, Blade rendering snapshots unchanged for shared defaults.

**Frontend**
- Admin `ContentStudio` — shared↔split toggle; per-app tabs; copy/reset; preview; save calls scoped API; permission gating.
- Order app — `text()` reads scoped content; previously-private keys now reflect admin edits; defaults still work offline.
- Blade snapshot tests for home/contact/hours unchanged at defaults.

**Manual**
- Split the hero → different hero on website vs order app. Share the phone → edit once, both update. Reset hero to shared → both converge.

---

## 12. File-by-file checklist

**Migrations**
- [ ] `…_add_scope_to_site_settings.php` (new)
- [ ] `…_backfill_content_scope_and_publicity.php` (new)

**Backend**
- [ ] `config/content.php` (new — registry)
- [ ] `app/Domains/Content/ContentRegistry.php` (new)
- [ ] `app/Domains/Content/ContentResolver.php` (new)
- [ ] `app/Support/ContentSanitizer.php` (new)
- [ ] `app/Http/Controllers/Api/ContentController.php` (new)
- [ ] `app/Http/Requests/UpdateContentRequest.php` (new)
- [ ] `app/Http/Resources/ContentBlockResource.php` (new)
- [ ] `app/Console/Commands/ContentSyncRegistry.php` (new)
- [ ] `database/seeders/ContentSeeder.php` (new)
- [ ] `app/Models/SiteSetting.php` (modify — scope-aware)
- [ ] `app/Providers/AppServiceProvider.php` (modify — `$content` composer + `content()` helper)
- [ ] `app/Http/Controllers/HomeController.php` + `resources/views/{home,contact,hours,privacy,terms,refund,layout}.blade.php` + `partials/*` (modify — `content()`)
- [ ] `app/Http/Controllers/Api/SiteSettingsController.php` (modify — delegate/alias)
- [ ] `routes/api.php`, `routes/domains/staff.php` (modify — content routes)

**Order-app UI**
- [ ] `src/context/SiteSettingsContext.tsx` (modify — fetch `/api/content?app=order_app`)
- [ ] `src/api/*` content client (modify)
- [ ] `public/sw.js` (modify — cache `/api/content`; bump `CACHE_VERSION`)

**Admin UI**
- [ ] `src/pages/ContentStudio/*` (new — page, block card, scope toggle, per-app tabs, editors, preview, revision history)
- [ ] `src/api/content.ts` (new)
- [ ] `src/components/navConfig.ts`, `src/App.tsx` (modify — nav + route; keep/redirect old Website Settings)

**Tests** — as §11 (`backend/tests/Feature/Content/*`, admin/order-app `*.test.tsx`).

**Docs** — this file; a short "adding a content block" guide.

---

## 13. Risks & decisions Cursor must not improvise

1. **Back-compat is sacred.** Existing `SiteSetting::get('key')` must keep returning the shared value; `/site-settings/public` must keep working for the deployed order-app bundle. Migrate to `scope=shared`; never drop the alias in the same release.
2. **Defaults must not shift.** Registry defaults must equal today's hardcoded fallbacks; shared values equal today's stored values. Ship snapshot tests proving the website/order app render identically at defaults.
3. **Unique-index change** must be add-column → backfill → swap-index, guarded against `(key,scope)` collisions.
4. **Only registry-public blocks** are ever emitted to clients — do not blanket-expose settings.
5. **Sanitise rich content server-side** — never trust the client editor.
6. **Reuse** the media crop/cleanup pipeline for scoped images; don't invent a second uploader.
7. **Do not migrate ops/system settings** (online ordering, delivery, charges, service-availability) into the content scope model — those stay as-is (`WEBSITE_OPS_GROUPS` already excludes them).

---

## 14. Acceptance criteria

1. An admin can set a block (e.g. hero) **differently** for website vs order app, and each surface shows its own value.
2. An admin can keep a block **shared** (e.g. phone number); editing it once updates both apps.
3. Toggling a block Shared→Different seeds per-app copies; Different→Shared removes overrides and both converge.
4. Previously-private content keys now reflect admin edits in the **order app** (divergence fixed).
5. At defaults, the website and order app render exactly as before the change (snapshot-verified).
6. All content edits are audited (who/when/old/new/scope); rich content is sanitised.
7. Hero/category images are cropped/optimised per scope; replacing one cleans up the old file.
8. Backend rejects invalid values per the registry; only `website.manage` can edit; only public blocks reach clients.
9. Existing `/site-settings/public` keeps working for the old bundle during rollout.

---

## 15. Cursor execution sequence

**Stage 1 — Scope storage + resolver + registry (backend core)**
Migration (add scope, swap unique), `config/content.php` (seed the current key set), `ContentRegistry`, `ContentResolver`, scope-aware `SiteSetting`, `ContentSeeder`, backfill migration. Tests: resolver + backfill. Commit: "content: scoped storage + resolver + registry".

**Stage 2 — Public delivery (both apps read the resolver)**
`GET /api/content`, `/site-settings/public` alias, Blade `content()` helper + composer + view sweep, order-app context fetch. Snapshot tests prove no visual change at defaults. Commit: "content: per-app delivery + divergence fix".

**Stage 3 — Admin write API + sanitiser + scoped media**
`ContentController` (index/update/share/split/copy/upload), `UpdateContentRequest`, `ContentSanitizer`, scoped cropped uploads, audit. Tests: admin + sanitiser + media. Commit: "content: scoped admin API".

**Stage 4 — Content Studio UI**
New admin page: block cards, Shared/Different toggle, per-app tabs, editors, copy/reset, preview, revision history; nav + route; redirect old Website Settings. Rebuild+resync admin dist. Tests: admin UI. Commit: "content: Content Studio admin panel".

**Stage 5 — Order-app polish + PWA**
Trim hardcoded defaults to last-resort, verify all consumers, bump SW `CACHE_VERSION`, rebuild+resync order dist. Tests: order-app content. Commit: "content: order-app scoped content + PWA".

**(Phase 4, later)** dedicated `content_revisions` with one-click restore; scheduled/publish-at; multi-language per scope; import/export content bundles.

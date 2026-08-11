# Content App-Scope Audit — make the registry honest

Status: **Built** (key-scope audit closed; known leftovers documented). Stage F retired `home_section_order` from live paths; `proof_details` is website-only. A later re-audit found **2** remaining mis-scoped keys (not 24). Use this doc as the original audit plan; residual list lives in later page-builder notes.

> Rescued from branch `claude/content-app-scope-audit-plan` (not written fresh on this branch).

---

**Depends on:** the unified Content & Branding hub (merged) and `feat/brand-kit` (pending).
**Goal:** The website and the order app have genuinely different layouts, but the content registry declares 66 keys as "both apps" when the order app renders only 42 of them. Correct every `apps` declaration so each key is offered only where it actually does something, wire the few that *should* work in both, and delete keys that are dead everywhere.

---

## 1. Why — the layouts really are different

| Website home (marketing landing page) | Order app home (app dashboard) |
|---|---|
| Hero → Specials → Featured → Categories → Social proof → CTA band → Location → Events | Greeting → Prayer bar → Opening status → Mode entry cards → Reorder strip → Specials carousel → Promo carousel → Category shortcuts → Daily special → Featured review → Trust strip → Stat chips |

The website sells to a stranger; the order app is a dashboard for someone who already decided. Only some sections correspond. The content model currently pretends they are the same shape, so the hub offers "Same in both / Different per app" on blocks the order app never renders — the edit silently affects the website only.

**Today:** 160 live blocks — 124 offered on the website editor, 102 on the order app editor.

---

## 2. Findings (verified by tracing helpers, hooks and props — not literal greps alone)

### 2.1 🔴 F1 — 24 of the 66 "both apps" keys are never rendered in the order app

`cta_band_headline`, `cta_band_subtext`, `favicon`, `footer_contact_heading`, `footer_location_heading`, `footer_quick_links_heading`, `footer_rights_suffix`, `home_categories_subtitle`, `home_featured_eyebrow_bestseller`, `home_featured_eyebrow_handpicked`, `home_featured_subtitle`, `home_featured_title_bestseller`, `home_featured_title_handpicked`, `hours_page_note`, `maps_embed_url`, `meta_description`, `meta_title`, `nav_order_cta_text`, `og_image`, `proof_label`, `proof_stat`, `section_cta_enabled`, `section_featured_enabled`, `section_proof_enabled`

Note: `hero_slides` and `homepage_categories` are **correctly** shared — the order app renders both (via `SiteSettingsContext` `useMemo` → props → `HeroCarousel` / `CategoryShortcuts`). They are not in this list.

### 2.2 🔴 F2 — Three section on/off switches do nothing on the order app

`section_featured_enabled`, `section_proof_enabled`, `section_cta_enabled` are declared for both apps and are exposed in the `/api/content?app=order_app` payload (which is all the existing test asserts), but **no order-app component reads them**. Turning "Featured items" off for the order app has no effect. The other flags (`hero`, `specials`, `categories`, `reviews`) *are* gated in `HomePage.tsx`.

### 2.3 🔴 F3 — Six keys are dead everywhere

The whole `order_status_*` family — `order_status_open`, `_closed`, `_closes`, `_opens`, `_pickup_only`, `_delivery_from` — appears **only** in `2026_07_23_060000_seed_order_status_banner_content.php` and `config/content.php`. Nothing in any view, app, or helper reads them. The real status badges use the separate `order_hours_*` family (`OpeningStatusBadge.tsx`). Half the "Status banners" group is inert.

### 2.4 🟠 F4 — `menu_page_subtitle` is declared order-app-only and never read

---

## 3. The fix

Three different treatments — not everything should simply be demoted.

### 3.1 Demote to website-only (18 keys)

These are genuinely website-layout concepts with no counterpart in the order app. Change `apps` to `['website']`:

| Group | Keys |
|---|---|
| CTA band | `cta_band_headline`, `cta_band_subtext` |
| Footer headings | `footer_contact_heading`, `footer_location_heading`, `footer_quick_links_heading`, `footer_rights_suffix` |
| Featured section | `home_featured_eyebrow_bestseller`, `home_featured_eyebrow_handpicked`, `home_featured_subtitle`, `home_featured_title_bestseller`, `home_featured_title_handpicked` |
| Social proof | `proof_label`, `proof_stat` |
| Section flags (F2) | `section_cta_enabled`, `section_featured_enabled`, `section_proof_enabled` |
| Misc | `home_categories_subtitle`, `maps_embed_url`, `nav_order_cta_text` |

Rationale for the three section flags: the sections **do not exist** in the order app's layout, so the honest fix is to stop offering the switch there rather than to build sections nobody asked for.

`hours_page_note` also moves to `['website']` — the order app has no hours page.

### 3.2 Wire it up instead of demoting (1 key)

- **`favicon`** — a brand asset, and the owner has explicitly asked for favicon control. The order app currently hardcodes `<link rel="icon" href="/logo.png">` (`apps/online-order-web/index.html:76`). Set it at runtime from `settings.favicon` (update the existing `<link rel="icon">` href, create one if absent, fall back to `/logo.png` when unset). Keep `apps: ['website','order_app']` and keep it in `BRAND_SYNCED_KEYS`.

### 3.3 Demote for editing, cannot work in the SPA (3 keys)

- `meta_title`, `meta_description`, `og_image` → `apps: ['website']`.

  Reason: meaningful link-preview/SEO metadata for `/order` URLs needs server-side rendering, which the SPA does not have. Declaring them website-only reflects reality. `og_image` stays in `BRAND_SYNCED_KEYS` — brand sync governs the *stored value*, while `apps` governs *where it is offered for editing*, so there is no conflict: it continues to be edited once in the Brand Kit.

### 3.4 Remove dead keys (7 keys)

- Delete the six `order_status_*` blocks and `menu_page_subtitle` from `config/content.php`.
- **Non-destructive:** leave any existing `site_settings` rows in place (they are inert). Do not write a data-deleting migration.
- Leave the historical seed migration file untouched (never edit applied migrations); optionally add a short comment noting the keys were retired.
- If the menu-banner feature is ever built, re-add the keys then.

---

## 4. Expected effect

- **Order app editor: 102 → 71 blocks** (−31 that currently do nothing there).
- Website editor unchanged in count; blocks that are website-only stop showing a meaningless Same/Different control.
- The 42 keys that genuinely render in both apps keep full per-app independence — **no loss of the ability to differentiate content**.

---

## 5. Tests

- **Registry**
  - Every key in `ContentRegistry::keysForApp('order_app')` is referenced somewhere in `apps/online-order-web/src` (excluding the `SiteSettings` interface block, lines 15–106 of `SiteSettingsContext.tsx`, and test files). This is the guard that stops the drift recurring — add it as a **repo hygiene test**.
  - Same guard for `keysForApp('website')` against `backend/resources/views` + `backend/app`.
  - The `order_status_*` keys and `menu_page_subtitle` no longer exist in the registry.
- **Behaviour**
  - `/api/content?app=order_app` no longer returns the demoted keys.
  - `/api/content?app=website` still returns them, unchanged values.
  - Website rendering is byte-identical for the demoted keys (they only ever affected the website).
- **Favicon wiring (order app)**
  - `settings.favicon` set → the `<link rel="icon">` href updates; unset → falls back to `/logo.png`.
- **Hub**
  - Demoted blocks render without a Same/Different control and are labelled website-only.

---

## 6. Acceptance criteria

- [ ] No key is offered on an app that never renders it. (F1)
- [ ] Every section on/off switch shown for an app actually hides that section on that app. (F2)
- [ ] `order_status_*` and `menu_page_subtitle` are gone from the hub. (F3, F4)
- [ ] Setting a favicon changes the browser-tab icon on the **order app** as well as the website. (3.2)
- [ ] The 42 genuinely-shared keys keep their Same/Different control and per-app values.
- [ ] A hygiene test fails if a future key is declared for an app that does not consume it.
- [ ] Backend suite green against the baseline recorded at start; admin + order app builds green; committed bundles match fresh builds.

---

## 7. Out of scope

- Building a menu-banner feature for the retired `order_status_*` keys.
- Adding server-side rendering to the order app for meta/OG tags.
- Adding Featured / Social-proof / CTA sections to the order app layout.
- Any change to the 42 shared keys' values or behaviour.

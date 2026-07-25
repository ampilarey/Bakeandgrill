# TV Signage / Digital Menu Board — Implementation Plan (Revision 2)

**Status:** Ready to build (phased)
**Revision 2 principles:** single café today, a *few* TVs, future multi-branch. Reuse what already
exists (public menu API, Media Library, HeroSlides, MenuImageSlider video, PrayerTimes domain,
multi-store `store_id`). Keep it a **restaurant signage platform**, not a design tool — **no** Canva/
PowerPoint/free-form/timeline editors. Every added capability must have a clear café operational
benefit. Non-transactional, additive, resilient for all-day unattended playback.

**Phasing (so Cursor builds in the right order):**
- **Phase 1 (core board):** data model, playlists, screens & groups, smart menu slides + custom slides,
  layout templates, transitions/effects, theming, dynamic variables, day-part + **scheduled campaigns**,
  **weighted slides**, **emergency override**, **prayer break**, burn-in protection, preview, QR slides,
  the public signage page, and the pro **template** studio.
- **Phase 2 (device ops):** lightweight **device pairing**, **heartbeat/health**, **remote commands**,
  diagnostics. Poll-based, no push infra. Ship Phase 1 first; Phase 2 slots in without redesign.

---

## 1. Data model (Rev 2 — small tables instead of one JSON blob)

The v1 draft stored everything in a single `signage_config` SiteSetting JSON. With multiple screens,
groups, campaigns, and (Phase 2) devices, that blob becomes hard to edit safely and diff. Rev 2 uses a
**few light tables**; **slides stay JSON inside a playlist** (they are presentational — a row-per-slide
is over-modelling). All tables carry a nullable **`store_id`** (reuse the multi-store foundation) so
multi-branch is a data concern, not a rewrite.

| Table | Key columns | Purpose |
|---|---|---|
| `signage_playlists` | id, name, `slides` (json), `theme` (json), store_id, is_active | Ordered slides + theme. |
| `signage_groups` | id, name, playlist_id, `theme` (json, nullable override), orientation, refresh_seconds, store_id | A group of screens sharing config. |
| `signage_screens` | id, name, group_id (nullable), playlist_id (nullable override), orientation, resolution, refresh_seconds, `fallback` (json), `overrides` (json), store_id | One physical TV. |
| `signage_campaigns` | id, name, playlist_id (or `slides` json), date_start, date_end, `days` (json 0–6), `windows` (json start/end), priority (int), is_active, store_id | Date-ranged / seasonal overrides (Ramadan, Eid, Fri, holidays). |
| `signage_devices` *(Phase 2)* | id, screen_id, pairing_code, approved (bool), `last_seen_at`, `meta` (json), store_id | A registered browser/TV. |

**Config resolution order for a screen at request time** (each later layer overrides the earlier):
`group.theme/playlist` → `screen.playlist/overrides` → active **campaign** (highest `priority`, matching
date/day/window) → **prayer break** (if within window) → **emergency override** (global, wins over all).
The resolver returns the final effective playlist + theme + orientation + refresh interval.

> Slides JSON per playlist: `[{ id, type, template, transition, transition_ms, effects[], seconds,
> weight, refs… , overrides{} }]`. `weight` drives weighted rotation (see §3.3).

---

## 2. Public signage page (order app)

- Standalone routes **`/order/tv/{screen}`** (screen slug/id; bare `/order/tv` = a "default" screen)
  **outside `AppShell`** — fullscreen, non-interactive, cursor hidden, best-effort **Wake Lock**.
- **Slide engine:** cycles the resolved playlist; per-slide **duration + layout template + transition**
  (fade/slide/zoom/dissolve/flip/push/cube/wipe + speed) + **effects** (Ken Burns pan/zoom, text/price
  entrance, animated % OFF badge). GPU-friendly CSS transforms. Video slides autoplay muted/looped for
  their length. Renders at the screen's **orientation** (16:9 / 9:16) and scales to the panel.
- **Silent auto-update:** every `refresh_seconds` (per screen/group, default 120s) re-fetch the resolved
  config + live menu/offers; if the **playlist version** changed, swap in on the next slide boundary (no
  hard reload, no flicker). Switch on day-part/campaign/prayer/emergency changes automatically.
- **Offline / failure recovery:** cache the last good config + menu payload in `localStorage`; on fetch
  failure keep playing the cached playlist and show a tiny "offline — showing last menu" corner note;
  retry with backoff. A failed slide asset (missing image/video) is **skipped**, not left blank, and
  reported in diagnostics (Phase 2). Never crash the loop — wrap each slide render in an error boundary.
- **Resilience for all-day runtime:** unmount/cleanup each slide's timers and `<video>` between slides
  (no leaks); periodic (e.g. hourly) soft self-check that the loop is advancing, else re-init; cache-bust
  on deploy via the page's build hash.
- **Burn-in protection:** static overlays (logo, clock, QR, standing text) drift a few pixels on a slow
  cycle; optional very-low-opacity full-screen pixel-shift every N minutes. Subtle, always on.

---

## 3. Slides — smart menu, custom, templates, weighting, variables

### 3.1 Smart menu slides (auto — no manual duplication)
Auto-generated from live data, refreshed each cycle: `offers`, `todays_special`, `new` (created within
`menu_new_days`), `bestsellers` (existing bestseller signal / top-N), `chef_recommendation`
(a per-item flag or a curated list), `combos` (combo items), `category_highlight`, `featured_product`.
The admin adds a *slide of that type* to a playlist; content fills itself from the menu.

### 3.2 Layout templates (reusable, template-based — NOT a canvas)
`hero`, `menu_grid` (price-board of a category), `promotion`, `qr`, `notice`, `video` (full-screen),
`split` (image + text/price), `full_screen`. Each template takes structured fields + media + theme.
Reused across screens. This is the "professional look" without a freeform designer.

### 3.3 Weighted playlists (priority, no duplicate entries)
Each slide has a `weight` (or `every_minutes`/`every_nth`). The engine builds the rotation so a
high-weight slide (e.g. a promotion) recurs more often (e.g. every ~3 min) **without** the admin pasting
it multiple times. Deterministic interleave, not random, so it looks intentional.

### 3.4 Dynamic variables (text interpolation)
Templated text supports `{{branch_name}}`, `{{current_time}}`, `{{today}}`, `{{next_prayer}}`,
`{{wifi_name}}`, `{{wifi_password}}`, `{{promotion_name}}`. Resolved client-side each render (time/prayer
are live). Values come from settings (wifi, branch) + PrayerTimes + the active campaign/promo. Unknown
variables render blank (never show raw `{{…}}`).

---

## 4. Scheduling — day-parts, campaigns, emergency, prayer

### 4.1 Day-parts + scheduled campaigns
- **Day-parts:** a playlist/screen can carry time windows (breakfast/lunch/dinner) — the resolver picks
  the matching window.
- **Campaigns (`signage_campaigns`):** date-ranged/seasonal overrides — Ramadan, Eid, weekends, Friday,
  public holidays, seasonal promos — scheduled **in advance** by marketing. Highest-`priority` active
  campaign whose date/day/window matches wins over the base playlist. This subsumes ad-hoc day-parting
  into one scheduling model.

### 4.2 Emergency override (global, auto-resume)
A single global **emergency mode** (`signage_emergency` setting): `closed`, `prayer_break`,
`maintenance`, `fire_alarm`, `power_failure` (informational), `kitchen_closed`. When set, **every** screen
shows the matching full-screen slide (branded, from a template) and normal playback pauses. Clearing it
**auto-resumes** the previously resolved playlist. One toggle in admin; wins over campaigns/day-parts.

### 4.3 Prayer break (reuse PrayerTimes domain)
Using `App\Domains\PrayerTimes` (already in the app): show a **next-prayer countdown** overlay/slide;
at prayer time, auto-switch to a **prayer-break slide** for an admin-configurable duration, then
**auto-resume**. Admin toggles which prayers trigger a break + the break length. This is high café value
and reuses existing infrastructure.

---

## 5. Multiple screens & groups

- **Screens** = physical TVs (`signage_screens`), each with its own playlist (or inherited from its
  group), orientation, resolution, refresh interval, and fallback playlist.
- **Groups** (`signage_groups`) = "Dining TVs", "Cashier", "Outdoor", "Kitchen Notice", "Waiting", future
  "Drive-through". A screen **inherits** its group's playlist/theme/orientation and may **locally
  override** any field. Configure the group once; screens follow.
- URL per screen: `/order/tv/{screen}`. A new TV with no assignment falls back to a safe default
  playlist so it always shows something.

---

## 6. Device layer — **Phase 2** (lightweight, poll-based)

Only if/when you run several TVs. No push infra, no complex auth — the TV is just a browser polling.

- **Registration / pairing:** first load of `/order/tv` (unassigned) generates a device id (localStorage)
  + shows a **6-char pairing code**; admin **approves** it and **assigns to a screen/group**. Done.
- **Heartbeat:** each device `POST /signage/heartbeat` every ~60s with `{device_id, screen, current_slide,
  playlist_version, browser, resolution, cache_status, failed_assets, mem?}`. Updates `last_seen_at` +
  `meta`. This *is* the diagnostics payload (§17 rolled into heartbeat — no separate system).
- **Health view (admin):** per device — online/offline (last-seen threshold), current playlist + slide,
  software/build version, last sync, resolution. A simple list, not an NOC dashboard.
- **Remote commands (poll):** the heartbeat response returns any queued command for that device:
  `refresh`, `reload_cache`, `restart`, `skip`, `pause`, `resume`, `black_screen`, `maintenance`. The TV
  executes on receipt. Admin queues them from the health view. No websockets needed.

> Rationale: this gives the operational wins (remote refresh, "is that TV alive?") with one table + two
> endpoints + polling the app already does. Full MDM (per-device OTA, screenshots, alerts) is **out of
> scope** for a café.

---

## 7. Admin — "TV Menu / Signage" studio

Reuses the admin design system. Sections:
- **Screens & Groups:** create groups + screens, assign screens to groups, set orientation/resolution/
  refresh/fallback, and per-screen overrides. Show which playlist each screen resolves to *now*.
- **Playlists (pro template studio):** ordered slides with a **templates gallery** + layout picker;
  **WYSIWYG live preview** on a canvas at true TV aspect (16:9 **and** 9:16); Media Library picker for
  images/videos; per-slide **duration / transition / effect / weight** controls; add / **duplicate** /
  drag-reorder / delete. **Theming:** brand colors, font pairing, background (solid/gradient/image/video),
  overlay opacity, corner logo, rounded/sharp — global + per-slide override. (Template-based, **not** a
  freeform canvas.)
- **Campaigns:** schedule date-ranged/seasonal playlists with priority + day/window (Ramadan/Eid/Fri/…).
- **Emergency:** one-click emergency mode selector (with auto-resume) — prominent, owner-gated.
- **Prayer:** toggle prayer-break, choose prayers + duration (reads PrayerTimes).
- **Preview system:** preview any playlist/screen at **desktop / landscape TV / portrait TV / 1080p /
  4K** before publishing; "Preview playlist" full-screen.
- **Devices & Health (Phase 2):** pending pairings to approve, device list with status + remote command
  buttons.
- **Per screen:** the **TV URL + generated QR** + "Open on this screen" + copy-link.
- Permission-gated (`signage.manage`; owner-only for Emergency). All writes audit-logged.

---

## 8. API

**Public (no auth):**
- `GET /signage/{screen?}` → the **fully resolved** effective config for that screen right now
  (playlist + theme + orientation + refresh + effective slides after group/screen/campaign/prayer/
  emergency resolution) + top-N bestsellers + `menu_new_days`. Cached with a short TTL + a
  `playlist_version` the page compares to avoid needless swaps.
- Menu/offers come from the existing public endpoints (`/categories`, `/items`, `/offers`).
- *(Phase 2)* `POST /signage/heartbeat` → upsert device, return queued command.

**Admin (`permission:signage.manage`, audited):**
- CRUD `/admin/signage/playlists`, `/groups`, `/screens`, `/campaigns`.
- `PUT /admin/signage/emergency`, `PUT /admin/signage/prayer`.
- *(Phase 2)* `GET /admin/signage/devices`, `POST /admin/signage/devices/{id}/approve`,
  `POST /admin/signage/devices/{id}/command`.

**Caching/queue:** resolved-config responses are cached (bust on any signage write, reuse the app's cache
pattern); no queue needed (all synchronous, small payloads). Bestseller aggregation can reuse existing
reporting/caching.

---

## 9. Media

Reuse the **existing Media Library** (folders/collections, tags, search, replace, video, optimize,
usage) — do **not** rebuild media management for signage; the slide media picker is the Media Library
picker. The only small nicety worth adding: **unused-asset detection** already partially exists via
`MediaUsageResolver` + `PruneUnreferencedMedia` — extend usage scanning to include `signage_*` refs so
signage media counts as "in use." Nothing else in §13 is needed — it's built.

## 10. Multi-branch readiness (data-model only)
Every signage table carries `store_id` (reuse the multi-store foundation). Today everything is one store
(`store_id` = the single/default store). Branch-specific branding/announcements = a playlist/theme per
`store_id`; **shared corporate campaigns** = a campaign with `store_id = null` (applies to all). No
multi-branch **UI** is built now — but the schema means adding branches later is configuration, not a
migration/rewrite.

---

## 11. Testing
- **Resolver (backend):** correct effective playlist for a screen given group inheritance + screen
  override + an active campaign (priority) + a prayer window + emergency (emergency wins; auto-resume
  after clear). `store_id=null` corporate campaign applies to all stores.
- **Slides:** weighted rotation recurs a high-weight slide at the target cadence without duplicates;
  dynamic variables interpolate (and blank unknowns); smart slides pull live menu data.
- **Signage page (Vitest):** renders the resolved playlist; applies per-slide transition + effect
  classes; advances on the timer; autoplaying muted `<video>` for video/Ken-Burns; a missing asset skips
  the slide; offline uses cached config; no interactive chrome.
- **Phase 2:** heartbeat upserts device + returns a queued command; health list reflects online/offline
  by last-seen; pairing approve assigns a screen.
- **Admin:** studio renders templates + preview at both orientations; saves slide template/transition/
  effect/weight/theme; campaign scheduling; emergency toggle; permission-gating + audit.

## 12. Deploy / rollback
Additive, non-transactional. `php artisan migrate --force` (new signage tables). Ship **default** group/
screen/playlist + default theme so any TV opened shows a polished board pre-setup. Rebuild + sync
`backend/public/order` (bump order SW `CACHE_VERSION`) + `backend/public/admin`; `view:clear`. Rollback =
revert; signage tables are self-contained (nothing else references them).

---

## Appendix — explicitly OUT of scope (keep it a signage platform)
No PowerPoint/Canva editor, no free-form page designer, no complex animation/timeline editor, no full
MDM (OTA firmware, screenshots, alerting). Templates + theming deliver the professional look;
poll-based devices deliver the ops wins — without turning a café tool into an enterprise platform.

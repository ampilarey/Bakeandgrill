# Social Sharing & Auto-Posting Plan

Status: **approved, not yet built** (owner: "later we will build").
Date: 2026-08-28.

Two features that reinforce each other:

1. **Share buttons** — customers share items / menu / specials from the website
   to any app on their phone or computer, or copy the link. Zero credentials,
   pure frontend + meta tags.
2. **Social Hub** — the business auto-posts daily specials and other content to
   its own social accounts on a schedule, including auto-generated videos built
   from item photos.

Every auto-post links back to an item's public page, which feature 1 makes
preview beautifully — that's the flywheel.

---

## Current state (verified 2026-08-28)

- Every public Blade page already ships Open Graph + Twitter-card tags
  (`backend/resources/views/layout.blade.php` lines ~161–176), so shared links
  render preview cards today. **But** item pages reuse the generic site
  `$ogImage` — a shared Masroshi link previews the logo, not the Masroshi.
- Each item has its own public page: `GET /menu/{item}`
  (`MenuPageController@show`, `resources/views/menu-item.blade.php` — it
  overrides `title`/`description` sections but not the OG image).
- **No share buttons anywhere** on menu/items/specials. The only
  `navigator.share` usage in the codebase is the referral share on the order
  app's Rewards page (`apps/online-order-web/src/pages/RewardsPage.tsx:207`).
- Items support **multiple photos** (`item_photos` table, `ItemPhotoController`
  with ordering) — raw material for slideshow videos.
- Social platforms exist only as footer links (`social_facebook`,
  `business_whatsapp`, `business_viber` in Business Details). Nothing posts.
- Infrastructure already in place and reusable: Laravel scheduler (runs every
  minute — powers the heartbeat), Redis queue worker, the campaign fan-out
  pattern (`SmsCampaign` → queued `SendSmsCampaignRecipientJob`), and a
  failure-alerting path (SMS/notifications).

---

## Feature 1 — Share buttons (customers → anywhere)

No platform APIs involved. On phones, `navigator.share` opens the native share
sheet and the customer picks WhatsApp / Viber / Telegram / IG DM / SMS /
anything installed. On desktop, a fallback popover offers Copy link plus
WhatsApp / Telegram / Viber / Facebook / X share URLs (plain URL schemes, no
keys). This covers TikTok and WhatsApp — the platforms whose business APIs are
hard — by letting customers do the distribution.

### Scope

- **Share button** on:
  - item detail page (`/menu/{item}`, Blade)
  - menu page cards (`/menu`, Blade)
  - specials / offers section (public site)
  - item view inside the order app (`apps/online-order-web`)
- Behavior: `navigator.share` where supported; otherwise popover with
  **Copy link** + per-app share links. Always include Copy link.
- **Per-item OG image** — `menu-item.blade.php` must emit the item's photo as
  `og:image` (fall back to site image when the item has none). This single
  change upgrades every share AND every manual paste of an item link into a
  Viber/WhatsApp group. Layout needs an overridable OG-image section instead
  of the fixed `$ogImage`.
- **Shareable specials** — ensure each special/offer resolves to a clean
  public URL (item page anchor or a specials page section) so it can be
  shared at all.
- **Share counting (optional)** — tag generated links `?src=share`; small
  "most shared items" stat in admin later.

### Non-goals

No login walls, no per-customer tracking, no share-to-earn (loyalty tie-in is
a possible later idea, not this feature).

---

## Feature 2 — Social Hub (business → platforms)

### Platform reality matrix

| Platform | Auto-post? | Notes |
|---|---|---|
| Facebook Page | ✅ full | Meta app + long-lived Page token (one-time, free). Text, photo, video posts. |
| Instagram | ✅ full | Same Graph API token (IG business account linked to the FB Page). **Every post needs an image**; image must be at a public URL (item photos already are). Reels publishable via API. |
| Telegram | ✅ full | Bot token, 5-minute free setup. Text/photo/video to a channel. |
| Viber channel | ✅ full | Viber bot key (free). Popular in Maldives — worth having. |
| X / Twitter | ⚠️ yes, but | Free API tier ≈ 500 posts/month — enough for specials, but X changes rules often. Build the driver only if wanted. |
| TikTok | ❌ semi-manual | Posting API requires an approved developer app and is video-first. We generate the perfect 9:16 video + a download button; owner uploads in-app. |
| WhatsApp | ❌ different beast | No "posting" concept. Business Cloud API = paid template messages to opted-in numbers with strict rules — a separate, later project. SMS campaigns already cover direct reach. |

### Architecture

Drivers behind one interface so platforms are plug-ins, not rewrites:

- **Tables**
  - `social_channels` — platform, display name, **encrypted** credentials,
    enabled flag.
  - `social_posts` — caption, media (photo/video reference), created_by,
    scheduled_at, source (manual | automation:daily_special | …).
  - `social_post_deliveries` — one row per post × channel: status
    (pending/sent/failed), platform post id/permalink, error text, timestamps.
- **Services**
  - `SocialPublisher` — resolves channels, dispatches one queued delivery job
    per channel; retries with backoff; failure alerts through the existing
    notification path so a dead token never fails silently.
  - Per-platform drivers implementing one interface (`publishText`,
    `publishPhoto`, `publishVideo` as supported): `FacebookPageDriver`,
    `InstagramDriver`, `TelegramDriver`, then `ViberDriver`, `XDriver`.
- **Automations** (scheduler-driven)
  - "Post active daily specials at HH:MM" — skips silently when nothing is on
    special; photo post by default, video where the renderer is enabled and
    the item has photos.
  - "Announce an offer when it starts" / "announce a new item".
  - Caption templates with variables (`{item}`, `{price}`, `{name_dv}` …),
    per-automation on/off, per-platform toggles.
- **Admin UI: Social Hub page**
  - Channel connections (enter/rotate tokens, test-post button).
  - Compose: text + photo/video, choose channels, post now or schedule.
  - Queue + history with per-platform status and permalinks.
  - Automation settings.
  - Gated by a new `marketing.social` permission (manager-grantable — this is
    marketing, not costing).
- Credentials live in the DB **encrypted** (Laravel `encrypted` cast), never
  in the repo. `.env` keeps only the Meta app secret if needed.

### Video renderer (template videos from item photos)

Deterministic server-side rendering with **ffmpeg** — not generative AI.
Takes an item's photos and renders a short (10–15 s) branded clip: slow
zoom/pan (Ken Burns), crossfades, name + price overlay (EN/DV), brand
intro/outro card. One render job emits per-platform variants:

| Format | Size | For |
|---|---|---|
| Vertical 9:16 | 1080×1920 | IG Reels/Stories, TikTok, FB Reels |
| Square 1:1 | 1080×1080 | IG/FB feed |
| Landscape 16:9 | 1280×720 | FB feed, Telegram/Viber |

- `VideoRenderService` + queued render job (one at a time; renders are light
  enough for shared hosting when queued).
- "Generate video" button on items/specials in admin, with preview before
  posting; automation option "daily special posts as video where photos
  allow, else photo post".
- Requires ≥ 1 photo; 2–4 photos make a good clip.
- **Audio: silent by default** (no copyrighted music — muted/flagged posts;
  IG/TikTok in-app audio performs better anyway). Optional bundled
  royalty-free track behind a toggle.
- **Pre-flight (do during Phase 2):** verify ffmpeg on the cPanel host — if
  absent, a static ffmpeg binary in the account's `~/bin` almost always
  works. Confirm on TEST before Phase 3 starts.

### Explicitly deferred

- TikTok API posting (app approval process; generate + manual upload instead).
- WhatsApp broadcast (paid, compliance-heavy; separate project).
- AI-generated video (paid third-party APIs, inconsistent food quality;
  possible later bolt-on behind the same renderer interface).
- Stories via API (restricted; manual).

---

## Build order

| Phase | Contents | Needs from owner |
|---|---|---|
| **1** | Share buttons everywhere + per-item OG images + shareable special URLs | nothing |
| **2** | Social Hub core (tables, publisher, admin page, `marketing.social`) + FB/IG/Telegram drivers + daily-special automation. ffmpeg pre-flight on TEST. | Meta app + Page token, Telegram bot token (checklist below) |
| **3** | Video renderer + Reels publishing + TikTok download button | nothing new |
| **4** | Viber driver; X driver if wanted | Viber bot key; X API key |

Photo posting first (Phase 2) proves the pipeline and credentials; video rides
on a working system.

## Owner credentials checklist (needed at Phase 2, not before)

1. **Meta**: create a free app at developers.facebook.com → add the
   *Facebook Login* + *Instagram Graph API* products → link the Instagram
   account to the Facebook Page as business/creator → generate a long-lived
   **Page access token** with `pages_manage_posts`,
   `instagram_content_publish` (exact click-by-click will be provided when
   Phase 2 starts). Own-page posting works without Meta app review.
2. **Telegram**: message @BotFather → `/newbot` → copy the token → add the
   bot as admin of the channel to post to.
3. *(Phase 4)* **Viber**: create a bot at partners.viber.com → copy the key.
4. *(Phase 4, optional)* **X**: developer account, free tier, API key/secret.

Tokens are handed over out-of-band and entered in the admin Social Hub
connection screen (stored encrypted) — never committed to the repo.

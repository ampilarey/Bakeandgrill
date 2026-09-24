# Social Sharing & Auto-Posting Plan

Status: **Phase 1 shipped 2026-08-28** (durable item/offer pages, per-item OG
metadata, share controls). **Phase 2 built 2026-08-28** (Social Hub core:
channels with encrypted write-only credentials, manual composer with frozen
snapshots, FB/IG/Telegram drivers, delivery state machine, fail-closed
environment guard, clone-script sanitization). **Phase 3 built 2026-08-28** (approval queue + guarded daily-special automation). **Phase 4 built 2026-08-28** (video renderer + benchmark gate + social queue; enable per host only after social:video-benchmark passes on TEST). **Phase 5 Viber driver built 2026-08-28** (Channel post API + signed webhook; lazy guarded webhook registration). X deliberately unbuilt — gated on the owner accepting current X API pricing with a spend cap.
Rev 2, 2026-08-28 — incorporates external review findings (durable links,
delivery reliability, TEST safety, reuse of existing video infrastructure,
corrected platform facts).

Two features that reinforce each other:

1. **Customer sharing** — share items / menu / specials from the website to
   any app on phone or computer, or copy the link. Zero credentials.
2. **Social Hub** — the business posts daily specials and other content to its
   own social accounts, first manually, then on an approved schedule,
   eventually with auto-generated videos built from item photos.

Every post links back to a durable public item/offer page, which feature 1
makes preview correctly — that's the flywheel.

---

## Current state (verified in-repo, 2026-08-28)

- Public Blade pages ship site-wide Open Graph + Twitter-card tags
  (`resources/views/layout.blade.php` ~161–176) but item pages
  (`menu-item.blade.php`) reuse the generic `$ogImage` — a shared item link
  previews the logo, not the dish.
- `GET /menu/{item}` is server-rendered (`MenuPageController@show`) — the
  right share target. **But it 404s when an item is inactive or
  unavailable** (`is_active`/`is_available` filters before `findOrFail`), so
  links in old social posts die the moment an item is snoozed or retired.
- The order app (`/order/...`) is an SPA — crawlers get no item-specific
  metadata from its URLs. Not shareable as-is.
- No share buttons on menu/items/specials. Only `navigator.share` usage is
  the referral share (`RewardsPage.tsx:207`).
- Menu cards use a **stretched card link** (`.menu-card-link::after`) plus a
  favourite button — a permanent large Share button would conflict.
- Items support multiple photos with thumb/original/WebP renditions
  (`item_photos`, `ItemPhotoController`, `MenuImageProcessor`).
- **Video infrastructure already exists**: `VideoProcessor`
  (`app/Domains/Media/Services/VideoProcessor.php`) with ffmpeg/ffprobe
  capability checks, configured binary paths for cPanel's thin php-fpm PATH
  (`media.ffmpeg_path`), a Video Studio (`VideoStudioController`), media
  library assets, and item video support. **Do not build a parallel ffmpeg
  foundation.**
- Deploy starts **one general Redis queue worker**
  (`full-deploy.sh`: `queue:work redis`) shared by payments/SMS/webhooks —
  no queue separation today.
- `scripts/clone-live-to-test.sh` copies the **live database + public media
  into TEST**. Anything stored in the live DB (social credentials included)
  would land on TEST on every clone.
- Reusable building blocks: scheduler (every minute), campaign fan-out
  pattern (`SmsCampaign` → queued per-recipient jobs), failure-alert path,
  `EffectivePriceService` (the only correct source of display prices).

---

## Feature 1 — Durable links, metadata, and customer sharing

### 1a. Canonical, durable share URLs

- Every share — from the Blade site **and** the React order app — uses the
  canonical server-rendered URL `https://bakeandgrill.mv/menu/{id}`. Never
  share `/order/...` URLs (SPA; no crawler metadata).
- **Offers/specials get stable public landing pages** (e.g.
  `/offers/{slug-or-id}`), server-rendered with their own OG metadata.
  Anchors (`/menu#offers`) are not shareable targets — an anchor cannot
  carry its own OG tags.
- **Durable post-click experience:** `/menu/{item}` must stop 404ing for
  known-but-unavailable items. Old links from social posts resolve to a
  useful page: item name/photo, an honest "currently unavailable" state,
  and alternatives (category items / today's menu link). True 404 only for
  ids that never existed. Same pattern for expired offer pages: show
  "offer ended" plus current offers — never a dead link.
- **Expired-special pricing:** landing pages always render the *current*
  effective price via `EffectivePriceService`. An ended special shows the
  normal price with the promo clearly marked ended. Captions in social
  posts carry the offer's end date where one exists (see snapshots, 2c) so
  a stale post is self-explanatory rather than misleading.

### 1b. Metadata (OG/Twitter)

- Add overridable Blade sections for `og:image`, `twitter:image`, `og:url`
  (canonical), and image **alt text**; `menu-item.blade.php` and the offer
  pages fill them per-entity.
- Social image = the existing **full-size item-photo rendition** (absolute,
  publicly reachable, JPEG — not the card thumbnail, not WebP-only).
  Fallback: item without a photo → site default OG image; never a broken
  URL.
- **Acceptance tests** (Blade/HTTP tests): item with photo emits its own
  og:image/alt/canonical; a special page emits its own metadata; a
  no-photo item falls back to the site image.

### 1c. Share controls

- **Item detail page**: primary Share button.
- **Compact menu cards**: no large permanent Share button (conflicts with
  the stretched link + favourite control). Use a small accessible
  action/overflow control — or rely on the detail page as the share point.
- Native Web Share (`navigator.share`) fired only from the user's click.
  Fallback popover: **Copy link** (with a select-and-copy fallback when the
  Clipboard API is unavailable, e.g. non-HTTPS/older browsers) plus
  WhatsApp / Telegram / Viber / Facebook / X intent URLs with properly
  encoded parameters. Keyboard accessible (focus trap, Escape, aria).
- **Share counting is optional and honest**: a `?src=share` tag measures
  *clicks on shared links*, not shares. If counting is added, record only
  privacy-preserving aggregate share/copy attempts — no customer identity,
  no share-to-earn mechanics.

---

## Feature 2 — Social Hub

### 2a. Platform reality matrix (corrected)

| Platform | Auto-post? | Notes |
|---|---|---|
| Facebook Page | ✅ full | Meta app + long-lived Page token. Text/photo/video. Requires a real **connection preflight** (see checklist) — not an assumption that app review is never needed. |
| Instagram | ✅ full | Same Graph API token; IG business account linked to the Page. Image required per post; media must be at a public URL. Publishing is **asynchronous**: create media container → poll status → publish. Reels supported. |
| Telegram | ✅ full | Bot token **plus destination channel/chat ID**, with verified bot-admin permission on the channel. |
| Viber Channel | ⚠️ possible, not trivial | Requires the Channel **super-admin's channel auth token**, super-admin sender ID, and a valid **HTTPS webhook**. Media must be publicly hosted and within Viber's size/format constraints. Not a simple "free bot key". |
| X / Twitter | ⚠️ optional, paid | Do **not** rely on a free tier. Treat as paid usage: verify current pricing before enabling, set a spending cap and alerting. Build only if the owner accepts the budget. |
| TikTok | ❌ semi-manual | Generate the 9:16 video + download button; owner uploads in-app. API posting needs an approved developer app — deferred. |
| WhatsApp | ❌ deferred | No "posting" concept; Business Cloud API = paid template messages to opted-in numbers. Separate project; SMS campaigns already cover direct reach. |

### 2b. Driver architecture (capability-based)

`SocialPublisher` + per-platform drivers, but drivers declare
**capabilities** (text, photo, video, async-container flow, max media size,
format constraints) rather than a fixed `publishText/Photo/Video` trio. The
publisher composes against declared capabilities, so IG's container/poll
flow, Viber's webhook needs, and Telegram's chat-id addressing all fit one
interface without lying about symmetry.

### 2c. Data model & delivery reliability

- **Immutable post snapshots.** When a post is scheduled, freeze: final
  caption per language, destination URL, price/terms as displayed, offer
  end date, the selected media rendition (by id + fingerprint), and source
  references (item/special ids). Publishing uses the snapshot; later edits
  to the item never silently change a scheduled post.
- **Delivery state machine**: draft → awaiting_approval → scheduled →
  queued → processing → published | partial_failure | failed | skipped |
  cancelled | **unknown**. `social_posts` carries the overall state;
  `social_post_deliveries` one row per post × channel with provider
  post/container ids, permalink, attempt history, and **classified errors**
  (auth / validation / rate-limit / transient / unknown).
- **Idempotency.** DB uniqueness on
  (automation, source id, Maldives business date, channel) so scheduler
  restarts, retries, and worker timeouts cannot double-post publicly.
  Delivery jobs are idempotent against their delivery row.
- **Unknown outcomes are not retried blindly.** A timeout after the
  provider may have accepted the post marks the delivery `unknown`;
  a reconcile step (query the provider / check for the container id)
  resolves it before any retry.
- **Pre-publish revalidation.** Immediately before each publish: recheck
  item sellability (active/available/stock), special expiry, and price via
  `EffectivePriceService` — never compute caption prices from
  `items.base_price`. All schedule/expiry decisions use Maldives time
  (`Asia/Male`, UTC+5) explicitly, not server-default UTC. On failure the
  delivery is `skipped` with a reason, not published wrong.
- **Posting policy** (configurable): max posts/day per channel, selection
  rule when several specials are active (e.g. rotate; prefer photographed
  items), quiet hours, and behavior when no suitable photo exists (skip,
  or FB-text-only — never post a broken/placeholder image). Goal: no
  follower spam.
- **Rollout gate:** automation launches in **approval mode** — it drafts
  the post, someone with `social.publish` approves. Unattended posting is
  enabled per-automation only after an observed pilot (e.g. 2 weeks of
  approved posts with no corrections).
- **Alert rate-limiting:** failures alert through the existing
  notification path, but grouped and rate-limited (e.g. one alert per
  channel per hour, escalation on repeated auth failures) — an expired
  token must not SMS staff in a loop.

### 2d. Permissions

Granular, not one blanket slug:

| Slug | Grants | Default |
|---|---|---|
| `social.view` | see Social Hub, history, queue | manager-grantable |
| `social.compose` | create/edit drafts | manager-grantable |
| `social.schedule` | schedule drafts | manager-grantable |
| `social.publish` | approve / post now | manager-grantable, deliberate |
| `social.channels.manage` | connect channels, rotate/revoke tokens, webhook config | **owner-only** |

### 2e. Secrets

- Channel credentials stored with Laravel's `encrypted` cast, **write-only**:
  never returned by any API, redacted in admin responses (last-4 style at
  most), never written to logs, exceptions, or audit trails. Token entry
  and rotation live behind `social.channels.manage`.

### 2f. TEST safety (hard requirement)

`scripts/clone-live-to-test.sh` copies live DB + media to TEST, so live
social credentials would otherwise arrive on TEST and the TEST
scheduler/queue could post to the real accounts. Required:

- The clone script **sanitizes on every run**: null all `social_channels`
  credentials and remote account ids, disable all channels and automations,
  cancel scheduled posts.
- **Environment guard, fail closed:** publishing is refused unless
  `app.env === 'production'` **or** the environment is explicitly
  configured with separate test channels/credentials
  (`SOCIAL_PUBLISH_ALLOWED=true` + test-channel flag on the channel row).
  Default on TEST/local: refuse and log.
- TEST rehearsals use dedicated test accounts/channels only.

### 2g. Webhooks (Viber; any future platform callbacks)

Signature verification on every request, webhook secrets rotatable, routes
narrowly scoped (no wildcard controllers), replay protection where the
platform supports it, and responses/logs never disclose tokens.

---

## Video renderer (reuses existing media infrastructure)

A queued **social-composition renderer** on top of the existing
`VideoProcessor` / media-library stack — same configured ffmpeg/ffprobe
binaries (`media.ffmpeg_path`), same storage conventions. No parallel
ffmpeg foundation.

- Composes an item's real photos into a short branded clip (Ken Burns,
  crossfades, name + price overlay EN/DV, intro/outro card). Silent by
  default (no copyrighted audio; optional bundled royalty-free track).
- Output variants: 1080×1920 (Reels/Stories/TikTok), 1080×1080 (feed),
  1280×720 (FB/Telegram/Viber) — resolutions subject to the benchmark
  below; start conservative (e.g. 720-class) and raise only after
  measuring.
- **Separate queue, separate worker.** Renders run on a dedicated
  single-concurrency, low-priority `social` queue so they can never delay
  payments, orders, or SMS. This requires deploy changes:
  `full-deploy.sh` and the worker keepalive currently manage one general
  worker; they must start/monitor the second worker
  (`queue:work redis --queue=social --max-time=...`) on both TEST and
  production.
- **ffmpeg preflight is a hard gate, not an assumption.** On TEST, measure
  real render time, CPU, memory, disk usage, process permissions, output
  size, and temp-file cleanup with representative photos. Phase 4 starts
  only if the benchmark passes within shared-hosting limits.
- **Rendition records:** each render stores media type, MIME, dimensions,
  bytes, public URL, poster frame, and a **source fingerprint** (photo ids
  + name + price). Renders are invalidated and re-queued when source
  photos, name, or price change; retention/cleanup rules prune unused
  renders.
- **Real photos only:** automated video requires suitable actual item
  photos; the renderer must never build a clip from a placeholder or logo
  fallback by mistake.

---

## Testing & rollout requirements

- **Backend tests:** permission gates per slug; secret redaction (API
  responses, logs); encrypted casting round-trip; scheduling and
  business-date deduplication (restart/retry cannot double-post); retry vs
  `unknown`-outcome handling; pre-publish revalidation (price via effective
  pricing, stock, expiry, `Asia/Male` boundaries).
- **Driver tests** with faked HTTP for every platform, including IG's
  container/poll flow and failure classification.
- **Webhook signature tests** (valid, invalid, replayed).
- **Blade metadata tests** (item / special / no-photo fallback) and browser
  accessibility checks for the share controls (keyboard, no-clipboard
  fallback).
- **TEST rehearsal** against dedicated test channels/accounts before any
  production credential is entered.
- **Production first-post checklist** with explicit owner approval of the
  first post on each channel.
- **Isolation proof:** demonstrate on TEST that a running render does not
  delay ordinary queue jobs (orders/SMS) — measured, not assumed.

---

## Build order (revised)

| Phase | Contents | Needs from owner |
|---|---|---|
| **1** | Durable public item/offer landing pages (no more 404 for unavailable items), per-item/offer OG metadata + tests, customer share controls | nothing |
| **2** | Social Hub core: tables with snapshots + state machine, granular `social.*` permissions, encrypted channels, clone-script sanitization + environment guard, manual photo composer — **test-channel publishing only** | test-channel credentials (Meta preflight, Telegram bot + chat id) |
| **3** | Approval queue, then guarded daily-special automation (dedup, revalidation, posting policy, rate-limited alerts, pilot period) on production channels | production credentials; per-channel first-post approval |
| **4** | Video renderer — only after the cPanel ffmpeg benchmark passes; second worker in deploy; TikTok download follows | nothing new |
| **5** | Viber Channel driver (webhook + super-admin token); X only if owner accepts current API pricing with a spend cap | Viber channel token/webhook; X budget decision |

## Audit fixes (2026-09-24)

An audit of the shipped hub found fourteen gaps; all were fixed in three
commits the same day. What changed, for whoever maintains this next:

**Reliability**
- `social:check-channels` (daily 09:15) asks each enabled channel's platform
  whether the credentials still work and when the token expires (Meta
  `debug_token`; Telegram `getChat`; Viber `get_account_info`). The result
  lives in `social_channels.health` and shows on the Channels tab as a pill,
  with a "Check now" button. One SMS per new problem (token inside its last
  week, or a failed check); repeats only when the problem changes.
- The publish job's `failed()` hook (retries exhausted on a transient error)
  now records the attempt, marks the delivery and sends the same rate-limited
  alert as a hard failure. Before, it was silent.
- Caption limits are per platform and declared by each driver
  (`caption_max`, `caption_max_photo`): Telegram 1024 on a photo / 4096 text,
  Instagram 2200, Viber 7000. The store and update endpoints refuse a caption
  the chosen channels would cut; the composer shows the tightest limit.
- Schedule times: the composer sends ISO 8601 with the browser offset and the
  controller normalises to the app zone. (Eloquent stores an offset string's
  wall-clock unconverted — a phone set to Dubai scheduled an hour out.)
- The retry-count mismatch the audit listed (job `tries=3` vs the social
  worker `--tries=1`) was not real: publish jobs run on the default queue;
  the `social` queue's single try is for video renders, on purpose.

**Composer** (`apps/admin-dashboard/src/pages/social/`)
- Menu item search (`ItemSearch`), media library (`MediaPicker`), pasted URL.
  `GET /admin/social/item-preview` returns what linking an item freezes (photo
  or none — never the site logo, effective price, names, `/menu/{id}` link).
- A per-platform preview pane (`PostPreview`): page name, caption folded
  where Facebook/Instagram fold it, the photo in the platform's crop, the
  Facebook link card when there is a link and no photo.
- `PATCH /admin/social/posts/{id}` edits draft / scheduled / awaiting-approval
  posts; the snapshot is rebuilt (price re-frozen). Automation posts keep
  their item and channels so stale checks and dedupe keys still apply.
- Posts tab: pagination, status filter, "Show test posts" (channel test posts
  are hidden by default: `source=channel_test`), automation badges, Edit.
  The Channels tab's "Test post" watches its own delivery and reports the
  outcome in place.

**Automations** (`SocialAutomationSettings` kinds: `special`, `new_item`,
`featured`; settings keys `social_auto_{kind}_*`; shared `AutoPostDrafter`)
- *New on the menu* (`NewItemAutoPoster`, `auto_new_item`): one recent,
  sellable, photographed item per day, oldest first, each announced once
  (`source_ref item:{id}`); `max_age_days` (default 14).
- *Chef's pick* (`FeaturedItemAutoPoster`, `auto_featured`): on chosen
  weekdays (`days`), one `is_featured` item, least recently posted first.
  Pre-publish stale check also skips an item no longer featured.
- Both draft for approval by default (`unattended` off), never post twice a
  day, and skip photo-required channels without a real photo.
- `social:run-automations` fires each kind at its own time; `--force` runs all.

**Insights**
- `SocialDriverInterface::insights()`; Facebook (likes/comments/shares) and
  Instagram (likes/comments) implement it; Telegram and Viber return null.
  Stored in `social_post_deliveries.insights` + `insights_at`.
- `social:refresh-insights` (daily 09:30) refreshes last month's deliveries;
  `POST /admin/social/posts/{id}/insights` refreshes one post ("Refresh
  stats" on the Posts tab).

**Tests:** `tests/Feature/Social/{SocialChannelHealthTest, SocialComposerTest,
SocialAutomationsTest, SocialInsightsTest}.php` and the admin
`SocialHubPage.test.tsx` / `social.composer.test.ts`, which the page did not
have before.

Still unbuilt, on purpose: TikTok/WhatsApp/X posting (no usable API or the
pricing decision in phase 5). The weekly menu and opening-hours automations
landed in the shortlist below.

## Owner's shortlist (2026-09-24)

After the audit the owner asked for new features and enhancements and then
said "start all one after another"; seventeen landed in seven commits the
same day, the signage tie-in first. Grouped as built, for whoever maintains
this next.

**A. Connect with Facebook** (`MetaConnectService`, `SocialMetaConnectController`)
- OAuth in place of pasted tokens: `GET /admin/social/meta/connect` returns the
  dialog URL; Facebook returns to the public `GET /social/meta/callback`,
  which exchanges the code for a long-lived user token, lists the Pages and
  parks them in the cache for ten minutes under the `state`; admin then
  opens `/social?meta_connect=<state>`, shows the Pages (`meta/pending`) and
  creates the Facebook and linked Instagram channels (`meta/finish`).
- Needs `SOCIAL_META_APP_ID` / `SOCIAL_META_APP_SECRET` in `.env`
  (`config/social.php`) and `{APP_URL}/social/meta/callback` as a valid
  redirect URI on the Meta app. Without them the Channels tab keeps the
  manual credential form and says why.

**B. Announcements and the TV board** (`AnnouncementTemplates`,
`SocialAnnouncementController`, `POST /admin/social/announcements`)
- One text ("Closed Friday for prayers", "Ramadan hours", free text, with
  Dhivehi) goes to the chosen channels *and* the signage quick-notice line
  in one go; the reply lists which channels were skipped and why.
  `signage.manage` is checked in-controller only when a notice is asked for.
- Share buttons on the Menu page (`/social?compose=item:ID`) and Specials
  page (`/social?compose=special:ID`) open the composer pre-filled.

**C. Calendar, spacing rules, best times** (`SocialCalendarController`,
`SocialPostingRules`, `SocialBestTimes`; `pages/social/CalendarTab.tsx`)
- A month view of scheduled, published and automation slots; drag a draft
  onto a day to schedule it (`POST /admin/social/posts/{id}/move`).
- Rules (`site_settings`): `social_rules_min_gap_minutes`, `social_rules_max_per_day`.
  `conflict()` explains a clash in words; `nextFreeSlot()` rounds up to the
  quarter hour. Automations and "Post now" move to the next free slot
  instead of breaking a rule.
- `SocialBestTimes` ranks hours and weekdays by insights once there are
  five posts with stats; the composer and calendar show the hint.

**D. Back in stock, weekly menu card, Dhivehi**
- *Back in stock* (`BackInStockAutoPoster`, kind `stock`, event-driven from
  `ItemObserver::updated`): an item marked unavailable for at least a day
  and then available again is announced once. `EVENT_DRIVEN` kinds have no
  time-of-day.
- *Weekly menu* (`WeeklyMenuAutoPoster`, kind `weekly`, `WeeklyMenuCard`
  GD renderer): on a chosen weekday, one branded card of the week's
  specials, drawn in the brand fonts, posted as a photo.
- Captions carry an optional `caption_dv`; each channel has a `language`
  (`both` / `en` / `dv`) and `SocialPost::captionFor()` picks the text.
  Migration `2026_09_24_120000_social_channel_language`.

**E. Video and carousel** (`SocialMediaKindsTest`)
- The composer accepts a video (with poster) or two to ten photos; drivers
  declare `video` / `carousel` capabilities and the store endpoint refuses a
  channel that cannot take the media. Facebook and Instagram post reels and
  carousels through their two-step container flow; Telegram sends a video
  or media group; Viber gets the first photo with the caption.

**F. Engagement** (`SocialEngagementTest`; migration
`2026_09_24_130000_social_comments_links_shares`)
- *Comment inbox*: `social:sync-comments` (hourly at :20) pulls comments on
  the last two weeks' Facebook and Instagram posts into `social_comments`;
  ones that read like an order (a Maldivian mobile number, "how much",
  "deliver", the Dhivehi for price or bring) are flagged and the business
  phone gets one SMS an hour at most. Reply as the page, mark read.
- *Links that count*: every post's link goes out as `?s=<delivery id>`;
  `RecordSocialVisit` (web group) counts a hit once per visitor per hour in
  `social_link_visits` and leaves the `bg_social` cookie for a week;
  `OrderCreationService` stamps `orders.social_delivery_id` from it. The
  Posts tab shows visits and orders beside each delivery.
- *What customers share*: the website and order-app Share buttons report
  each share to the public, throttled `POST /api/share-events`
  (`item_share_events`); "Most shared by customers" opens the Automation
  tab with "Make a chef's pick" beside each dish.

**G. Approval on the phone, Monday digest, dry run**
(`SocialApprovalDigestDryRunTest`; migration
`2026_09_24_140000_social_channel_dry_run`)
- *Approval by SMS* (`SocialPostApproval`, `SocialApprovalPageController`,
  `resources/views/social-approve.blade.php`): when an automation drafts a
  post for approval, the business phone gets one text with a signed link,
  good for 24 hours, to `/social/approve/{post}`. The page shows the post
  and channels with Approve and Reject; each button is its own signed POST,
  so the page reloads and re-shares safely, and a decided post says so.
  The admin "Post now" on a draft uses the same service. Off switch:
  `social_approval_sms` (rules card on the Calendar tab).
- *Monday digest* (`social:weekly-digest`, Monday 09:20): one text to every
  owner and manager with a phone (or the business phone): posts sent by
  platform, the best post by likes + visits + orders, link visits and
  orders, unread comments, drafts waiting, and any channel whose token is
  about to expire. Silent when there is nothing to say. Off switch:
  `social_weekly_digest`; `--force` sends regardless.
- *Dry run* (`social_channels.dry_run`): a channel that records
  "Dry run — would have posted (photo): …" on the delivery (`status
  dry_run`, counted as done) and sends nothing. Checked before the
  environment guard, so TEST can rehearse an automation against a real
  channel row. Badges on the Channels and Posts tabs.

**H. Opening hours and closures** (`OpeningHoursAutoPoster`, kind `hours`,
`SocialHoursAutomationTest`; the last item of the original plan)
- Hours and closures are written through the generic site-settings
  endpoint, so nothing hooks a controller: on every `social:run-automations`
  tick the poster fingerprints `business_hours_json` + `business_closures_json`
  into `social_auto_hours_seen` and acts on a difference. First sight
  records and posts nothing; a disabled automation keeps the fingerprint
  current so switching it on does not dig up old changes.
- A closure added for today or a future day → the closure caption
  (`template`, variables `{day} {reason} {back} {link}`; "We're closed on
  Saturday 26 September (Staff outing). Back Sunday at 7:00 AM.") and a
  warning notice on the TV board until the end of that day. Past or removed
  closures are not news.
- Weekly hours changed → the changed-hours caption (`template_hours`,
  variables `{hours} {ramadan} {link}`, the week collapsed into runs) and an
  info notice for a week; when the hours read as Ramadan hours the caption
  opens "Ramadan Kareem!" and the notice celebrates.
- `signage` (default on) puts the TV line up even when no channel is
  chosen; the post is drafted for approval like every other automation.
  `AnnouncementTemplates` gained public `openingLine()`, `backLine()`,
  `dayLabel()` and `hoursSummary()` so the composer's templates and the
  automation say the same thing.

**Commands and schedule** (`routes/console.php`): `social:publish-due` and
`social:run-automations` every minute; `social:check-channels` 09:15;
`social:refresh-insights` 09:30; `social:sync-comments` hourly at :20;
`social:weekly-digest` Monday 09:20.

**Settings keys added:** `social_rules_min_gap_minutes`, `social_rules_max_per_day`,
`social_approval_sms`, `social_weekly_digest`, `social_auto_{weekly,stock,hours}_*`,
`social_auto_hours_seen`.

**Web routes added:** `GET /social/meta/callback` (public, throttled);
`GET /social/approve/{post}`, `POST …/approve`, `POST …/reject` (signed,
30/min); `POST /api/share-events` (public, throttled, CSRF-exempt).

## Owner setup checklist (Phase 2+, exact steps provided when reached)

1. **Meta (connection preflight, not just a token):** create the developer
   app; link the Instagram business account to the Facebook Page; capture
   the **Page id and IG account id**; generate a long-lived Page token with
   `pages_manage_posts` + `instagram_content_publish`; validate the token
   (`/debug_token`), then make a **test publish** on a test target and
   verify IG's container→poll→publish flow end-to-end. Budget the
   possibility that Meta requires app review for some path — verify, don't
   assume.
2. **Telegram:** @BotFather bot token **and** the destination channel/chat
   id, with the bot added as channel admin and verified by a test post.
3. *(Phase 5)* **Viber:** Channel super-admin auth token + sender id;
   HTTPS webhook endpoint reachable.
4. *(Phase 5, optional)* **X:** developer account; confirm current API
   pricing; set spending cap + alerts before enabling.

Tokens are handed over out-of-band and entered in the admin Social Hub
connection screen (encrypted, write-only) — never committed to the repo.

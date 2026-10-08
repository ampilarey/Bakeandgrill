# CLAUDE.md

Project notes for agents and developers working in this repo.

Cursor Cloud VM setup, ports, and local service commands live in `AGENTS.md` (environment
only). Project rules and conventions live here and under `.cursor/rules/`.

## After every merge to `main`: give the owner the live deploy command

TEST deploys itself — GitHub Actions calls `POST /api/deploy/test-pull` once CI is
green, with a cron fallback. **Production never does.** `TestDeployWebhookController`
refuses any host that is not TEST, so nothing reaches the live site until somebody
runs the deploy by hand on the server.

So a merge is not a release. Whenever you fast-forward `main`, end the reply with the
command to run on the production box:

```bash
cd /home/bakeandgrill/public_html && ./scripts/full-deploy.sh production
```

That one script is the whole deploy: `git pull`, `composer install --no-dev`,
`app:verify-production-config`, a database-only `backup:run` when migrations are
pending (production; the deploy stops if it fails, `SKIP_PREDEPLOY_BACKUP=1` to
override), `migrate --force`, `storage:link`, `config:cache`,
`route:cache`, `view:clear`, `queue:restart`, queue-worker keepalive, deploy stamp,
and `post-deploy-smoke.sh production`. There is nothing to run before or after it.

Call out anything in the merge that changes what the deploy has to do — a migration,
a new `.env` key, a rebuilt SPA bundle, a new system dependency — since those are the
cases where a half-done deploy leaves the site broken rather than merely stale.

## Admin colour tokens

When writing or editing admin dashboard page styles (`apps/admin-dashboard/src/pages/**`),
prefer CSS variables over hardcoded hex in `style={{…}}` objects. ESLint warns on new
hex literals in those objects (existing ones are baselined — see
`apps/admin-dashboard/eslint-baselines/no-hex-in-inline-style.json`).

Canonical mappings from `docs/ADMIN_THEMING_MOBILE_PLAN.md` §1.4 (case-insensitive):

| Hex | CSS variable |
|---|---|
| `#6b5d4f` | `var(--color-text-secondary)` |
| `#9c8e7e` | `var(--color-text-muted)` |
| `#e8e0d8` | `var(--color-border)` |
| `#b74b0c` | `var(--color-primary)` (the logo's rust; was `#d4813a` until 2026-09-30) |
| `#1c1408` | `var(--color-text)` |
| `#ef4444` | `var(--color-danger)` |
| `#f8f6f3` | `var(--color-bg)` |
| `#22c55e` | `var(--color-success)` |
| `#f59e0b` | `var(--color-warning)` |
| `#f0ebe5` | `var(--color-border-light)` |

These variables are defined on `:root` in `apps/admin-dashboard/src/index.css` and
already flip correctly under `[data-theme="dark"]`. Do not invent parallel hex
literals for the same roles.

Chips, pills and tinted boxes use the brand tones (owner, 2026-10-08), never blue,
indigo, violet, teal or cool grey: `--color-tone-rust-{bg,text,border}` for in
progress and info, `--color-tone-brown-*` for roles, types and plain labels,
`--color-tone-gold-*` for ready; green, amber and red stay for success, warning and
danger. Icons are lucide (`InlineIcon` in running text), not emoji; on/off controls
are SharedUI `Switch`. Details: `docs/ADMIN_THEMING_MOBILE_PLAN.md` § Stage 3c.

A row's Delete / Remove / Reject is `Btn variant="danger-outline"`; solid `danger` is
for the final confirm and bulk actions. Pop-ups (`Modal`) render outside the page, so
never scope a pop-up's CSS under a page class (`.x-page .chip` does not reach it).
Native tick boxes, radios and sliders take the rust through `accent-color` in
`index.css`. Every colour must hold in dark mode too: a pale panel is `--color-bg`, a
track or hairline `--color-border-light`, a picked chip `--color-tone-rust-bg`, a red /
amber / green edge `color-mix(in srgb, var(--color-danger) 35%, transparent)` and kin;
behind a photo or video, and on the sign-in page, `--color-backdrop` (near-black in
both themes; `--color-text` turns cream in dark mode). White stays only where paper or
a QR code needs it (print previews, QR cards). Details: § Stage 3e.

The admin has a phone layout (≤767px) and a computer layout, which folds its rail to
icons from 768 to 1023px (`AppShell`'s tablet band) and is short of room up to 1199px
(the CSS's compact band: the top bar shrinks search and the name chip to icons). Check
390, 768, 1024 and 1366px; 768–1199 is where wide tables and long button rows break.
A table goes in `.table-scroll` (or `TableCard` / `ResponsiveTable`) so it scrolls
inside its card, and a cell holding a date, a time or an amount is `TD_NOWRAP`; a
`display: grid` column that holds a table needs `minmax(0, 1fr)`; a row of tabs or
filter chips is `TabScrollRow`. Details: § Stage 3f.

## Brand colours

The accent everywhere is the rust from the logo, `#B74B0C`; on a dark surface it is
the lightened `#C56F3D`. The full palette, the derivation rule and where each token
lives are in `docs/brand/PALETTE.md`. The old amber `#D4813A` is not a brand colour
any more; do not reintroduce it. Nor is the black-square logo: app and tab icons,
the dark-surface logo and link previews are generated by `scripts/brand-icons.py`
(table in `docs/brand/PALETTE.md`). The website and order-app headers draw the logo
with burning, glowing flames while the standard logo is set; those shapes are generated
by `scripts/brand-animated-logo.py`, not edited by hand. Video and GIF versions for social
media and both downloadable packs come from `scripts/brand-animated-logo-video.mjs` and
`scripts/brand-packs.py`. The flame alone (`brand/flame-mark.svg`, the menu's quiet no-photo tile)
and the banner pattern (`brand/flame-pattern.svg`) come from `scripts/brand-flame-mark.py`. Menu
colours follow `docs/brand/PALETTE.md` § Menu colours: no hue-from-id tints, prices as
"MVR 12.50".

To regenerate the hex-in-style baseline after migrating a page:

```bash
cd apps/admin-dashboard && node scripts/generate-hex-style-baseline.mjs
```

## Local database: MySQL/MariaDB preferred

Although `README.md` / `docker-compose.yml` may mention `pgsql`, local/dev on this
project uses **MySQL/MariaDB** (see `AGENTS.md`). CI also runs a PostgreSQL
compatibility suite; site_settings migrations collapse duplicates with
`havingRaw('COUNT(*) > 1')` so PostgreSQL accepts them (aliases in `HAVING` are
rejected). Automated default tests use SQLite in-memory via `phpunit.xml`.

## Dhivehi webfont inspector

Content Hub `dhivehi_font` accepts TTF/OTF natively. WOFF/WOFF2 inspection and
TTF→WOFF2 conversion need Python `fontTools` + `brotli` (`scripts/install-fonttools.sh`).
That pair is a deploy dependency (CI, TEST, production). The CSS override route
`GET /css/dhivehi-font.css` is registered outside the `web` group so it stays
cookie-less.

## Labels (pack stickers, box labels)

Admin → Labels prints pack stickers (English and Dhivehi; A4 sheets, label-printer
sizes, round stickers) and A4 box labels, server-drawn with dompdf. Label types
(Frozen Hedhika…) carry the wording, brands (Bake & Grill, Amma…) the logo; every
sticker shares one header and footer with the complaints QR; every prepared print is
a saved label that can be reprinted or edited; a live preview (one sticker or the
first page, the box label) redraws beside the form as it changes. Owner-only until `labels.print` /
`labels.manage` are granted. Two renderer facts the views depend on: dompdf's baseline
rule differs from browsers (`LabelText::PDF_BASELINE_K`), and dompdf needs Thaana in
visual order (`App\Support\ThaanaVisual`, PDF path only; the menu PDF uses it too).
Phones print the PDF, not the web sheet (iOS adds margins). How to use it and where
everything lives: `docs/LABELS.md`; design and decisions: `docs/LABEL_HUB_PLAN.md`
and `docs/LABEL_HUB_V2_PLAN.md`.

## Telegram staff bots

Admin → Telegram (owner-only, `telegram.manage`). One bot can serve every role
(owner, manager, staff, kitchen staff, driver) or each role its own. Staff link
their own Telegram with a one-time link; staff and owner alerts that go through
`SmsService` are copied to their chat (`TelegramAlertCopier`), and the bot's
buttons re-check permissions on every press. **TEST
and production need separate bots**: Telegram sends a bot's updates to one
webhook only, and adding a bot that points at another site stops with a warning.
Built: owner, manager, cashier and kitchen (menus follow permissions; the kitchen
gets the prep list with Made, the board read only and check-in), drivers (a message
per delivery, Picked up / On the way / Delivered), the buying list (add by
typing, Approve / Reject, the buyer ticks items off with the price paid) and
shop-group feeds (`/feed@<bot>` online orders, `/feed@<bot> buying` the buying
list; buttons checked against whoever presses; cards follow the order or
request). No shift figures for cashiers: the close count is blind. Owner extras
behind 🧰 More (who's working, low stock, find an order, message staff) and two
Telegram-only alerts (order cancelled at the till, cash out). See
`docs/TELEGRAM_BOTS.md`.

## Alert channels per role and person

Staff and owner alerts go to **people**, by channel (SMS, Email, Telegram): the
alert type's switch, the person's channels (their own, else their role's, set in
Admin → SMS Control Center → Who gets alerts, and how) and whether they can be
reached that way. Staff without a phone are addressed as `user:{id}` and get
email / Telegram; when nothing reaches someone who has a phone, the SMS goes.
Customers are untouched. See `docs/NOTIFICATION_CHANNELS.md`
(`NotificationChannels`, `SmsService::sendByOtherChannels`).

## Who may change something may see it

Owner, 2026-10-08: "If the manager has given the permission he must see the
permission." A write must not be open to someone its screen's read refuses:
`GET /api/site-settings` takes `settings.update` as well as `website.manage`, and
without the latter returns `SiteSettingsController::operationsReadableKeys()` (a new
display-only key goes in `OPERATIONS_DISPLAY_KEYS`). A settings screen never saves
values that did not load (Save off, switches locked). Anyone who cannot edit roles
sees their own access on Settings → Roles & permissions (`GET /api/auth/me/permissions`).
Route permissions change only with the owner's yes, and the change updates
`backend/tests/Fixtures/admin_route_permissions.txt`. Details:
`docs/ADMIN_THEMING_MOBILE_PLAN.md` § Stage 3f.

## TEST and production share one Redis

The Redis socket is per cPanel *account* (`REDIS_PATH=/home/bakeandgrill/.redis/redis.sock`),
so both sites talk to the same server. Nothing separates them by default —
`REDIS_PREFIX` and `CACHE_PREFIX` both fall back to a slug of `APP_NAME`, which is
the same `"Bake & Grill"` on both, and `REDIS_DB`/`REDIS_CACHE_DB` default to 0 and 1.

Left at the defaults the two environments share a **queue**, and whichever worker
pops a job runs it against its *own* database and credentials — so a TEST
campaign-SMS job can be executed by the production worker and delivered to real
customers. They also share a **cache**, and `cache:clear` on either site wipes both:
`RedisStore::flush()` is a `FLUSHDB`, which ignores prefixes.

Production keeps the defaults. TEST sets all four explicitly (fixed 2026-08-23):

```
REDIS_DB=2
REDIS_CACHE_DB=3
REDIS_PREFIX=bg-test-database-
CACHE_PREFIX=bg-test-cache-
```

Any third environment on this account needs its own set. Separate prefixes isolate
the keys; separate databases are what make a `cache:clear` on one site harmless to
the other. `app:verify-production-config` cannot catch this — it only sees one
environment — so it is a convention, not an enforced check.

## Menu layout (website and order app)

Owner, 2026-10-07. The rail lists main categories only. One banner, pinned
under the header, shows the section in view (photo, name, count, Share,
search icon) with its sub-categories as a row of buttons; the list underneath
is continuous, each sub-category starting at a thin label with its own Share.
Banner, buttons and rail highlight animate on scroll and tap (transform and
opacity only, off under reduced motion); an "All" panel appears when the
buttons do not fit. Website: `.mh` markup and script in `menu.blade.php`.
Order app: `components/menu/MenuHead.tsx`. Keep the two in step. Shared links
`/menu/c/{slug}` open the full menu at that category or sub-category
(`data-menu-start`), with a preview built from its photo or a dish photo
(`MenuPageController::sharedLink`).

The button row and search panel float under the banner (`.mh-under`), so a
section without sub-categories shows no strip and nothing jumps. The search
panel is a card of its own (surface, rust-tinted edge, lifted shadow, hanging
straight from the banner or row): in the page's cream it vanished over dishes
without photos, whose tiles are that same cream. On phones the
order app's day and order-type bars are not pinned: they fold into a button at
the head of the rail (`RailOrderButton`) that drops them back down. On phones
the menu opens with a brand row (`HomePhoneHeader pinned={false}`) that scrolls away;
the website's phone header slides away while scrolling down the menu and returns on
the way up (`menu-header-away`, which also sets `--menu-sticky` to 0). The first
Add with no order type chosen asks once (`OrderModeSheet` with `onChosen`) and
adds the dish in the same tap; the cards' quick "+" goes through the same question
and opens the sheet instead for a dish with sizes, extras, a platter, packaging or a
minimum quantity.

## Variants are separate products in reports

Owner, 2026-10-07: "variant should treat as a separate product". Every sales
ranking groups by item **and** variant and names the row "Water (Small)"
(`App\Domains\Reporting\Support\ProductName`): Admin daily summary and
breakdown, stock velocity, menu engineering, item forecast, customer
favourites, wholesale top items and shop analytics, Telegram best sellers.
Rows carry `variant_id` and a `key` unique per product. Removed (soft-deleted)
order lines do not count. Waste logs have no variant, so waste stays per item.
New sales reports follow the same rule.

## Queue worker vs synchronous SMS

The queue worker (`php artisan queue:work redis`) is only needed for async listeners
(loyalty, inventory, outgoing webhooks, campaign SMS). Payment/order SMS send
synchronously.

# Bringing iruali features into Bake & Grill

Plan written 2026-10-17. Nothing is built yet. Each feature below says what Bake & Grill
already has, what to build, which apps it touches, and where it sits in the order.

iruali (github.com/ampilarey/iruali) is a Laravel 12 + Blade marketplace. Bake & Grill
is one restaurant: a Laravel API in `backend/`, React apps in `apps/` (order app, admin,
till, kitchen screen, driver app) and a Blade website. So every feature is rebuilt the
Bake & Grill way, not copied:

- Code goes into `backend/app/Domains/<Domain>/` with tests beside the existing ones.
- Customers are `Customer` rows signed in by phone and SMS code (`CustomerOtpService`).
  Staff are `User` rows. iruali has one `users` table for both, so its "is this staff?"
  checks become "this is a different table" here.
- Every message goes through the notification registry (`SmsTypeRegistry`, one row per
  alert with its SMS, Email and Telegram switches, `AlertSwitch::isOn`) and, for staff,
  `AlertAudience`. No feature gets its own on/off switch on its own page.
- New admin pages follow CLAUDE.md: CSS variables, brand tones, SharedUI `Switch`, small
  buttons, 390 / 768 / 1024 / 1366 px checked, nothing scrolls sideways.
- New route permissions need the owner's yes, and they update
  `backend/tests/Fixtures/admin_route_permissions.txt`.
- Every new customer-facing string has English and Dhivehi from day one (see feature 3,
  which brings the string catalogue forward for this reason).

Left out on purpose: sellers, shop applications, commission, payouts, shop staff,
per-shop returns, disputes, brands, island-by-island delivery coverage, per-shop
multi-buy, and iruali's per-shop parts of messaging and packing slips.

## Summary

| # | Feature | Bake & Grill today | Size | Phase |
|---|---|---|---|---|
| 19 | One rate-limit counter per route | **Done** (`ThrottleRequestsPerRoute`); only a guard test is missing | XS | 0 |
| 18 | Phone-width check on every page | Partly: a few pages in `e2e/tests/mobile.spec.ts` | S | 0 |
| 17 | Daily error digest | Partly: Sentry is wired in `config/sentry.php` if a DSN is set | S | 0 |
| 15 | System status panel + restore drill | Mostly: `SystemHealthService`, System → Health and a dashboard tile; no restore drill | S | 0 |
| 14 | Needs attention inbox | Partly: the bell and separate pages, no single list | M | 0 |
| 16 | Smoke test after deploy with rollback | Partly: `post-deploy-smoke.sh` checks pages only | M | 0 |
| 3a | Dhivehi groundwork (string catalogue, RTL, switch) | Partly: the website has `?lang=dv`; the order app's Dhivehi was taken out in the redesign | M | 1 |
| 2 | Email check with a 6-digit code | Partly: email sign-in codes exist, no "verified" mark | S | 1 |
| 5 | Customer message choices | Partly: one SMS opt-out (`sms_opt_out`) | M | 1 |
| 1 | Google, Facebook, Apple sign-in | No | L | 1 |
| 13 | Points expiry warning | Mostly: expiry runs (`app:expire-loyalty-points`); no warning | S | 2 |
| 8 | Back in stock and coming soon | No (snooze and sold out exist) | M | 2 |
| 6 | Better reviews | Partly: reviews with moderation, tied to orders | M | 2 |
| 7 | Questions about a dish | No | M | 2 |
| 9 | Order messages | No (complaints are separate) | M | 2 |
| 10 | Gift orders | No | M | 3 |
| 12 | Refund to wallet, gift card into wallet | Partly: deposit wallet and gift cards both exist | S | 3 |
| 11 | Search-engine data and catalogue feeds | Partly: sitemap with hreflang; no JSON-LD, no feeds | M | 3 |
| 4 | Email newsletter | No (SMS campaigns exist) | L | 3 |
| 3b | Full Dhivehi: translate everything, `/dv` URLs | See 3a | L | 4 |

Sizes: XS under a day, S one or two days, M three to five days, L a week or more.

## How each phase ships

- One branch and one PR per feature, or a few small ones together (Phase 0's XS and S
  items can share one).
- Each PR: tests for the new behaviour, Pint on the changed PHP files, ESLint and Vitest
  for the apps, the SPA bundles rebuilt and committed (`./scripts/build-all.sh <app>`),
  CLAUDE.md and the feature's doc updated.
- Merged to `main` only when CI is green. TEST deploys itself from `main`; check the
  feature on TEST before the next PR starts.
- Production is deployed by hand (`./scripts/full-deploy.sh production`). Each PR's notes
  say if it adds a migration, a new `.env` key, a rebuilt bundle or a new dependency.

---

## Phase 0: safety and running the shop

These change nothing customers see. They make the later phases safer to ship.

### 19. One rate-limit counter per route

**Today: done.** A bare `throttle:N,M` in Laravel shares one counter per visitor across
every route that uses it. Bake & Grill fixed this on its own:
`App\Http\Middleware\ThrottleRequestsPerRoute` is bound in place of the framework class
in `AppServiceProvider`, so each route counts on its own (CLAUDE.md, "Customer pages").
There are 155 bare `throttle:N,M` uses, and they are safe because of this binding.

**Build:** nothing new in the routes. Add one guard test (iruali's `RateLimitTest` idea,
turned around): it fails if the container stops resolving `ThrottleRequests` to
`ThrottleRequestsPerRoute`, and it hits two throttled routes from one address to show
that using up one does not block the other. Renaming 155 routes to named limiters would
be churn for no gain.

**Apps:** backend tests only.

### 18. Phone-width check on every page

**Today:** `e2e/helpers/mobileLayout.ts` has `expectNoDocumentHorizontalOverflow`, and
`e2e/tests/mobile.spec.ts` checks the home page, `/order/` and `/order/menu`. The go-live
specs check a few admin screens. CI runs Playwright but the e2e job is not blocking.

**Build:** `e2e/tests/phone-width.spec.ts` at 390 × 844:
- Website: every public page from the sitemap (home, menu, one category link, one dish
  page, contact, privacy, complaint pages).
- Order app: every route in its router (menu, cart, checkout, account, orders, rewards,
  gifts, reservations), signed in as a seeded test customer where needed.
- Admin: every page in `navConfig.ts`, signed in as the owner, so a new admin page is
  checked without anyone adding it by hand.
- Each page: wait for it to settle, then `expectNoDocumentHorizontalOverflow`. A page
  that fails names itself in the report.
- Run it in the existing e2e job. Make it blocking once the first run is clean (fix what
  it finds first, in the same PR or one straight after).

**Apps:** e2e only.

### 17. Daily error digest

**Today:** `config/sentry.php` exists, so errors go to Sentry when `SENTRY_LARAVEL_DSN`
is set. Nothing summarises errors if it is not set.

**Build** (iruali's `ErrorTracker` and `errors:digest`):
- Table `error_events`: fingerprint (exception class + file + line), message, first seen,
  last seen, count, last URL, whether it touched payments.
- `ErrorTracker::record()` from the exception handler's `reportable`, skipping the
  normal ones (validation, 404, auth, throttled).
- A payment-related error (BML, gift card, deposit) sends an alert straight away, once
  per fingerprint per hour.
- `errors:digest` at 07:50: yesterday's errors, newest and most frequent first, as one
  email. Nothing is sent on a day with no errors.
- Two registry rows, `owner_error_digest` and `owner_payment_error`, with audience
  `role:owner` in `AlertAudience::DEFAULT_GROUPS`, so the owner can aim and switch them
  on System → Notifications.
- System → Health gets an "Errors (24 h)" line linking to a short list.
- Keep the rows for 30 days (a daily prune).

**Apps:** backend, admin (one list on System → Health). Migration: yes.

### 15. System status panel and backup restore drill

**Today, mostly there:** `SystemHealthService` checks Redis, database, queue worker,
scheduler heartbeat, public storage, the print proxy and disk. System → Health shows
them and the dashboard reads them. Backups run nightly (`backup:run`, `backup:clean`,
`backup:monitor`).

**Build** (the parts of iruali's `ReadyChecks` that are missing):
- New checks: mail can be sent (driver set, not `log` in production), BML keys present
  and the last payment callback is recent, SMS gateway credentials present and the last
  send succeeded, latest backup younger than 26 hours, `APP_DEBUG` off and `APP_ENV`
  production on production, the TEST Redis separation (`REDIS_DB` and prefixes set when
  `APP_ENV` is not production; see CLAUDE.md).
- Each check says pass, warn or fail, plus one line on how to fix it.
- `php artisan app:ready` prints the same list (handy over SSH). It exits non-zero on a
  fail, so the deploy script can call it later.
- **Restore drill:** `backup:restore-drill`, monthly on the 1st at 04:10. It takes the
  newest backup, restores the database into a throwaway database (`<db>_drill`), counts
  the rows of key tables (orders, customers, items, payments), compares them with live,
  drops the throwaway database and emails a short report (registry row
  `owner_restore_drill`). A failed drill is a red line on System → Health until the next
  good one.
- The restore needs a database user that may create and drop the `_drill` database. On
  cPanel this is set up once by hand; the doc says how. Until then the drill reports
  "skipped: no drill database" rather than failing.

**Apps:** backend, admin (System → Health, dashboard tile). New `.env` key:
`BACKUP_DRILL_DATABASE` (optional).

### 14. Needs attention inbox

**Today:** the admin bell shows notifications, and each kind of work has its own page
(refunds, complaints, reviews, bank transfers, failed jobs on System → Health). There is
no single "what needs a person today" list.

**Build** (iruali's `AdminInbox` registry):
- `App\Domains\System\AdminInbox`: each domain registers a row from its service
  provider with a label, a count, a link and a level (info, warn, danger). A row that
  throws is logged and skipped, so one broken count never breaks the page.
- Starting rows: refunds waiting for approval or payout; open complaints, and those past
  their reply time; bank transfer slips to check; reviews waiting for moderation;
  dish questions not answered (feature 7); order messages not answered (feature 9);
  online orders paid but not accepted; failed queue jobs; label rolls running low;
  printed stock near its expiry.
- Who sees a row: the permission of the page it links to, so a cashier never sees
  refunds. The route permission fixture is the single source.
- `GET /api/admin/inbox` gives the rows the signed-in staff member may open.
- Admin: a "Needs attention" page (first in the System section, also linked from the
  dashboard), a count badge on the bell, and a card on the dashboard with the top rows.
  Counts refresh every minute. Empty state: "Nothing waiting. Good job."
- Telegram: the owner bot's 🧰 More gets "Needs attention" with the same rows.

**Apps:** backend, admin, Telegram owner bot. Route permission change: a new route
(owner's yes needed).

### 16. Smoke test after each deploy, with rollback

**Today:** `full-deploy.sh` ends with `post-deploy-smoke.sh production`, which checks
that pages answer 200 and prints a manual checklist. It never places an order and never
rolls back.

**Build** (iruali's `SmokeChecks`, `deploy-production.sh` and `deploy-lib.sh`):
- `php artisan app:smoke`: page checks (home, menu, sitemap, `/order/`, `/api/health`,
  the menu API), then one real order placed and cancelled through the API.
- The order belongs to a seeded smoke-test customer (a fixed phone that never receives
  SMS). The order is flagged `is_smoke` so that it:
  - never prints in the kitchen or at the till and never shows on the kitchen screen;
  - sends no SMS, email or Telegram;
  - is left out of every report, best seller, loyalty and stock movement;
  - is cancelled at once and then soft-deleted.
  A test proves each of these.
- The order is paid by "cash at pickup", so no money moves. BML is checked by reading
  its keys and the last callback only, never by paying.
- `full-deploy.sh` keeps the commit it started from. If `app:smoke` fails:
  - **No migration ran in this deploy:** it checks out the previous commit, runs
    `composer install`, `config:cache`, `route:cache`, `view:clear`, `queue:restart`,
    reruns the smoke test, and alerts the owner (registry row `owner_deploy_rollback`).
  - **A migration ran:** it does **not** roll back, because the old code may not run on
    the new tables. It stops, prints the failure, and alerts the owner to look. The
    pre-deploy database backup taken by the script is the way back.
- `SKIP_SMOKE_ORDER=1` skips the order part for an emergency deploy.
- The SPA bundles are committed, so rolling back the commit rolls back the apps too.

**Apps:** backend, `scripts/full-deploy.sh`, `scripts/post-deploy-smoke.sh`. Migration:
`orders.is_smoke`. This changes what the production deploy does, so it goes to TEST
first and runs there for a week before production uses it.

---

## Phase 1: customer accounts

### 3a. Dhivehi groundwork (comes first in this phase)

The full Dhivehi job is feature 3 (Phase 4). The groundwork comes now so that every
string written in the later features already has English and Dhivehi, instead of being
reworked at the end.

**Today:**
- The website serves Dhivehi on the same path with `?lang=dv` and a cookie
  (`SetContentLocale`). It is behind the admin switch `language_switcher_enabled`; off,
  everything is English. The sitemap already lists `hreflang` en, dv and x-default.
- Item names and content blocks have Dhivehi fields.
- The order app's Dhivehi was taken out on purpose in the redesign
  (`docs/online-order-ui-redesign/PHASE7_CLEANUP.md`, v2.2: "no EN/Dhivehi language
  buttons"). `LanguageContext.tsx` keeps the keys, in English only, "so a future language
  can be re-added". This plan brings it back, behind the same admin switch, so with the
  switch off the order app stays exactly as it is now.

**Build:**
- Order app: move `LanguageContext`'s strings into `src/i18n/en.json` and `dv.json`.
  `t(key, vars)` falls back to English when a key has no Dhivehi. Language comes from
  the account, then the device, then English. `<html lang dir>` follows it.
- RTL: switch to logical CSS (`margin-inline-start` and kin) in the shell, sheets, cart
  and checkout first. Icons that point (back arrows, chevrons) flip under `dir="rtl"`.
  Numbers and prices stay left to right ("MVR 12.50").
- A language switch in Account → Settings and the menu header, shown only while
  `language_switcher_enabled` is on.
- Backend: `customers.locale` ('en' | 'dv'), set from the app. Messages to a customer go
  in their language while Dhivehi is on, else English (iruali's
  `LocalizationService::usable`). The registry's message wordings get a Dhivehi version
  beside the English one.
- A check in CI: every key in `en.json` must exist in `dv.json` (empty allowed only with
  a `// TODO dv` list kept short). New features add both.
- Dhivehi copy is drafted in plain words and **must be read by a Dhivehi speaker on the
  team** before it goes live. The PR lists the new strings in one table for that read.

**Apps:** order app, backend. Migration: `customers.locale`.

### 2. Email check with a 6-digit code

**Today:** `CustomerOtpService` already sends sign-in codes by SMS or email
(`CustomerOtpMail`). Customers may have an email, but nothing records that it was
proven.

**Build** (iruali's `VerifyEmailCode`):
- `customers.email_verified_at`. Changing the email clears it.
- Account → Profile: after an email is saved, "We sent a 6-digit code to …". Codes reuse
  `CustomerOtpService` with purpose `verify_email`: 10 minutes, 5 tries, one resend a
  minute, the newest code only.
- `POST /api/customer/email/send-code` and `POST /api/customer/email/verify`, throttled.
- Only a verified email gets newsletters (4), marketing email (5) and can be matched by
  social sign-in (1). Order receipts still go to an unverified email, as today.
- Email and screen wording in English and Dhivehi.

**Apps:** backend, order app (Account). Migration: yes.

### 5. Customer message choices

**Today:** one switch, `customers.sms_opt_out` (with source and time), set by a STOP
reply or by staff. It covers SMS campaigns only. Email has no opt-out.

**Build** (iruali's `NotificationPreferencesController`):
- Four kinds, each set to Email, SMS, Both or Off:
  - **Orders** (confirmed, ready, receipts). Default Both. Off is allowed but the screen
    says "You will not hear when your order is ready".
  - **Delivery** (on the way, delivered, late). Default SMS.
  - **Offers and news** (campaigns, newsletters, points reminders, back in stock).
    Default Off for email until the customer opts in; SMS follows today's `sms_opt_out`.
  - **Account security** (sign-in codes, email codes, sign-in from a new device). Always
    on, cannot be turned off; the screen says why.
- Each customer row in `SmsTypeRegistry` gets a `kind`. `SmsService` and the email
  senders ask `CustomerPreferences::allows($customer, $kind, $channel)` before sending.
  A test fails if a customer-facing registry row has no kind.
- `customer_notification_prefs` table (customer, kind, channels). `sms_opt_out` stays the
  source of truth for SMS marketing, so a STOP reply keeps working; the two are kept in
  step in one place.
- Every marketing email carries a signed one-click link (`/u/{token}`, no sign-in) and
  the `List-Unsubscribe` and `List-Unsubscribe-Post` headers. One click turns that kind
  off for email and shows "You will not get these emails any more" with an Undo.
- Order app: Account → Messages, four rows with the choices.
- Admin: the customer's page shows their choices (read only) beside today's SMS opt-out.
- The registry admin rows (System → Notifications) stay the shop-wide switch. The
  customer's choice only narrows it, never widens it.

**Apps:** backend, order app, admin (customer page). Migration: yes.

### 1. Sign in with Google, Facebook and Apple

**Today:** customers sign in with phone and SMS code only.

**Build** (iruali's `SocialLogin` providers, rebuilt for the order app):
- Providers follow iruali: OAuth 2 / OpenID Connect code flow with `state`, a `nonce`
  and PKCE, over Laravel's HTTP client, ID tokens checked for issuer, audience, expiry
  and nonce. No new package. A provider's button shows only when its keys are set.
- The order app is a single-page app at `/order`. The flow runs through web routes:
  `/auth/social/{provider}` sends the customer to the provider, the callback signs them
  in and hands the app a one-time code (60 seconds, single use), which the app swaps for
  its usual Sanctum token. No token ever sits in a URL.
- Who the customer is:
  1. A sign-in already linked (`customer_social_accounts`: provider, subject, email) →
     that customer.
  2. Else a customer whose **verified** email (feature 2) matches, and the provider says
     the email is verified → link and sign in.
  3. Else: the order app asks for the phone and sends the usual SMS code. The phone's
     customer (or a new one) gets the link. Bake & Grill needs a phone for every order
     (SMS, delivery, the till), so a social sign-in never makes a customer without one.
- Staff cannot use it by design: staff are `User` rows and this only signs in
  `Customer` rows. A customer whose phone or email belongs to an active staff member is
  refused with "Staff sign in with their phone and PIN", so a staff account is never
  linked to a social one by accident.
- Account → Sign-in methods: lists linked accounts with Unlink. Unlinking the last one
  is fine because the phone always works.
- Apple: needs a paid Apple Developer account, a Services ID and a key. Apple sends the
  name only on the first sign-in, so it is saved then. Apple's private relay emails are
  accepted as emails.
- New `.env` keys: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `FACEBOOK_CLIENT_ID`,
  `FACEBOOK_CLIENT_SECRET`, `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`,
  `APPLE_PRIVATE_KEY`. TEST and production need their own apps or redirect URLs. A doc,
  `docs/SOCIAL_SIGN_IN.md`, lists the exact console steps.
- Website: no sign-in today, so nothing changes there.

**Apps:** backend, order app. Migration: yes. New `.env` keys: yes.

---

## Phase 2: keeping customers coming back

### 13. Points expiry warning

**Today:** points can expire. `loyalty_points_expiry_days` sets the life of earned points
(0 means never), each ledger entry has `expires_at`, and `app:expire-loyalty-points`
takes them off.

**Build** (iruali's `PointsExpiring`):
- `loyalty:warn-expiring` daily at 09:10: customers with points expiring in the next 30
  days, told once per expiry date (`loyalty_ledger.expiry_warned_at`).
- Message: "120 points (worth MVR 12.00) expire on 15 Nov. Use them on your next order."
  with a link to the menu.
- Registry row `customer_points_expiring`, kind "Offers and news" (feature 5), SMS and
  email switches. Nothing is sent while expiry is off.
- The order app's Rewards page shows "120 points expire on 15 Nov".

**Apps:** backend, order app. Migration: yes (one column).

### 8. Back in stock and coming soon

**Today:** items can be switched off (`is_available`) or snoozed (`snoozed_until`). The
order app shows them as sold out. Nobody is told when they come back.

**Build** (iruali's `StockAlertService` and `ComingSoonService`):
- "Tell me when it's back" on a sold-out or snoozed dish (order app item sheet and the
  website dish page). Needs a signed-in customer; a guest is asked to sign in.
  `item_alerts` (customer, item, kind `back` or `launch`, created, sent).
- Sending: when an item becomes orderable again (switched on, snooze cleared, or a
  snooze that ran out, found by a five-minute check), each waiting customer gets one
  message, and the alert is closed. Registry row `customer_back_in_stock`, kind "Offers
  and news". Within opening hours only; outside them it waits for opening.
- **Coming soon:** `items.launch_at` on the item editor ("Coming soon, on sale from").
  Before that date the dish shows with a "Coming soon · 1 Nov" badge and "Tell me when
  it's on sale" instead of Add. On the day it goes on sale by itself, and waiting
  customers are told (registry row `customer_item_launched`).
- Coming-soon dishes stay out of the till, best sellers, the kitchen plan and feeds
  until launch.
- Admin: the item's page shows "12 people waiting".

**Apps:** backend, order app, website, admin (item editor). Migration: yes.

### 6. Better reviews

**Today:** `reviews` holds order and item reviews (1 to 5 stars, comment, anonymous,
pending / approved / rejected). Reviews come from a completed order, so every review is
already from a real purchase. Admin → Reviews moderates.

**Build** (iruali's `ProductReview`):
- **Photos:** up to 3 per review, through the media upload pipeline (resized, EXIF
  stripped). Shown as thumbnails that open full size. A review with photos waits for
  moderation even when auto-approve is on.
- **Verified purchase:** the mark shows when the review came from an order. Staff-entered
  reviews, if any, never show it.
- **Helpful:** a signed-in customer can mark a review helpful once
  (`review_votes`). Reviews sort by helpful, then newest.
- **The restaurant replies:** Admin → Reviews gets Reply. The reply shows under the
  review as "Reply from Bake & Grill". The customer is told (registry row
  `customer_review_reply`, kind "Orders").
- Shown on the website dish page and the order app item sheet. The website dish page
  adds the rating to its search-engine data (feature 11).

**Apps:** backend, order app, website, admin (Reviews). Migration: yes.

### 7. Questions about a dish

**Today:** nothing.

**Build** (iruali's `ProductQuestion`):
- "Ask a question" on the website dish page and the order app item sheet ("Is it
  spicy?", "Does it have nuts?"). Signed-in customers only, 300 characters, throttled.
- `item_questions` (item, customer, question, answer, answered by, status). Questions
  wait for staff; only answered ones show, newest first.
- Admin: a Questions tab under Customers → Reviews (one place for both), with Answer,
  Hide and "Answer and add to the dish's details" (copies the answer into the dish's
  notes for the menu).
- The asker is told when it is answered (registry row `customer_question_answered`). The
  staff alert goes to `perm:menu.manage` by default (`staff_new_question`). Counted in
  Needs attention (14).
- Answers that mention allergens carry the standard line "Please tell staff about any
  allergy when you order".

**Apps:** backend, order app, website, admin. Migration: yes. Route permission change:
yes (owner's yes needed).

### 9. Order messages

**Today:** customers can file a complaint (with photos) about an order. There is no way
to send a simple message like "Please add extra sauce" or "I'm running late".

**Build** (iruali's `MessagingService`, minus the shop parts):
- On the order page in the order app: "Message us" while the order is open and for 2
  days after it is completed. Text up to 1000 characters and one photo.
- `order_messages` (order, from customer or staff, body, photo, read at).
- Admin: the order's page gets a Messages panel with Reply. A list of unanswered
  messages is in Needs attention (14). The till's order view shows a badge so the cashier
  sees "Customer: running 10 min late".
- Telling people:
  - A new customer message alerts staff (registry row `staff_order_message`, audience
    `on_shift` by default, Telegram copy through the usual copier).
  - A staff reply tells the customer by SMS or email (registry row
    `customer_order_message_reply`, kind "Orders"), with a link back to the order.
- Complaints stay separate. A message that is really a complaint has "Turn into a
  complaint" in the admin, which opens a complaint with the text and photo.
- Photos are private: served through a signed, short-lived link, never from public
  storage.

**Apps:** backend, order app, admin, till (badge). Migration: yes. Route permission
change: yes.

---

## Phase 3: orders, money and search

### 10. Gift orders

**Today:** nothing.

**Build** (iruali's `_gift` checkout part and `PackingSlip::hidesPrices`):
- Checkout, delivery and pickup only: "This is a gift" opens receiver name, receiver
  phone and a gift message (200 characters).
- `orders.is_gift`, `gift_to_name`, `gift_to_phone`, `gift_message`.
- Delivery goes to the receiver's address. The driver app shows the receiver's name and
  phone for the drop-off, and the buyer's phone as the second contact.
- The kitchen slip and the bag slip (`print-proxy/src/tickets.ts`) print "GIFT", the
  message, and **no prices**. The buyer's receipt keeps the prices and goes to the
  buyer only.
- The receiver gets one optional SMS when the order is on the way ("A gift from Aisha is
  on the way"), registry row `customer_gift_on_the_way`, off by default.
- Not offered for dine-in or a table QR order.

**Apps:** backend, order app, driver app, print proxy, till (gift mark on the ticket).
Migration: yes.

### 12. Refund to wallet, and gift cards into the wallet

**Today:**
- Customers have a deposit wallet (`CustomerDepositAccount`, `CustomerDepositLedger`,
  `DepositLedgerService`) that pays for orders. Refunds already put back what was paid
  from the wallet.
- Gift cards exist (`GiftCard`, `GiftCardRedemptionService`) and are spent as a payment
  at checkout.

**Build** (the missing parts of iruali's `WalletService` and `GiftCardService`):
- **Refund to wallet:** a new payout method, "Store credit (customer wallet)", beside
  bank transfer, card terminal and cash on the refund's Mark paid out. It credits the
  deposit wallet through `DepositLedgerService` (one ledger entry linked to the refund),
  needs a linked customer, and tells the customer (registry row
  `customer_refund_to_wallet`). Refund reports and the drawer cash count treat it as
  non-cash.
- **Gift card into the wallet:** in the order app, Account → Wallet → "Add a gift card"
  moves the card's remaining balance into the wallet in one go, and the card is used up.
  Spending a gift card straight at checkout still works.
- Check while building: whether the order app can already pay from the wallet online.
  If not, this feature adds it at checkout, because store credit is useless without it.

**Apps:** backend, order app, admin (refund payout). Migration: small.

### 11. Search-engine data and catalogue feeds

**Today:** `SitemapController` lists pages with `hreflang`. Shared links have preview
images (`MenuPageController::sharedLink`). There is no JSON-LD and no catalogue feed.

**Build** (iruali's `SeoService` and `FeedToken`):
- JSON-LD in the website's `<head>`:
  - **Restaurant** on every page: name, logo, address, phone, cuisine, price range,
    opening hours from `OpeningHoursText` (one source, as CLAUDE.md asks), the menu URL
    and the order URL.
  - **Menu** on the menu page: sections with their dishes, name, description, price in
    MVR, photo, and "suitable for" diets where marked.
  - **Dish** page: `MenuItem` with its offer and, once there are approved reviews, the
    rating (feature 6).
  - **Breadcrumbs** on category and dish pages.
  - A test validates each against the schema shape. Dishes kept out of sale (coming
    soon, switched off) are left out.
- Feeds behind a secret link (`/feeds/{token}/google.xml` and `facebook.csv`), token
  from `FeedToken` in site settings, rotated from Admin → Website → Feeds with Copy link:
  - Facebook / Instagram catalogue (CSV): one row per dish and size, with photo, price,
    availability and a link to the dish page.
  - Google: the same as a Merchant Center XML feed. Google's food rules mean it may only
    help in some surfaces; the doc says so plainly.
  - Hidden-from-sale and coming-soon dishes are left out. Snoozed dishes show "out of
    stock".
  - Cached for 30 minutes and rebuilt when the menu changes.

**Apps:** backend (website Blade), admin (Feeds card). Route permission change: one admin
route for rotating the token.

### 4. Email newsletter

**Today:** SMS campaigns exist (Admin → SMS campaigns). Nothing for email.

**Build** (iruali's `NewsletterService` and `SendNewsletterBatch`):
- **Sign-up:** a footer box on the website and a switch in the order app's Account →
  Messages. Double opt-in: a confirm link by email, nothing sent until it is clicked.
  `newsletter_subscribers` (email, locale, confirmed at, unsubscribed at, source).
- **Who gets it:** confirmed subscribers plus customers with a verified email (2) who
  allow "Offers and news" by email (5). One email per address. Opted-out addresses are
  never sent to.
- **Writing an issue:** Admin → Customers & Marketing → Newsletter. Subject and body in
  English and Dhivehi, a header picture, and sections to tick: New on the menu (dishes
  added in the last N days), Daily specials, an Offer (picks a promotion), Coming soon
  (8). Dishes are picked automatically and can be removed one by one.
- **Preview** in both languages, desktop and phone width. **Send a test** to any
  address.
- **Send:** the picked dishes are frozen on the issue. One delivery row per address
  (unique per issue and address). Rows go to the queue in batches of 100, a few seconds
  apart. Each batch claims a row before sending it, so a retried batch never sends an
  address twice. Failed rows can be retried from the issue's page.
- Every email: the reader's language, the one-click unsubscribe link and headers (5).
- **Subscribers:** a list with search, and Download CSV (email, language, source,
  dates). Needs `marketing.manage`.
- Bounces and complaints from the mail provider (if it offers a webhook) mark the
  address as unsubscribed.
- Queue note (CLAUDE.md): TEST and production share one Redis, so this relies on TEST's
  own `REDIS_DB` and prefix being set. `app:ready` (15) checks that.

**Apps:** backend, website (footer), order app, admin. Migration: yes. Route permission
change: yes.

---

## Phase 4: full Dhivehi

### 3b. Translate everything, Dhivehi URLs, the switch everywhere

**Builds on 3a.**

**Build:**
- **Order app:** every remaining string into `dv.json`, page by page. RTL checked on
  every page at 390 px (the phone-width spec from 18 runs in both languages).
- **Website:** every Blade string into `lang/dv.json` through `__()`. RTL layout
  checked page by page.
- **Dhivehi URLs** (iruali's `LocalePrefix` and `LocaleUrl`): public website pages also
  answer under `/dv/...`. English keeps today's URLs. `/dv` on a page that is not public
  (account, checkout, admin) is a 404. Each page carries `hreflang` en, dv and x-default
  in its head, and the sitemap moves from `?lang=dv` to `/dv/...`. An old `?lang=dv`
  link answers with a 301 to the `/dv` URL. The order app stays at `/order/` and keeps
  the language in the account, not the URL.
- **The admin switch:** today's `language_switcher_enabled` becomes "Dhivehi on the
  website and in the order app" on Admin → Website. Off: no language button anywhere,
  every `/dv` URL redirects (302) to its English page, emails and SMS go in English,
  and Dhivehi text stays stored for when it is turned back on.
- **Emails and SMS:** every customer message (registry rows) has its Dhivehi wording.
- Dhivehi copy is read by a Dhivehi speaker on the team before each part goes live.

**Apps:** order app, website, backend. No migration beyond 3a.

**Built (2026-10-18):** `/dv` addresses, hreflang and the sitemap; every order app string in
`dv.json`; the website's fixed wording and built-in content in `lang/dv.json`; customer texts
(`sms_templates.body_dv`, the one migration) and emails in the customer's language. The legal
pages stay English, and all the Dhivehi is a draft for a Dhivehi speaker to read before the
switch goes on.

---

## Decisions taken (best-practice defaults)

These are set so building can start without more questions. Any of them can change.

1. **Order app Dhivehi comes back** behind the existing admin switch, which stays off
   until the translation is read and ready. With it off nothing changes for customers.
   This reverses the redesign's v2.2 removal on purpose.
2. **A phone is always needed.** Social sign-in links to a phone customer and never
   makes an account without one.
3. **Marketing email is opt-in.** Order emails go as today; offers and newsletters only
   after the customer says yes and proves the email.
4. **Account security messages cannot be turned off.**
5. **The smoke test never rolls back after a migration.** It stops and alerts instead.
6. **Rate limits stay as they are** (feature 19 is already solved).
7. **One review place:** questions sit beside reviews in the admin, not on a page of
   their own.

## Needs the owner before building

- **Route permissions** for the new admin pages (Needs attention, Questions, Messages,
  Newsletter, Feeds): proposed permissions are listed in each PR and need a yes, per
  CLAUDE.md.
- **Apple Developer account** (paid) for Sign in with Apple. Google and Facebook are
  free.
- **A Dhivehi speaker** to read the Dhivehi copy before each part goes live.
- **A drill database** on cPanel for the monthly restore drill (one-time setup).

## Order at a glance

1. Phase 0: 19 and 18 together, then 17, 15, 14, 16 (16 runs on TEST for a week first).
2. Phase 1: 3a, 2, 5, 1.
3. Phase 2: 13, 8, 6, 7, 9.
4. Phase 3: 10, 12, 11, 4.
5. Phase 4: 3b.

Each phase's features are mostly independent. The real dependencies are: 2 before 1, 4
and 5; 5 before 4, 8 and 13; 3a before anything with new customer wording; 14 picks up
rows from 7 and 9 as they land; 6 before 11's ratings.

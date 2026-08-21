# Improvement plan — August 2026

Eight items, written to be picked up one at a time. Each is independent; the
order is my recommendation, not a dependency chain. **Do not do all eight in
one branch** — one PR per item, so a problem in one doesn't hold up the rest.

Context that shapes the priorities: at the time of writing, production and TEST
both have **zero orders** (7 items, 1 user, 2 customers). This is a pre-launch
system. Items 1–5 are cheap now and expensive later; items 6–8 only start
paying once there is a real menu and real traffic.

---

## 1. Customer auth must issue bearer tokens

**Why.** A native mobile app has no browser cookie jar, no CSRF cookie dance,
and no SameSite semantics. `CustomerAuthController` only ever calls
`Auth::guard('customer')->login($customer)` — it never mints a token. As it
stands a mobile app **cannot sign a customer in at all**. The protected routes
already accept bearer tokens, so this is a small change now and an
architectural crisis discovered mid-project later.

**Files**
- `backend/app/Http/Controllers/Api/Auth/CustomerAuthController.php`
  — `passwordLogin()` (~line 88), `verifyOtp()` (~215), `guestSession()` (~410),
  `logout()` (~302)
- `backend/routes/domains/auth.php` — customer routes already use
  `['auth:sanctum', 'customer.token']`, so the API side needs no change
- Pattern to copy: `StaffAuthController::issuePosStaffToken()` — token name,
  abilities, TTL from config

**Approach**
- Keep the session login exactly as it is. The `/order` SPA depends on it and
  must not change behaviour.
- Add an **opt-in** token: when the request carries something like
  `client=mobile` (or a device identifier), also return
  `{ token: '...' }` alongside the existing payload. Web callers that don't ask
  get byte-identical responses.
- Abilities: `['customer']`, matching what `customer.token` checks.
- TTL: add `sanctum.customer_token_ttl_hours` next to the existing
  `pos_token_ttl_hours`. A customer phone is not a till — pick a longer TTL and
  say why in a comment.
- `logout()` must revoke the current token when one was used, and still clear
  the session when it wasn't.

**Done when**
- A test signs in via `verifyOtp` with the mobile flag, gets a token, and uses
  it as a `Authorization: Bearer` header to reach `GET /api/customer/me`.
- A test proves the **existing web flow is unchanged** — no token in the
  response, session cookie still set. This is the one that protects `/order`.
- A test proves logout revokes the token it was called with.

**Watch out for**
- Do not put the token in `localStorage` in the `/order` SPA. It deliberately
  uses session cookies (see the comment at the top of
  `apps/online-order-web/src/api/client.ts`) and that should stay.
- `guestSession()` also needs a token, or guest checkout won't work on mobile.

---

## 2. Consolidate auth into `@shared`

**Why.** There are three hand-rolled implementations of the same thing.
`apps/kds-web/src/App.tsx` does `localStorage.getItem("kds_token")`, generates
its own `kds_device_id`, and renders its own login form. POS and delivery each
have their own. `@shared` uptake is 1 import in delivery and 2 in KDS. Three
copies of security code *will* drift, and this is also the honest answer to
"should we merge the apps" — share the code, keep the deploys separate.

**Files**
- `packages/shared/src/api/` — already has `client.ts`, `csrf.ts`,
  `endpoints.staff.ts`, `endpoints.customer.ts`. Add auth alongside.
- `apps/kds-web/src/App.tsx`
- `apps/delivery-web/src/`
- `apps/pos-web/src/` (largest; do it last)

**Approach**
- Add `packages/shared/src/auth/` with a token store, a device-id helper, and a
  login hook — **parameterised by principal** (`staff` | `customer` | `driver`),
  because those are genuinely different token types, not variants.
- Migrate in order of size: **delivery → KDS → POS**. Each migration is its own
  PR. Stop and reassess after delivery — if the abstraction doesn't fit the
  second app cleanly, it's the wrong abstraction.
- Do not change any storage key (`kds_token` etc.) during the move, or every
  signed-in device is logged out on deploy.

**Done when**
- Each migrated app has zero direct `localStorage` token access.
- Existing app tests still pass unchanged — the behaviour is identical, only
  the implementation moved.

**Watch out for**
- POS has offline requirements the other two don't. Do not flatten those into a
  shared abstraction just to make the shapes match.

---

## 3. Dedupe `fonts.css`

**Why.** Two copies kept in sync by hand — the file's own header says so:
`packages/shared/src/styles/fonts.css` is called the canonical copy, and
`backend/public/css/fonts.css` the Blade/public copy. Nothing enforces it. This
already caused work during the Dhivehi font PR.

**Files**
- `packages/shared/src/styles/fonts.css`
- `backend/public/css/fonts.css`

**Approach**
- Preferred: generate the public copy from the canonical one in
  `scripts/build-all.sh`, so it cannot drift.
- Minimum acceptable: a test that reads both and fails if they differ. Cheap,
  and it turns a silent problem into a loud one.

**Done when** editing only the canonical file updates both, or CI fails when
they diverge.

**Watch out for** the absolute `/fonts/…` URLs — the comment at the top explains
they must stay absolute because the sheet is bundled into `/admin/assets/` and
`/order/assets/` where relative paths break.

---

## 4. Cloudflare Cache Rule — **owner task, no code**

Not something Cursor can build. Recorded here so it isn't lost.

`/css/dhivehi-font.css` is served with `Cache-Control: public, max-age=60` by
the app, but Cloudflare overwrites it with its default 4-hour Browser Cache TTL
(`max-age=14400`, confirmed on both TEST and production). After uploading a
font and publishing, returning visitors keep the old one for up to four hours.

Cloudflare dashboard → Caching → Cache Rules:

```
URI Path equals /css/dhivehi-font.css  →  Browser Cache TTL: Respect Origin
```

Targeted to this one path, because everything else is Vite-hashed filenames
where a 4-hour browser TTL is correct.

---

## 5. Alerting for a dead scheduler or queue worker

**Why.** On 2026-08-21 both the scheduler and the queue worker were found dead
on production. Three independent faults, none of which left any trace, and it
surfaced by accident while checking something unrelated.

The pieces already exist — `SystemHealthService::checkQueueWorker()` and
`checkScheduler()`, `QueueWorkerHeartbeatJob`, `SchedulerHeartbeat`,
`SchedulerRunTracker`, and `$alertOnFailure` / `$trackSuccess` in
`routes/console.php`. **The gap is that all of it runs inside the scheduler.**
A dead scheduler cannot alert about itself.

**Files**
- `backend/app/Domains/System/Services/SystemHealthService.php`
- `backend/routes/console.php`
- `backend/app/Console/Commands/SchedulerHeartbeat.php`

**Approach**
- Needs a **dead-man's switch**: something *outside* cron that notices the
  absence of a heartbeat. Options, cheapest first:
  1. `SchedulerHeartbeat` pings an external monitor (healthchecks.io or
     similar) on every run; the monitor alerts when a ping doesn't arrive.
     Requires no new infrastructure and survives the whole server being down.
  2. The admin dashboard shows a loud banner when
     `checkScheduler()` reports a last-run older than ~10 minutes. Only helps
     when someone is looking, but it is free.
- Do **both** if practical. (1) catches it at 3am; (2) makes it visible.

**Done when** stopping cron for 15 minutes produces an alert somewhere a human
will see. Test it by actually stopping cron — a test that mocks the check
proves nothing about the alert path.

**Watch out for** alert fatigue: a check that fires during every deploy will be
muted within a week and then it may as well not exist.

---

## 6. One server-rendered `/menu` page

**Why.** `/order/menu` returns `<body><div id="root"></div></body>`. There is no
per-item URL at all — items are a query parameter (`?item=123`) that opens a
sheet — so there is nothing for an individual product to rank as. Meanwhile
`layout.blade.php` tells Google `"hasMenu": ".../order"`, pointing the crawler
at that empty div.

**Deliberately one page, not 58 item pages.** Per-item URLs are a bigger job
with an unproven return — see item 8's note on measuring first.

**Files**
- `backend/routes/web.php` — new `GET /menu`
- `backend/resources/views/` — new `menu.blade.php` extending `layout.blade.php`
- Existing server-rendered pages to copy the shape from: `/contact`, `/hours`,
  `/prayer-times`

**Approach**
- Real HTML: every active item with name, description, price, image, grouped by
  category. No JS required to read it.
- `Menu` + `MenuItem` JSON-LD alongside the existing `Restaurant` block.
- Each item gets an "Order" button linking to `/order/menu?item={id}` — the
  handoff into the SPA, where cart and checkout stay.
- Dhivehi: the page must respect `[lang="dv"]` like the rest of the Blade site.

**Done when** `curl https://bakeandgrill.mv/menu | grep -i bajiya` finds the item
without executing any JavaScript.

**Watch out for** caching — this page changes whenever the menu does. Don't put
a long `max-age` on it without a bust mechanism.

---

## 7. Fix `hasMenu`, add `sitemap.xml`

**Why.** Small, and closes the loop on item 6.

**Files**
- `backend/resources/views/layout.blade.php` — the JSON-LD block, ~line 180
- `backend/public/robots.txt` — currently `User-agent: * / Disallow:` with no
  sitemap reference
- `backend/routes/web.php` — new `GET /sitemap.xml`

**Approach**
- Point `hasMenu` at `url('/menu')` once item 6 exists. **Do not do this
  before**, or it points at a 404.
- Generate `sitemap.xml` from the real routes: `/`, `/menu`, `/contact`,
  `/hours`, `/terms`, `/refund`, `/prayer-times`. Server-rendered pages only —
  listing SPA routes a crawler cannot read is worse than omitting them.
- Add `Sitemap: https://bakeandgrill.mv/sitemap.xml` to `robots.txt`.

**Done when** the sitemap validates and every URL in it returns 200 with real
server-rendered content.

---

## 8. Review the 82 website-only content keys

**Why.** Content keys are scoped per app: 73 are shared between `website` and
`order_app`, 82 are website-only, 21 order-app-only. When a mobile app arrives
it reads the same content API, so anything website-only is invisible to it —
and someone will hardcode it instead. Widening `apps` is a config edit now and
a much more annoying change once a shipped app depends on the answer.

**Files**
- `backend/config/content.php`

**Approach**
- Go through the 82 and ask, per key: *would a mobile customer want this?*
  Offers, about, opening hours, contact, delivery areas — probably yes.
  Website-chrome and SEO metadata — no.
- Add `order_app` to the `apps` array for the ones that qualify.
- Register `mobile_app` in `ContentRegistry::APPS` only when the mobile project
  actually starts; adding it early means 175 keys to answer for with no client.

**Done when** the shared/website-only split is a deliberate decision per key
rather than an accident of when each key was added.

**Watch out for** the resolver snapshot test
(`ContentResolverSeparationSnapshotTest`) — it pins key/app combinations and
will need regenerating. That is expected; read the diff to confirm only the
keys you meant have changed.

---

## Not on this list, deliberately

- **Combining the website and `/order` app** — a rewrite of 11.5k lines of
  Blade plus 45k lines of React, i.e. both the acquisition and revenue
  channels, to save one duplicated CSS file and a session mechanism. Inertia
  would be a fine greenfield choice; it is not worth a migration.
- **Merging POS / KDS / delivery** — delivery authenticates a different
  principal on a device you don't control; KDS deserves its own failure domain
  so a POS bug cannot blank the kitchen screen during service.
- **Per-item SEO URLs** — check Search Console after item 6 first. If the
  traffic is all brand plus Maps, 58 item pages will move nothing.

## Worth more than any of the above, while pre-launch

Load the real menu and push **one order end to end** — order → kitchen →
payment → receipt. The dead scheduler and queue worker found on 2026-08-21 are
exactly the class of bug that only appears when something actually runs, and
neither showed up in 13,000 passing test assertions.

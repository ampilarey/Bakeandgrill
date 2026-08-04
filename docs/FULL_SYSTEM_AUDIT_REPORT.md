# Full System Audit Report

**Date:** 2026-08-03  
**Branch:** `cursor/full-system-audit-f876`  
**Environment:** local (`php artisan serve` @ `127.0.0.1:8000`, `APP_ENV=local`)  
**Scope:** Parts A–F — report only, no product fixes  
**Method limits:** Completion pass (2026-08-04) ran a throwaway Playwright + system Chrome browser pass against a seeded DB (see “Completion pass”). First-pass static/API probes remain below.

Known issues excluded from re-reporting (per brief): admin API call↔route resolution, missing imports/routes, green suites, dead Website Settings tab, settings query-string nav, 18 nav/API permission drifts.

---

## Part A — Runtime and UI

### Findings

| Severity | Area | What is wrong | Where | Notes |
|---|---|---|---|---|
| MAJOR | Admin / GST | GST Output Statement Excel export returns opaque **500** when seller TIN / taxable activity number are unset | `GET /api/reports/finance/gst/export/output-statement.xlsx` → `GstExportService.php:43` → `GstReportController::exportOutputXlsx` | Exception text is clear (`Seller TIN is required…`) but client only sees `{"message":"Server error. Please try again."}`. CSV summary + other GST exports returned 200. Should be **422** with the validation message. |
| MAJOR | Admin / SMS Automations | Failed settings load leaves toggles looking ON | `apps/admin-dashboard/src/pages/SmsPage/AutomationsTab.tsx` (`loadSettings` / `isEnabled`) | No `catch`; `isEnabled` treats missing keys as enabled (`v === undefined \|\| …`). Failed GET can show all events enabled. |
| MAJOR | Admin / GST page | Dashboard tab can render empty shell after failed load | `apps/admin-dashboard/src/pages/GstPage.tsx:56-66` | `Promise.all(...).then(...).finally(setLoading(false))` with no `.catch`. On failure `summary` stays null → no spinner, no error, no stats. |
| MAJOR | POS / Ops refunds | “Record refund” has **no confirmation** step | `apps/pos-web/src/components/OpsPanel.tsx:839` → `useOps.handleCreateRefund` | Receipts refund flow is two-step; Ops fires `createRefund` on one click. Not exercised (destructive). |
| MAJOR | Order / TV signage | Config fetch failure with empty local cache → permanent “Loading board…” | `apps/online-order-web/src/pages/SignagePage.tsx:231-242,394-458` | `catch` restores cache only; never sets `offline`/error when cache missing; `isLoading = !config && !offline` never clears. |
| MINOR | Admin / GST tabs | Tab fetches fail silently (empty tables) | `GstPage.tsx:69-91` | Output/Input/Invoices have no `.catch`; Ledger swallows to `[]`. |
| MINOR | Admin / Settings | Dine-in QR utility unreachable from nav | `WebsiteSettingsSubPage.tsx` (component unused by `SettingsPage`) | After Website Settings tab removal, dine-in QR/link only exists as orphaned component + tests. |
| MINOR | Admin / mobile | Service Availability toast sits under bottom tab bar | `ServiceAvailabilityPage.tsx` + `.svc-avail-toast` (`bottom: 12px`) | Ignores `--admin-tabbar-h`. Static. |
| MINOR | Admin / mobile | Purchase Request detail uses 6-column grid without responsive helper | `PurchaseRequestsPage.tsx:~488` | Will crush at ~390px. |
| MINOR | Admin / mobile | Several forms use fixed multi-column grids without `form-grid-*` / `data-responsive-grid` | DiscountCards, ShoppingLists, WasteLogs, MediaLibrary, Customers | Same root cause; modals partially mitigate. |
| MINOR | KDS / mobile | Dense header action cluster; almost no mobile CSS | `apps/kds-web/src/App.tsx` header; thin `index.css` | Phone use stacks tiny targets. |
| MINOR | KDS | “86” / Restore is one-tap, no confirm | `kds-web/src/App.tsx` `handle86` | Global availability change; easy mis-tap. Not exercised. |
| MINOR | Delivery | “Mark as Delivered” is one-tap, no confirm | `delivery-web` `StatusStepper` / `DetailPage` | Terminal status. Not exercised. |
| MINOR | Delivery | No React ErrorBoundary | `delivery-web` `main.tsx` / `App.tsx` | Render throw → blank screen (order/pos/kds have boundaries). |
| MINOR | Delivery / mobile | Stepper labels `0.6rem` + `nowrap` on 4 columns | `StatusStepper.tsx` | Risk of clipping at 390px. |
| INFO | Local serve / SPA deep links | Under `php artisan serve`, deep links like `/order/tv`, `/kds/*`, `/driver/history` return Blade 404 HTML; `/admin/dashboard` 302→`/admin` | `public/{order,admin,kds,pos,driver}/` asset dirs + PHP built-in server | Laravel HTTP kernel **does** match `order.spa` etc. and returns 200 (`index.php/order/tv` also 200). Likely local-serve quirk; production depends on Apache/nginx `try_files` / `.htaccess`. Confirm on TEST host before treating as prod blocker. |
| INFO | Local catalog (first pass) | Public `/api/items` returned empty list | Local DB then: 1 inactive item | **Superseded by completion pass seed** (82 items / 8 categories / 20 customers / 45 orders). |

### What was checked

| App | Routes / surfaces | How |
|---|---|---|
| admin-dashboard | 55 nav items; 55 feature routes (+3 legacy content redirects); Settings path tabs verified fixed | Static + owner-token GET probes of list/overview endpoints (orders, promotions, P&L, reservations, drivers, webhooks, xero, health, inventory, purchases, PR, suppliers, tables, waste, kitchen-production, GST summary, signage, media, SMS, staff, service-availability, content, KDS orders, site-settings) |
| online-order-web | 27 routes incl. `/order/tv`, `/order/tv/:screen` | Static SignagePage; SPA shell via kernel/`index.php`; public API health/signage/items |
| pos-web | 12 panes (no URL router) | Static OpsPanel refund path vs Receipts confirm |
| kds-web | Single SPA | Static header/86 patterns |
| delivery-web | 5 routes (`/driver/*`) | Static stepper / ErrorBoundary |

### What passed (not reported as findings)

- Owner-authenticated core list/overview GETs returned **200** (orders, finance P&L, inventory, purchases, kitchen-production, specials, gift-cards, reviews, media, staff, content hub, system health, signage overview, KDS orders, site-settings, public signage config).
- Settings hub no longer has dead Website Settings tab; nav uses `/settings/permissions` and `/settings/notifications`.
- Admin route↔nav coverage aligned (aside from `catering/:id` detail and known content redirects).
- SPA root shells `/admin/`, `/order/`, `/pos/`, `/kds/`, `/driver/` return 200.

### Findings by severity (Part A)

- BLOCKER: 0  
- MAJOR: 5  
- MINOR: 10  
- INFO: 2  

### Untested (Part A) — updated after completion pass

- ~~Full browser pass~~ → **Covered** in Completion pass Gap 1 (Playwright, owner session, desktop + 390px).
- ~~390px interactive layout~~ → **Covered** for admin/order/kds/driver (overflow + bottom-nav overlap heuristics).
- Form submit paths that write data (orders, payments, SMS, print, refunds, 86, delivery status) — still skipped (destructive / external).
- TV board end-to-end with paired device + playlist — config/XHR probed; board stayed on “Loading board…” under rate-limit noise (see Gap 1).
- Low-permission UI (known nav drift excluded).
- Whether TEST/cPanel deep-links hit the same `artisan serve` PATH_INFO quirk — local-only; production Apache/nginx still to confirm.
- KDS authenticated board content — token injection left login shell (see Gap 1); not a product “empty page as owner” signal for admin.

---

## Part B — Security

Verified with ephemeral staff user `audit-empty@local` (role with **zero** permissions, Sanctum `staff` token) plus unauthenticated probes. No SMS was delivered (send returned 422 before carrier).

### Findings

| Severity | Area | What is wrong | Where | Notes |
|---|---|---|---|---|
| BLOCKER | AuthZ / receipts | Any staff token can mint a **public receipt URL** for an order | `GET /api/orders/{orderId}/receipt-link` — `orders.php:63`; no `permission:orders.receipts` | Confirmed: empty-perm token → **200** `{"link":"http://localhost:8000/receipts/…"}`. Anyone with a stolen/low staff token can share receipt links. |
| BLOCKER | AuthZ / receipts | Receipt **send** has no permission middleware | `POST /api/receipts/{orderId}/send` — `orders.php:64` | Confirmed: empty-perm token reached controller (**422** `Recipient not available` — auth passed). Would SMS/email when recipient exists. |
| MAJOR | AuthZ / orders | `GET /api/orders` and `GET /api/stream/orders` have no `orders.view` | `orders.php:22`; `devices.php:46` | Empty-perm: list **200** (empty dataset here); stream **200** (SSE pings). Show for order 5 returned **403** (controller visibility). Live streams/lists should deny, not soft-filter. |
| MAJOR | AuthZ / customers | `GET /api/customers/{id}/addresses` missing `customers.lookup` | `orders.php:87-88` (throttle only) | Sibling POS routes require `customers.lookup`. Confirmed: empty-perm → **200** `{"addresses":[]}` for customer 1; `customers/search` correctly **403**. |
| MINOR | AuthZ / kitchen | `POST /api/kitchen-production/{id}/cancel` has no route permission; `cancel_own` unused | `kitchen.php`; `KitchenProductionService::cancelBatch` | Relies on produced_by / manage checks in service. Catalog slug `kitchen.production.cancel_own` unused. |
| MINOR | AuthZ / SMS | Control-center GET relies on controller checks only | `marketing.php` ~149 | Empty-perm correctly **403** via controller; route lacks middleware (defense-in-depth). |
| INFO | AuthZ | Unauthenticated `/api/admin*` rejected | sample: customers, promotions, staff, site-settings | All **401**. Clean. |
| INFO | Secrets | No live secrets in committed client bundles / `.env.example` | apps + public dist grep | `.env` gitignored. Placeholders only. |
| INFO | SQLi | No user-input SQL concatenation found | `whereRaw`/`selectRaw` spot-check | Bindings / fixed expressions. |
| INFO | Mass-assignment | Broad `$fillable` on some models but audited controllers whitelist | Customer/User/Order | No live `$request->all()` privilege path found in this pass. |

### Known (not re-opened as new)

- `kitchen.production.view_all` vs route `view_own` mismatch still present (nav vs list middleware).

### What was checked

- Empty-perm staff token against orders list/show/stream, receipt-link, receipt-send, customer addresses vs search, kitchen-production, admin customers/promotions, delivery drivers, SMS control-center.
- Unauthenticated admin/site-settings.
- Static review: admin route middleware presence, customer IDOR scoping (customer-token paths), secrets grep, SQL raw usage, fillable patterns.

### What passed

- Unauthenticated admin APIs → 401.
- Permission-gated admin endpoints (customers.manage, promotions.manage, orders.manage drivers) → 403 for empty-perm.
- Customer-token routes appear ownership-scoped in code review.
- No committed live API keys found.

### Findings by severity (Part B)

- BLOCKER: 2  
- MAJOR: 2  
- MINOR: 2  
- INFO: 4  

### Untested (Part B)

- Full IDOR matrix across every `{id}` staff endpoint with two real customers (only addresses probed).
- Receipt send with a real phone (would hit SMS — skipped).
- Cross-store multi-tenancy (single-tenant app).


---

## Part C — Data integrity

Read-only review of migrations + money paths. No migrate/seed run.

### Findings

| Severity | Area | What is wrong | Where | Notes |
|---|---|---|---|---|
| MAJOR | Migration / destructive | Gift-card hash migration **deletes all gift cards + transactions** before altering schema | `database/migrations/2026_05_24_100000_hash_gift_card_codes.php:25-26` | Comment assumes empty test data. Already-applied envs OK; catastrophic if replayed or applied late on a DB that still has cards. |
| MAJOR | Money dual-store | Decimal MVR columns + nullable `*_laar` coexist; many paths still `(float)*100` / JS `Math.round(n*100)` | Orders schema; `OrderSettlement.php`; POS `useOrderCreation.ts`, `useCart.ts`, `ChargeOverlay.tsx` | Classic binary float drift (e.g. 19.99). Server has `LaariConverter` but clients and some PHP paths still convert via float. |
| MINOR | Migration / unique | `users.phone` unique added without dedupe | `2026_05_01_000001_add_unique_phone_to_users_table.php` | Fails on duplicate non-null phones. |
| MINOR | Migration / unique | `customers.email` and `daily_specials (item_id,start,end)` unique without collapse | `2026_03_17_000001_add_missing_db_constraints.php` | Contrast: site_settings scope migration cleans dupes first. |
| MINOR | Indexes | Polymorphic `stock_movements.reference_type/id` — no composite index, no FK | create stock_movements migration; `StockManagementService` lookups | Orphan + slow reverse lookups. Core FKs on `orders.customer_id`, `order_items.order_id`, `sms_logs.customer_id` are present. |
| INFO | Orphans | `nullOnDelete` on stock/sms/order customer links | various | Intentional audit retention; reports must nullsafe. |

### What was checked

- Destructive / unique migrations spot-check; money float grep across backend + POS; FK/index presence on high-traffic tables; stock_movements / sms_logs schema.

### What passed

- Primary order/item/customer FKs and common lookup indexes exist.
- No new migrate attempted (per rules).

### Findings by severity (Part C)

- BLOCKER: 0  
- MAJOR: 2  
- MINOR: 3  
- INFO: 1  

### Untested (Part C)

- Live orphan row counts on TEST DB (no production DB access).
- Full migration dry-run against a prod dump.


---

## Part D — Performance

### Findings

| Severity | Area | What is wrong | Where | Notes |
|---|---|---|---|---|
| MAJOR | Client bundles | Chunks over 500KB in shipped public assets | `backend/public/admin/assets/prepareUpload-_v4Ix60h.js` **~1.3MB**; `backend/public/pos/assets/prepareUpload-BkPcRPyB.js` **~1.3MB**; `backend/public/pos/assets/index-C7Uo8-Yg.js` **~632KB** | `prepareUpload` is lazy-imported (mitigation) but still heavy HEIC/image stack. POS main chunk exceeds budget on first load. |
| MINOR | N+1 | Per-supplier query inside `map` | `SupplierIntelligenceController::priceComparison` | One latest-price query per supplier. |
| MINOR | N+1 | AB stats = multiple COUNTs per campaign on list | `SmsCampaignController::index` → `SmsCampaign::computeAbStats()` | Paginated (20) but can approach ~100+ queries/page with AB. |
| MINOR | Unbounded lists | Full `get()` without hard cap | `SupplierIntelligenceController::allPerformance`; `KdsController::index` (open statuses — product-shaped); `PosEventController` date window; `ScheduleController::index` | KDS open-board is intentional; supplier/perf + long windows can grow. |

### What was checked

- `find` for `*.js` >500KB under `backend/public` and app `dist`.
- Controller patterns for N+1 / unbounded lists.
- Spot GET latency not systematically measured (owner probes were sub-second for list endpoints on sparse local data — not reported as passes/fails).

### What passed

- Most admin list endpoints use pagination.
- Heavy upload chunk is code-split from admin initial bundle.

### Findings by severity (Part D)

- BLOCKER: 0  
- MAJOR: 1  
- MINOR: 3  
- INFO: 0  

### Untested (Part D) — updated after completion pass

- ~~N+1 / query counts on hot paths~~ → **Covered** in Completion pass Gap 2 (query log against seeded DB).
- Bundle sizes from first pass still stand; not re-measured.

---

## Part E — Code health

### Findings

| Severity | Area | What is wrong | Where | Notes |
|---|---|---|---|---|
| MAJOR | Permission aliases | FE reverse-aliases `devices.manage` ← `devices.approve`; BE only allows `devices.approve` ← `devices.manage` | `navConfig.ts` `PERM_ALIASES`; `PermissionCatalog::SATISFIED_BY` | Same class of bug as prior SMS/webhooks drift. `can('devices.manage')` true for approve-only on FE; API still exact for manage. |
| MINOR | Duplicated money math | POS client `toLaar` via `Number*100` vs server `LaariConverter` | `useOrderCreation.ts`, `useCart.ts`, `ChargeOverlay.tsx` vs backend Money/Laari | Soft UI can disagree with server before recalc (ties to Part C). |
| MINOR | God files | Several files ≫800 lines mixing many jobs | Admin: `ForecastPage.tsx` (~2100), `SignagePage.tsx` (~1966), `ContentHubPage.tsx` (~1588), `finance.ts` (~1547); POS: `useOrderCreation.ts` (~1826), `OrderCart.tsx` (~1672); BE: `ReportsService.php` (~1581), `GiftCardController.php` (~1227) | Split on next touch. |
| INFO | Dead code | `online-order-web/src/App.tsx` unused stub (entry is `main.tsx`) | order app | Covered only by legacy test. |
| INFO | Stale skipped test | KDS bump status-machine test kept as archaeology | `OrderStatusMachineTest` | Rewrite or delete (see Part F). |

### What was checked

- FE vs BE permission alias direction for devices (post–permission-drift cleanup).
- Money conversion duplication.
- Line-count offenders; dead entry stub; TODO/FIXME sample (few actionable app TODOs).

### What passed

- Admin `api.ts` barrel is intentional re-export, not dead weight.
- Recent settings/nav cleanup already removed dead Website Settings tab (excluded).

### Findings by severity (Part E)

- BLOCKER: 0  
- MAJOR: 1  
- MINOR: 2  
- INFO: 2  

### Untested (Part E)

- Exhaustive dead-export graph (knip/ts-prune not run).


---

## Part F — Tests and config

### Findings

| Severity | Area | What is wrong | Where | Notes |
|---|---|---|---|---|
| MAJOR | Config cache | `env()` read outside `config/` in request path | `CustomerAuthController.php` (`OTP_DEV_RETURN` ×2); `VideoProcessor.php` (`config('media.ffmpeg_path', env('FFMPEG_PATH'))` — **no `config/media.php` exists**) | After `php artisan config:cache`, `env()` returns null outside config files. OTP dev-return and ffmpeg path silently break. |
| MINOR | Skipped tests (the 3) | Always/soft skips in green suite | See quotes below | Confirmed via filtered run: 3 skipped. |
| MINOR | Coverage gap | BML initiate soft-skips instead of asserting Http::fake success path | `BmlReturnUrlTest::test_payment_initiation_builds_return_url_with_order_id` | Payment contract gap. Other payment/webhook/refund/stock/permission suites are comparatively strong. |
| MINOR | Coverage gap | FE/BE permission alias reverse-grants not tested | devices (and historically SMS/webhooks) | Route permission snapshot won’t catch nav over-grant. |
| INFO | Machine-specific | Host paths / brand URL defaults | `.env` redis sock path; `VideoProcessor` `/usr/bin` probes; `https://bakeandgrill.mv` defaults in service_availability/content/SMS demos | Fine on sg-s2; brittle in bare containers. |
| INFO | CLI env() | Staff CLI create gated by `env('ALLOW_STAFF_CLI_CREATE')` | Create/Activate/SetStaff commands | CLI-only; lower risk than HTTP path. |

### The 3 skipped tests (quoted)

1. **`OrderStatusMachineTest::test_kds_bump_pending_to_ready_then_completed`**  
   > `KDS no longer supports pending→ready bump; cashier marks ready from POS.`

2. **`ImageUploadLimitsTest::test_webp_mimes_excluded_when_unsupported`**  
   > `GD supports WebP on this runtime — exclusion path not exercised.`

3. **`BmlReturnUrlTest::test_payment_initiation_builds_return_url_with_order_id`**  
   > `BML payment initiation not available in this test environment.`

### What was checked

- `rg env(` under `app/`; absence of `config/media.php`.
- Filtered PHPUnit for the three skips.
- Coverage notes for payments/orders/stock/permissions (qualitative).

### What passed

- Large feature suites exist for orders, payments/webhooks, stock, permissions (not “untested domains”).
- Config files generally used for runtime settings.

### Findings by severity (Part F)

- BLOCKER: 0  
- MAJOR: 1  
- MINOR: 3  
- INFO: 2  

### Untested (Part F)

- Coverage % metrics (phpunit clover / vitest coverage not generated).

---

## Cross-cutting summary (read this first)

Highest-value themes spanning apps/parts:

1. **Staff AuthZ holes on receipts (BLOCKER)** — Part B. Any staff token can mint public receipt links and reach receipt-send without `orders.receipts`. Same root cause as missing route middleware on “core staff” order helpers (`orders` index/stream, customer addresses). Fix as one middleware pass on `orders.php` / `devices.php` stream routes.

2. **Money still half-migrated to laari (MAJOR)** — Parts C + E + POS. Float/`*100` in PHP and JS beside integer laari columns. One conversion library on both sides; stop dual-writing decimals for tender math.

3. **Silent failure / wrong-default UI (MAJOR)** — Part A. GST export → opaque 500 when TIN missing; GST dashboard and SMS Automations hide errors (and Automations defaults toggles ON). Pattern: `try/finally` without `catch`, or exceptions mapped to generic 500.

4. **Destructive / confirm-less money & status actions (MAJOR/MINOR)** — Parts A. POS Ops refund (no confirm) vs Receipts (confirm); KDS 86; delivery Mark Delivered. Shared UX rule: terminal money/status needs confirm.

5. **Permission alias directionality FE≠BE (MAJOR)** — Part E (+ historical Part A nav drift already fixed for SMS/webhooks/menu). Remaining: `devices.manage` ↔ `devices.approve`. Add a parity test against `PermissionCatalog::SATISFIED_BY`.

6. **`env()` vs `config:cache` (MAJOR)** — Part F. OTP_DEV_RETURN + missing `config/media.php` for ffmpeg. Deploy already runs `config:cache` — these reads are dead after cache.

7. **Heavy client chunks (MAJOR)** — Part D. Shared `prepareUpload` ~1.3MB on admin and POS; POS index ~632KB.

8. **TV/signage resilience (MAJOR)** — Part A. Empty cache + failed config = infinite spinner. Same offline-first pattern should set an error state.

### Suggested fix-prompt batches (for later)

| Batch | Findings | Why together |
|---|---|---|
| A | Receipt-link/send middleware; orders list/stream `orders.view`; customer addresses `customers.lookup` | One AuthZ pass on staff order/customer routes |
| B | GST 422 for missing TIN; GstPage/AutomationsTab error UI | Fail loudly, not wrongly |
| C | Laari-only tender path (POS + OrderSettlement leftovers) | Money integrity |
| D | `config/media.php` + move `OTP_DEV_RETURN` into config; FE devices alias parity test | Config-cache + permission parity |
| E | Ops refund confirm; signage empty-cache error; prepareUpload code-split review | UX + perf polish |

### Audit constraints / honesty

- Browser automation completed in Completion pass Gap 1 (Playwright + system Chrome; throwaway scripts not committed).
- No destructive writes, no SMS/payment capture, no printer jobs.
- Completion pass seeded local DB (82 items, 45 orders, 20 customers) before Gaps 1–6.
- Local `artisan serve` SPA deep-link quirk worked around with throwaway router; confirm Apache/nginx on TEST before prioritizing that INFO.

**Report tip:** branch `cursor/full-system-audit-f876` — commits per Part A→F. No PR opened. No product code changed.

---

## Completion pass — previously untested areas

**Date:** 2026-08-04  
**Seed:** `ImportMenuSeeder` + throwaway rest-seed → **82 items**, **8 categories**, **20 customers**, **45 orders** (mix of statuses), stock/snooze/specials flags, device `POS-001`, driver `+9607770099`. Owner session via PIN `+9607770001` / `1111` (`intent=admin` cookie auth).  
**Browser:** Playwright + `/opt/google/chrome/chrome` (no `playwright install`; `/opt/pw-browsers` absent). Throwaway SPA router fixed PHP built-in server `PATH_INFO` rewrite under `public/{admin,order,…}/index.html`. Scripts not committed.

### Gap 1 — Part A browser pass

#### Method

- Admin: 55 nav paths + 3 content redirects × desktop 1440 and mobile 390; owner Sanctum **session** login.
- Order app: 16 routes incl. `/order/tv` × desktop + 390.
- POS `/pos/`, KDS `/kds/` (+390), delivery `/driver/` (+ `/history`, `/profile` @ 390).
- Per page: API XHR status, console errors, content class (`CONTENT` / `EMPTY_SHELL` / `SPINNER_TIMEOUT` / `LOGIN_REDIRECT` / `ERROR_BOUNDARY`), horizontal overflow, bottom-nav overlap heuristic.
- Long-lived `/api/stream/**` aborted so navigations could finish.

#### Coverage summary

| Surface | Pages | CONTENT rendered | Horizontal overflow | Bottom-nav overlap |
|---|---:|---:|---:|---:|
| Admin desktop | 58 | **58** | 0 | n/a |
| Admin 390px | 58 | **58** | 0 | 9 pages (controls under tab bar) |
| Order desktop | 16 | 15 | 0 | 0 |
| Order 390px | 16 | 15 | 0 | 0 |
| POS | 1 | 1 (with 429 noise) | 0 | 0 |
| KDS | 2 | 0 (login shell) | 0 | 0 |
| Delivery 390px | 3 | 3 | 0 | 0 |

**Owner admin verdict:** With a seeded DB, every admin route visited rendered real page chrome + data/EmptyState — **not** an empty permission shell. The reported “some pages don’t load” is **not** explained by missing owner permissions on these 58 routes. Residual failures are specific API/CSP/rate-limit issues below.

#### Findings

| Severity | Area | What is wrong | Where | Notes |
|---|---|---|---|---|
| MAJOR | Admin / Supplier Intelligence | `GET /api/suppliers/performance` resolves as `suppliers/{id}` with `id=performance` → **404** model-not-found | Browser XHR on `/admin/supplier-intelligence`; confirmed curl: `{"message":"No query results for model [App\\Models\\Supplier] performance"}` | Static route is declared in `finance.php` before `/{id}`, but runtime still binds `{id}`. FE `api/finance.ts` `getSuppliersPerformance()` calls `/suppliers/performance`. Page still shows CONTENT chrome; performance table/API fails. |
| MAJOR | Delivery / history | `GET /api/driver/stats` returns **500** for authenticated driver | `/driver/history` XHR; confirmed with driver Bearer token | UI shows “Server error. Please try again.” History shell otherwise loads. |
| MAJOR | Order / TV | `/order/tv` stuck on **“LOADING BOARD…”** (EMPTY_SHELL) after wait | Playwright `order/tv` desktop+mobile | Aligns with first-pass SignagePage empty-cache finding. This run also saw **429** on content/settings and **419** on `signage/heartbeat` (CSRF), which can starve config. Treat as confirmed runtime failure under load + likely same empty-cache spinner bug. |
| MINOR | Admin / Signage | Inline script blocked by CSP on admin signage page | Console CSP `script-src` violations on `/admin/signage` | Page still CONTENT; preview/widget scripts may be dead. |
| MINOR | Order app / prayer times | `GET /api/prayer-times?island_id=102&date=…` → **422** on many order pages | Order SPA XHR | Non-fatal; footer/prayer widget fails validation. |
| MINOR | Admin / mobile | Bottom tab bar obscures in-page controls | 390px: delivery, online-ordering, delivery-settings, customers, reports (4 controls), service-availability, content-studio, content/order-app, content/website | Heuristic: non-tab clickables whose vertical center intersects tab bar. No horizontal overflow detected. |
| MINOR | Order / CSP | GTM/inline script CSP violations on every order route | Console on `/order/*` | Same class of issue as admin signage; marketing scripts blocked. |
| INFO | Admin build | Production admin bundle logs missing `VITE_API_BASE_URL` | Every admin page console error | Same-origin `/api` still works (session cookies); noisy false alarm in local audit. |
| INFO | Rate limiting | Rapid Playwright navigation tripped **429** on public order/POS endpoints | `/api/content`, `/api/site-settings/public`, `/api/auth/customer/check`, etc. | Inflates order/POS failure noise; not a single-user prod bug. Slow revisit would be cleaner. |
| INFO | KDS auth in harness | Injected POS staff token left KDS on login PIN screen | `/kds/` desktop+390 | `kds_token` key matches app; login still shown + asset **404**s. KDS board content **not** validated this pass — harness/device pairing gap, not admin-owner empty page. |
| INFO | Local SPA router | PHP built-in server rewrites `/admin/orders` → `PATH_INFO=/orders` via `public/admin/index.html` | `artisan serve` + `public/*/index.html` | Throwaway router forced front-controller env. First-pass INFO on deep-link 404s confirmed root cause; cPanel `.htaccess` likely fine. |

#### What passed (Gap 1)

- Owner can open all 58 admin surfaces with seeded data; lists (orders, menu, customers, inventory, etc.) render rows — **empty-shell-as-owner hypothesis rejected** for these routes.
- No admin horizontal overflow at 390px.
- POS shell reached CONTENT with device token (despite later 429s).
- Delivery active/profile routes CONTENT; only stats endpoint hard-failed.

#### Gap 1 severity counts

- BLOCKER: 0  
- MAJOR: 3  
- MINOR: 4  
- INFO: 4

### Gap 2 — Part D N+1 query counts

**Method:** Owner Sanctum staff token; `DB::enableQueryLog()` around HTTP kernel handles for ~96 significant GET list/detail endpoints against the seeded DB. Flag threshold: **>20 queries**. Also inspected pagination metadata on large list responses.

#### Findings

| Severity | Area | What is wrong | Where | Notes |
|---|---|---|---|---|
| MAJOR | Content hub | `GET /api/admin/content` fires **802** queries | Repeated `select "value" from "site_settings" where "key" = ? and "scope" = ? and "locale" = ? limit 1` **×516** | Classic per-key settings lookup inside a loop. ~90KB response. Will worsen as content keys grow. |
| MAJOR | Content export | `GET /api/admin/content/export` fires **206** queries | Same `site_settings` single-key select **×206** | Same anti-pattern as index. |
| MAJOR | SMS control center | `GET /api/admin/sms/control-center` fires **52** queries | `site_settings` single-key select **×34** | Same settings N+1 family. |
| MAJOR | Admin customers list | `GET /api/admin/customers` fires **22** queries for 20 customers | Per-customer orders aggregate `COUNT/SUM/MAX … where customer_id = ?` **×20** | Classic N+1; should be one grouped subquery/join. Response includes `meta.total` but no `per_page` — returns full set. |
| MINOR | Customer metrics | `GET /api/admin/customers/metrics` fires **23** queries | Repeated customer/order count subqueries (×3 patterns) | Over threshold; dashboard widget. |
| MINOR | Categories payload | `GET /api/categories` returns **unbounded** list with nested `items` (~88KB for 8 cats) | No `per_page` / pagination keys | Embeds items per category; will grow with menu size. |
| MINOR | KDS orders | `GET /api/kds/orders` returns **unbounded** `orders[]` (27 rows here) | No pagination | Acceptable for active kitchen board if filtered to open tickets; no hard limit visible. |
| INFO | Items list | `GET /api/items` paginates with **per_page=100** | 82 items → single page ~108KB | Pagination exists but default page size is large for admin menus. |
| INFO | Orders list | `GET /api/orders` paginated (30/page here) | 9 queries | Healthy relative to content hub. |

#### Over-threshold summary (>20 queries)

| Queries | Endpoint | Dominant repeated SQL |
|---:|---|---|
| 802 | `GET /api/admin/content` | `site_settings` by key/scope/locale ×516 |
| 206 | `GET /api/admin/content/export` | same ×206 |
| 52 | `GET /api/admin/sms/control-center` | same ×34 |
| 23 | `GET /api/admin/customers/metrics` | customer segment counts |
| 22 | `GET /api/admin/customers` | per-customer paid-order aggregate ×20 |

#### List endpoints without meaningful pagination/limit (seeded visibility)

| Endpoint | Observation |
|---|---|
| `GET /api/categories` | Full array + nested items; no page meta |
| `GET /api/kds/orders` | Full `orders` array; no page meta |
| `GET /api/admin/customers` | Returns all rows (`meta.total=20`, no `per_page`) |
| `GET /api/admin/staff` | Full `staff` array |
| `GET /api/devices` | Full `data` array |

Most finance/inventory/media/SMS log endpoints **do** expose Laravel pagination meta.

#### Gap 2 severity counts

- BLOCKER: 0  
- MAJOR: 4  
- MINOR: 3  
- INFO: 2  


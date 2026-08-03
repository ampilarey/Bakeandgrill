# Full System Audit Report

**Date:** 2026-08-03  
**Branch:** `cursor/full-system-audit-f876`  
**Environment:** local (`php artisan serve` @ `127.0.0.1:8000`, `APP_ENV=local`)  
**Scope:** Parts A–F — report only, no product fixes  
**Method limits:** No browser automation MCP in this environment. Part A combines HTTP kernel/API probes, SPA shell checks, and static UI review. Interactive console/XHR-per-page and 390px device runs were **not** fully executed in a real browser — noted under Untested.

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
| INFO | Local catalog | Public `/api/items` returns empty list | Local DB: 1 inactive custom catering item | Sparse fixture — empty menus are data, not app bugs. Pages that EmptyState correctly are not listed as failures. |

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

### Untested (Part A)

- Full browser pass (console errors, per-page XHR waterfall, visual EmptyState vs spinner) — no browser MCP.
- 390px interactive layout (static CSS only).
- Form submit paths that write data (orders, payments, SMS, print, refunds, 86, delivery status) — skipped as potentially destructive / external.
- TV board end-to-end with paired device + playlist — would need device heartbeat; config GET only.
- Low-permission UI (known nav drift excluded).
- Whether TEST/cPanel deep-links hit the same serve quirk as local `artisan serve`.

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

### Untested (Part D)

- Query-log N+1 counts on warm TEST dataset (>20 queries threshold).
- p95 latency on production-sized data.


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


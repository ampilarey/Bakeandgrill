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

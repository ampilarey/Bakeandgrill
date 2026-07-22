# Procurement — Phase 3 Plan (multi-quote, analytics, wastage-aware reorder)

**Repository:** `ampilarey/Bakeandgrill`
**Branch:** `claude/procurement-phase-3-plan`
**Status:** Plan only — no feature code written yet.
**Builds on:** Phase 1 (promote free-text, auto-expense, generate buying list) + Phase 2 (price
hints, auto-approve threshold, budgets, reconciliation, recurring lists) — both already on `main`.
**Author's note:** Separates **VERIFIED findings** (files actually read) from **RECOMMENDATIONS**.

## 0. Executive summary

Three grounded, high-value additions that reuse existing infrastructure — no new subsystems:

1. **Multi-quote / cheapest-pick** — capture 2–3 shop quotes per request line, auto-flag the
   cheapest, one-click "buy from cheapest". Extends the Phase 2 `PurchaseRequestPriceHintService`
   + `supplier_price_history`.
2. **Procurement analytics** — spend by category / supplier / buyer over time, per-item price
   trend, and savings realised from cheapest-pick. Reuses `supplier_price_history`, `Expense`,
   and the existing reporting patterns.
3. **Wastage-aware reorder** — feed `WasteLog` into `RestockIntelligenceService` so spoilage
   raises (or flags) suggested buy quantities and high-waste items surface in the forecast.

All three are additive, behind their own endpoints/settings, and default to today's behaviour.

## 1. Verified findings (reuse targets)

| Area | Path | Note |
|---|---|---|
| Price history | `backend/app/Models/SupplierPriceHistory.php` (`supplier_price_history`) | `supplier_id, inventory_item_id, purchase_id, unit_price, unit, recorded_at` |
| Price hints (Phase 2) | `backend/app/Services/PurchaseRequestPriceHintService.php` | `hintsForItems([ids])` → per item `{ last_paid, cheapest{supplier_id,name,unit_price}, suppliers[] }`; reads `inventory_items.last_purchase_price` |
| Buying flow | `backend/app/Services/PurchaseRequestService.php`, `PurchaseRequestVerificationService.php` | `markBought`(cost+shop), `convertToExpense`, restock-draft; item line has `supplier_id`, `supplier_name_text`, `actual_unit_cost_laar` |
| Restock engine | `backend/app/Domains/Inventory/Services/RestockIntelligenceService.php` | `restockPlan(lookback, buyLookback, lead, cover)` → daily usage (from `stock_movements`), days-left, buy frequency, suggested qty, next-order date |
| Waste | `backend/app/Models/WasteLog.php` | `item_id, inventory_item_id, quantity, unit, cost_estimate, reason, notes, user_id` |
| Expenses | `backend/app/Models/Expense.php`, `ExpenseController` | category/supplier/amount/date; Phase 1 links `purchase_request.expense_id` |
| Supplier intelligence | `backend/app/Http/Controllers/Api/SupplierIntelligenceController.php`, `Models/SupplierPerformanceCache.php`, `SupplierRating.php` | existing supplier analytics + `apps/admin-dashboard/src/pages/SupplierIntelligencePage.tsx` |
| Analytics/reporting | `backend/app/Http/Controllers/Api/{AnalyticsController,ReportsController,ForecastController,FinanceReportController}.php` | reporting patterns to mirror |
| Admin pages | `apps/admin-dashboard/src/pages/{PurchaseRequestsPage,ShoppingListsPage,ForecastPage,SupplierIntelligencePage,ExpensesPage}.tsx` | entry points |
| Reorder cmd | `backend/app/Console/Commands/CheckReorderPoints.php` (Phase 2 auto-request) | where wastage factor plugs in |

## 2. Feature 3A — Multi-quote / cheapest-pick

**Goal:** before buying, capture a few shop quotes per line and buy from the cheapest.

- **Data:** new table `purchase_request_item_quotes` — `id, purchase_request_item_id, supplier_id?
  (nullable), supplier_name_text?, unit_price_laar, unit, note, quoted_by, created_at`. (No change
  to the item row; quotes hang off it.)
- **Backend:**
  - `POST /api/purchase-requests/{id}/items/{itemId}/quotes` — add a quote (`permission:purchase_requests.buy`).
  - `GET  …/items/{itemId}/quotes` — list quotes + which is cheapest (+ compare to `PriceHintService`
    last_paid / historical cheapest).
  - `DELETE …/quotes/{quoteId}` — remove.
  - `PurchaseRequestService::addQuote / removeQuote / cheapestQuote(item)`.
  - Extend `markBought` to accept `from_quote_id` → copies that quote's price + supplier onto the
    line (records realised choice; feeds analytics savings).
- **Admin UI:** on a buying-list line, a **"Quotes"** expander — add supplier + price rows, cheapest
  highlighted, historical hint shown alongside; **"Buy from cheapest"** button pre-fills mark-bought.
- **Risk:** keep it optional — quotes are never required to buy; `markBought` still works without them.

## 3. Feature 3B — Procurement analytics

**Goal:** owner sees where money goes and whether cheapest-pick saves money.

- **New** `ProcurementAnalyticsService` + `GET /api/reports/procurement` (`permission:reports.financial`)
  returning, for a date range:
  - **Spend by expense category** (from `Expense`, incl. PR-linked expenses).
  - **Spend by supplier** (from `Expense.supplier_id` + `supplier_price_history`).
  - **Spend by buyer** (from `PurchaseRequest.assigned_to` × `total_actual_laar`).
  - **Per-item price trend** (from `supplier_price_history.unit_price` over time).
  - **Savings realised** = Σ(line's historical-cheapest − actually-paid) when bought from a quote
    (Feature 3A), else 0.
- **Admin UI:** a **Procurement** tab (extend `ForecastPage` or a new `ProcurementReportPage`) —
  category/supplier/buyer bars + an item price-trend line (reuse existing chart components), date
  filter, CSV export (mirror existing report exports).
- **Risk:** read-only/reporting — no writes; heavy queries must be indexed + date-bounded.

## 4. Feature 3C — Wastage-aware reorder

**Goal:** spoilage should influence how much to buy, and high-waste items should surface.

- **Backend:** extend `RestockIntelligenceService::restockPlan` with an optional **waste factor**:
  - Compute per-item waste rate over the lookback window from `WasteLog`
    (`SUM(quantity) / lookback_days`).
  - `effective_daily_rate = usage_daily_rate + waste_daily_rate` (behind a setting
    `restock_include_waste`, default **false** — preserves current suggestions).
  - Add `waste_daily_rate`, `waste_pct` (waste / (usage+waste)) to the plan row; flag items whose
    `waste_pct` exceeds a threshold (`restock_high_waste_pct`, default e.g. 15%).
  - `CheckReorderPoints` (Phase 2 auto-request) uses the effective rate when the setting is on.
- **Admin UI:** on `ForecastPage`, show a **waste %** column + a "high waste" badge; a toggle to
  include waste in suggestions.
- **Risk:** default OFF so existing forecasts are unchanged; cap the waste factor to avoid absurd
  order sizes (e.g. clamp `waste_pct` contribution).

## 5. Data model changes
- **New table** `purchase_request_item_quotes` (Feature 3A) — additive.
- **New settings** (SiteSetting, defaults preserve behaviour): `restock_include_waste` (bool false),
  `restock_high_waste_pct` (text, e.g. `15`).
- No changes to existing tables required.

## 6. Backend files
- `database/migrations/…_create_purchase_request_item_quotes_table.php` (new)
- `database/migrations/…_seed_procurement_phase3_settings.php` (new — 2 settings)
- `app/Models/PurchaseRequestItemQuote.php` (new)
- `app/Services/PurchaseRequestService.php` (modify — addQuote/removeQuote/cheapestQuote; markBought `from_quote_id`)
- `app/Services/ProcurementAnalyticsService.php` (new)
- `app/Domains/Inventory/Services/RestockIntelligenceService.php` (modify — waste factor)
- `app/Http/Controllers/Api/PurchaseRequestController.php` (modify — quotes endpoints)
- `app/Http/Controllers/Api/ProcurementReportController.php` (new — `/reports/procurement`)
- `app/Console/Commands/CheckReorderPoints.php` (modify — effective rate when enabled)
- `app/Http/Requests/*` (new — StoreQuoteRequest)
- `routes/domains/inventory.php`, `routes/domains/finance.php`/`reporting.php` (modify — new routes)
- `app/Domains/Permissions/PermissionCatalog.php` (reuse `purchase_requests.buy` + `reports.financial`; add `purchase_requests.quote` only if a distinct perm is wanted)

## 7. Admin UI (`apps/admin-dashboard/src`)
- `pages/PurchaseRequestsPage.tsx` (modify — Quotes expander + Buy-from-cheapest)
- `pages/ProcurementReportPage.tsx` (new) or a tab in `ForecastPage.tsx`
- `pages/ForecastPage.tsx` (modify — waste % column, include-waste toggle)
- `api/*` clients + `navConfig.ts`/`App.tsx` route for the report page

## 8. Testing (`backend/tests/Feature/Procurement/`)
- `MultiQuoteTest` — add/list/delete quotes; cheapest detection; `markBought from_quote_id` copies
  price+supplier; buying still works with no quotes.
- `ProcurementAnalyticsTest` — spend by category/supplier/buyer; item price trend; savings maths;
  date filter; permission.
- `WasteAwareReorderTest` — setting off → plan unchanged; on → effective rate includes waste,
  `waste_pct` computed, high-waste flagged, factor clamped.
- **Regression:** Phase 1 + Phase 2 procurement suites, forecast, expense suites stay green.
- Admin: quotes UI + procurement report + forecast waste column tests.

## 9. Rollout
One branch, three independent commits (3A, 3B, 3C). Migrations add one table + two settings
(defaults preserve behaviour). Deploy: `migrate --force`, rebuild admin dist. Each feature is
independently revertible; wastage + analytics are read-mostly; quotes are optional.

## 10. Acceptance criteria
1. A buyer can record multiple shop quotes on a request line; the cheapest is highlighted; "buy
   from cheapest" pre-fills mark-bought; buying without quotes is unaffected.
2. The owner can view procurement spend by category/supplier/buyer and an item price trend for a
   date range, with CSV export; savings from cheapest-pick are shown.
3. With wastage-aware reorder ON, forecast suggestions include a waste component and flag
   high-waste items; with it OFF, suggestions are identical to today.
4. No changes to existing procurement behaviour by default; all existing tests stay green.

## 11. Constraints (do not improvise)
- Additive only; new settings default to today's behaviour (waste OFF, quotes optional).
- Reuse `PurchaseRequestPriceHintService` + `supplier_price_history` — do not build a second price store.
- Analytics endpoints are read-only, date-bounded, and indexed; no heavy unbounded scans.
- Clamp the waste factor so it can't produce absurd order quantities.
- Do not rebuild Purchase Requests, Expenses, RestockIntelligence, or Supplier Intelligence — extend them.

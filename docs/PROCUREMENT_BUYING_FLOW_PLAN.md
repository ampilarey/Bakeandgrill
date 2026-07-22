# Procurement / Buying Flow — Enhancements Plan (staff request → buy → expense → reorder)

**Repository:** `ampilarey/Bakeandgrill`
**Branch:** `claude/procurement-buying-flow-plan`
**Status:** Plan only — no feature code written yet.
**Author's note:** Separates **VERIFIED findings** (files actually read) from **RECOMMENDATIONS**.

## 0. Executive summary

The desired flow — staff request items (catalog or free-text) → buyer buys with shop + price →
expense recorded → system predicts a reorder/pre-order list — is **~85% already built** in the
Purchase Requests + Expenses + RestockIntelligence modules. This plan fills **3 seams** between
those systems (Phase 1) and lists adjacent features (Phase 2, later). **No rebuild.**

| Your requirement | Status today | Action |
|---|---|---|
| 1. Staff request items (pre-listed **or** free-text) | ✅ built (`inventory_item_id` / `free_text_name`) | **Gap A:** add "promote free-text → inventory catalog" |
| 2. Buyer enters shop + price → leaves pending list | ✅ built (`markBought`) | none |
| 3. Bought/verified → recorded in expenses | ⚠️ manual button only | **Gap B:** optional auto-expense on verify |
| 4. Date/qty/frequency → pre-order list | ✅ prediction built (`RestockIntelligenceService`) but report-only | **Gap C:** "Generate buying list" from restock plan |
| Admin manually records other expenses | ✅ built (`ExpenseController`, recurring) | none |

## 1. Verified findings

### Purchase Requests (the buying workflow)
| Area | Path | Note |
|---|---|---|
| Models | `backend/app/Models/PurchaseRequest.php`, `PurchaseRequestItem.php`, `PurchaseRequestAttachment.php` | item line has `inventory_item_id`, `menu_item_id`, **`free_text_name`**, `requested_qty`, `actual_unit_cost_laar`, `supplier_id`, **`supplier_name_text`** (shop), `status`; PR has `status`, `assigned_to`, `expense_id`, `total_actual_laar` |
| Service | `backend/app/Services/PurchaseRequestService.php` | `create`, `approve`, `assign`, `markBought` (records cost+shop+receipt, status→`bought`), `markPartial`, `markNotAvailable`, `merge`, `recomputeTotals` |
| Verification | `backend/app/Services/PurchaseRequestVerificationService.php` | `verifyReceived`/`verifyAll` → status `received`, `applyStockIn` (stock movement when `inventory_item_id` linked); **`convertToExpense(pr,user,req)`** creates `Expense` (status `pending`), links `pr.expense_id` — **manual trigger** |
| Controller | `backend/app/Http/Controllers/Api/PurchaseRequestController.php` | `store/my/assignedToMe/index/show/approve/reject/assign/cancel/merge/verifyAll/convertToPurchase/convertToExpense/markBought/markPartial/uploadAttachment` |
| Routes | `backend/routes/domains/inventory.php:67-97` | all gated by `purchase_requests.*` |
| Permissions | `backend/app/Domains/Permissions/PermissionCatalog.php:226-235` | `create/view_own/view_all/approve/assign/buy/verify/cancel/reject/merge`; (+ `convert_to_purchase`, `convert_to_expense` referenced in routes) |
| Admin UI | `apps/admin-dashboard/src/pages/PurchaseRequestsPage.tsx` | request list, approve/assign/verify |
| Doc | `docs/purchase-requests.md` | full flow spec |

### Expenses
| Area | Path | Note |
|---|---|---|
| Model | `backend/app/Models/Expense.php` | `expense_number`, `expense_category_id`, `supplier_id`, `purchase_id`, `amount_laar`, GST fields, `is_recurring`, `recurrence_interval`, `next_recurrence_date`, `status`, `receipt_path` |
| Controller | `backend/app/Http/Controllers/Api/ExpenseController.php` (routes `finance.php:32`, `permission:finance.expenses`) | manual create + recurring |
| Category | `backend/app/Models/ExpenseCategory.php` | `convertToExpense` picks first category as default |

### Inventory reorder + prediction
| Area | Path | Note |
|---|---|---|
| Restock intelligence | `backend/app/Domains/Inventory/Services/RestockIntelligenceService.php` | `restockPlan(lookback, buyLookback, lead, cover)` → per item: `daily_usage_rate`, `days_of_stock`, **`buy_frequency.avg_days_between`**, `suggested_rop`, suggested order qty, **`suggested_next_order_date`**, stock status |
| Forecast API | `backend/app/Http/Controllers/Api/ForecastController.php` | `restockIntelligence`, `inventoryForecast`, `applySuggestedReorderPoints` (`POST /forecasts/restock/apply-rop`), `applySuggestedPreferredSuppliers` |
| Reorder (static) | `backend/app/Console/Commands/CheckReorderPoints.php`, `app/Models/InventoryReorderAlert.php`, `LowStockAlert.php`, `app/Domains/Inventory/Events/LowStockReached.php` | ROP alerts on `inventory:check-reorder` |
| Item fields | `backend/app/Models/InventoryItem.php` | `current_stock`, `reorder_point`, `reorder_quantity`, `lead_days`, `cover_days`, `unit` |
| Price history | `backend/app/Models/SupplierPriceHistory.php`, `SupplierPriceHistory` writes | last-paid per supplier (basis for price comparison, Phase 2) |
| Admin UI | `apps/admin-dashboard/src/pages/ForecastPage.tsx`, `InventoryPage.tsx`, `ExpensesPage.tsx`, `PurchaseOrdersPage.tsx` | |

## 2. Phase 1 — the 3 gaps

### Gap A — Promote a free-text request item into the inventory catalog
So an unlisted item a buyer requested becomes selectable next time.
- **New** endpoint `POST /api/purchase-requests/{id}/items/{itemId}/promote-to-inventory`
  (`permission:inventory.manage`). Body: `{ name?, unit, category_id?, reorder_point?, reorder_quantity? }`
  (defaults from `free_text_name`).
- **Service:** `PurchaseRequestService::promoteToInventory(item, data, user, request)` — creates an
  `InventoryItem` (idempotent: reject if a same-name item exists → return it), sets the line's
  `inventory_item_id`, clears/keeps `free_text_name` for history, audits `purchase_request.promoted_to_inventory`.
- **Admin UI:** on a `free_text_name` line in `PurchaseRequestsPage`, an **"Add to catalog"** button
  opening a small form (unit + optional category/ROP), then the line shows as linked.
- **Risk:** duplicate catalog items — enforce a name-uniqueness check + return existing.

### Gap B — Optional auto-expense when items are verified received
Turn the manual convert step into an automatic (but reviewable) one.
- **New setting** `purchase_requests_auto_expense` (SiteSetting, boolean, default **false** — preserves
  today's behaviour). Managed on the Purchase Requests admin page (or Settings).
- **Change:** in `PurchaseRequestVerificationService::verifyReceived`/`verifyAll`, after status→`received`,
  if the setting is on and `pr.expense_id` is null and `total_actual_laar > 0`, call the existing
  `convertToExpense(...)` (already idempotent). Expense is created with `status = 'pending'` so a
  manager still reviews/posts it — nothing auto-posts to the ledger/GST.
- **Also:** improve `convertToExpense` to pick a sensible **category** (map from a new nullable
  `purchase_requests.default_expense_category_id` setting rather than "first category").
- **Risk:** double expense — guarded by the existing `expense_id` short-circuit. Never auto-post
  (keep `pending`). Do not touch GST claimability logic.

### Gap C — Generate a buying list (draft Purchase Request) from the restock plan
Make the prediction actionable.
- **New** endpoint `POST /api/forecasts/restock/generate-request` (`permission:inventory.manage`),
  next to the existing `apply-rop`. Body: `{ lookback_days?, lead_days?, cover_days?, only_below_rop? }`.
- **Service:** `RestockIntelligenceService::buildRestockRequestDraft(plan)` selects items that are
  below ROP **or** due by `suggested_next_order_date`, then `PurchaseRequestService::create(...)`
  builds a PR (`source = 'restock'`, `title = 'Auto reorder <date>'`, one line per item with
  `inventory_item_id`, `requested_qty = suggested order qty`, `estimated_unit_cost_laar` from last
  price). Returns the draft PR in `requested` status for a manager to approve/assign.
- **Admin UI:** on `ForecastPage`, a **"Generate buying list"** button → preview of selected items →
  confirm → opens the created Purchase Request.
- **Risk:** duplicate open restock PRs — skip items already on an open restock-sourced PR; show a
  warning if one exists.

## 3. Data model changes
Minimal — mostly reuse:
- **New settings** (SiteSetting rows, seeded false/null): `purchase_requests_auto_expense` (boolean),
  `purchase_requests_default_expense_category_id` (text/int).
- **Optional column** `purchase_requests.source` already exists (used for `restock`); confirm it
  accepts `'restock'`. If `PurchaseRequestItem` lacks `estimated_unit_cost_laar` default from price,
  reuse existing field (it exists).
- No new tables required for Phase 1.

## 4. Backend changes
- `app/Services/PurchaseRequestService.php` (modify — `promoteToInventory`, `createFromRestock` helper)
- `app/Services/PurchaseRequestVerificationService.php` (modify — auto-expense hook, category from setting)
- `app/Domains/Inventory/Services/RestockIntelligenceService.php` (modify — `buildRestockRequestDraft`)
- `app/Http/Controllers/Api/PurchaseRequestController.php` (modify — `promoteToInventory`)
- `app/Http/Controllers/Api/ForecastController.php` (modify — `generateRestockRequest`)
- `app/Http/Requests/*` (new form requests for the two new endpoints)
- `routes/domains/inventory.php`, `routes/domains/finance.php` (modify — 2 new routes)
- `database/migrations/…_seed_purchase_request_expense_settings.php` (new — 2 settings)
- `app/Domains/Permissions/PermissionCatalog.php` (confirm `convert_to_expense`/`convert_to_purchase`
  are defined; add `purchase_requests.promote_item` if a distinct perm is wanted, else reuse `inventory.manage`)

## 5. Admin UI changes (`apps/admin-dashboard/src`)
- `pages/PurchaseRequestsPage.tsx` — "Add to catalog" on free-text lines; auto-expense toggle +
  default-category selector; show linked `expense_number` when present.
- `pages/ForecastPage.tsx` — "Generate buying list" button + preview modal → navigates to the new PR.
- `api/*` — clients for the 3 new endpoints.

## 6. Testing plan (`backend/tests/Feature/Procurement/`)
- `PromoteFreeTextItemTest` — promotes to inventory, links line, idempotent on duplicate name, permission.
- `AutoExpenseOnVerifyTest` — setting off → no expense (today's behaviour); setting on → one pending
  expense on verify; never double (expense_id guard); never auto-posts.
- `GenerateRestockRequestTest` — builds a draft PR from below-ROP/overdue items with suggested qty +
  last price; skips items already on an open restock PR; empty plan → no PR.
- **Regression:** existing purchase-request, expense, and forecast suites stay green.
- Admin: PurchaseRequestsPage + ForecastPage button tests.

## 7. Phase 2 — adjacent features (later, only if wanted)
- **Supplier price comparison** on buying lines (reuse `SupplierPriceHistory`: last-paid / cheapest shop). ✅ shipped
- **Auto-request on low stock** — `LowStockReached` optionally opens/appends a restock PR. ✅ via `inventory:check-reorder` + setting
- **Category budgets** — monthly cap per `ExpenseCategory` with warnings as requests+expenses approach it. ✅
- **Buyer cash reconciliation** — bought-total vs expense-total vs cash issued (uses receipt photos). ✅
- **Approval thresholds** — auto-approve requests under MVR X; require approval above. ✅
- **Recurring shopping list** — weekly staple list auto-generates a PR (reuse recurring-expense scheduler). ✅

## 8. Rollout
Phase 1 in one branch, 3 independent commits (A, B, C). Migrations seed the two settings (defaults
preserve current behaviour — auto-expense OFF). Deploy: `migrate --force`, rebuild admin dist. Each
gap is behind its own endpoint/setting; rollback = revert commit / leave setting off.

## 9. Acceptance criteria
1. A manager can turn a free-text request line into a catalog inventory item; it's selectable in
   future requests and the line becomes linked.
2. With auto-expense ON, verifying a received request creates exactly one **pending** expense
   (reviewable), pre-filled with cost/shop/receipt; with it OFF, behaviour is unchanged.
3. From the forecast page, a manager generates a draft Purchase Request containing the predicted
   items (below ROP or due by next-order-date) with suggested quantities and last-paid prices.
4. No double expenses, no duplicate open restock PRs, no auto-posting to the ledger.
5. All existing procurement/expense/forecast tests stay green.

## 10. Constraints (do not improvise)
- Do NOT rebuild Purchase Requests, Expenses, or RestockIntelligence — extend them.
- Auto-expense defaults OFF; created expenses are `pending` and never auto-post to GST/ledger.
- Reuse `convertToExpense` (idempotent via `expense_id`) — do not write a second expense path.
- Free-text promotion must guard against duplicate catalog items.
- Restock-generated PRs start in `requested` status (manager still approves/assigns).

## Implementation notes

- Verify API method is `verifyItem` (route `verify-received`), not a separate `verifyReceived`. Auto-expense runs via `maybeAutoExpense` after `verifyItem` when the PR status becomes `closed`, and again at the end of `verifyAll` (idempotent via `expense_id`).
- Partial verifies do not create expenses until all lines are terminal and the request closes — avoids incomplete totals.
- Default expense category uses `purchase_requests_default_expense_category_id`; falls back to first `ExpenseCategory` when unset/missing.
- Settings API: `GET|PATCH /api/purchase-requests/settings/auto-expense` (view_all / convert_to_expense).
- Restock draft uses `source='restock'` (store validation + create path). Skips excluded/snoozed and items already on an open restock-sourced PR. Empty selection → HTTP 422, no PR row.
- Forecast deep-link opens the new PR via `/purchase-requests?open={id}`.

## Build log

| Gap | Commit | Status |
|---|---|---|
| A — promote free-text → catalog | `981fb382` | done |
| B — optional auto-expense on verify | `9f0e203b` | done |
| C — generate buying list from restock | `58acb065` | done |

**Decisions:** auto-expense only when PR reaches `closed`; reuse `convertToExpense`; expenses stay `pending`; restock PRs start `requested`.

**Tests (related suite):** `47` passed (`PromoteFreeTextItemTest` 4, `AutoExpenseOnVerifyTest` 5, `GenerateRestockRequestTest` 4, plus PurchaseRequest / RestockIntelligence / NonStockPurchaseExpense regressions). Admin: PurchaseRequestsPage + Finance/Forecast clients rebuilt; ContentStudio editor timeout is flaky/unrelated and passes on re-run.

**Admin dist:** rebuilt via `./scripts/build-all.sh admin` → `backend/public/admin/`.

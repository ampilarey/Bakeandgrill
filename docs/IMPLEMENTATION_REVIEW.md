# Production Implementation Guide — Review Report

**Reviewed:** 14 March 2026
**Reviewer:** Claude (automated code audit)
**Source:** `docs/PRODUCTION_IMPLEMENTATION_GUIDE.md`

> This report verifies every item in the Production Implementation Guide against
> the actual codebase. Items are grouped by their guide status and actual status.

---

## Executive Summary

| Category | Total | Correctly Implemented | Issues Found |
|----------|-------|-----------------------|--------------|
| CRITICAL | 15    | 15                    | 0            |
| HIGH     | 25    | 20                    | 5            |
| MEDIUM   | 26    | 25                    | 1            |
| LOW      | 12    | 12                    | 0            |
| **Total**| **78**| **72**                | **6**        |

**Overall: 92% of items are correctly implemented.** All 15 critical security
issues are properly fixed. 6 items need attention (detailed below).

---

## Issues Requiring Attention

### 1. H-3 · Double-refund protection — PARTIALLY FIXED

**File:** `app/Http/Controllers/Api/RefundController.php:47-63`

The sum check against `$alreadyRefunded` is present and working, but the
operation is **not wrapped in a `DB::transaction` with `lockForUpdate()`**.
Two concurrent refund requests can race past the check and both succeed,
exceeding the order total.

**Current code (line 47-57):**
```php
$alreadyRefunded = $order->refunds()
    ->where('status', '!=', 'rejected')
    ->sum('amount');

if ($amount + $alreadyRefunded > ($order->total ?? 0)) {
    return response()->json([...], 422);
}

$refund = Refund::create([...]); // ← no transaction/lock
```

**Required fix:** Wrap in `DB::transaction` with `Order::lockForUpdate()`.

---

### 2. H-18 · Gitleaks non-blocking in CI — NOT FIXED

**File:** `.github/workflows/ci.yml`

The Gitleaks step does not set `GITLEAKS_FAIL_ON_LEAK: "true"`. Secrets can
still be merged to main without failing the build.

**Required fix:** Add `GITLEAKS_FAIL_ON_LEAK: "true"` to the Gitleaks step env.

---

### 3. H-21 · Static default deviceId — PARTIALLY FIXED

- **KDS:** Fixed — generates dynamic device IDs via `localStorage` + random string
- **POS:** Still uses hardcoded `"POS-001"` as default (`apps/pos-web/src/App.tsx:23`)

While POS has an editable input field, multi-terminal deployments that skip
changing the default will collide.

**Required fix:** Auto-generate and persist a unique device ID in POS (same pattern as KDS).

---

### 4. H-25 · `backup.sh` / DB_CONNECTION inconsistency — NOT FIXED

- `docker-compose.yml` uses **PostgreSQL 15** (`postgres:15-alpine`)
- `backend/.env.example` says `DB_CONNECTION=mysql`
- `scripts/backup.sh` hardcodes `pg_dump`

**Required fix:** Either make `backup.sh` auto-detect the driver, or update
`.env.example` to `DB_CONNECTION=pgsql` for consistency with Docker.

---

### 5. M-1 · Rate limiting on hold/resume/addPayments — NOT FIXED

**File:** `backend/routes/api.php:121-123`

These three routes have **no throttle middleware**:
```
Route::post('/orders/{id}/hold', ...);      // no throttle
Route::post('/orders/{id}/resume', ...);    // no throttle
Route::post('/orders/{id}/payments', ...);  // no throttle
```

Other sensitive operations (refunds, shifts, stripe) are correctly throttled.

**Required fix:** Add `->middleware('throttle:20,1')` to all three routes.

---

### 6. L-2 · InventoryItem casts — MINOR ISSUE

**File:** `app/Models/InventoryItem.php`

The `$casts` array references `reorder_level` but the `$fillable` array uses
`reorder_point`. If the actual DB column is `reorder_point`, the cast is a no-op.

**Required fix:** Verify the column name and align `$casts` key accordingly.

---

## Fully Verified Items

### CRITICAL — All 15 items verified

| ID    | Description                                  | Status |
|-------|----------------------------------------------|--------|
| CR-1  | Stripe config in `services.php`              | ✅     |
| CR-2  | Admin route authorization middleware          | ✅     |
| CR-3  | StaffController authorization                | ✅     |
| CR-4  | ItemController `$isAdmin` uses `tokenCan`    | ✅     |
| CR-5  | OrderController staff token checks           | ✅     |
| CR-6  | `/api/auth/me` staff token check             | ✅     |
| CR-7  | Admin logout clears localStorage             | ✅     |
| CR-8  | POS resume held order restores cart          | ✅     |
| CR-9  | OTP hint guarded by `import.meta.env.DEV`    | ✅     |
| CR-10 | Demo PINs guarded by `import.meta.env.DEV`   | ✅     |
| CR-11 | `low-stock` route above `{id}` wildcard      | ✅     |
| CR-12 | `APP_DEBUG=false` in `.env.example`           | ✅     |
| CR-13 | Docker passwords use `:?` fail-if-unset      | ✅     |
| CR-14 | Promo ownership check + cancelled status      | ✅     |
| CR-15 | Deploy job in CI pipeline                     | ✅     |

### HIGH — 20 of 25 verified (5 issues above)

| ID    | Description                                  | Status |
|-------|----------------------------------------------|--------|
| H-1   | Exception handler with JSON responses        | ✅     |
| H-2   | BML webhook idempotency                      | ✅     |
| H-3   | Double-refund protection                     | ⚠️     |
| H-4   | Security headers middleware                  | ✅     |
| H-5   | CORS specific methods/headers                | ✅     |
| H-6   | Sanctum token expiration = 7 days            | ✅     |
| H-7   | SPA catch-all `file_exists` check            | ✅     |
| H-8   | Frontend API base URL — no localhost fallback| ✅     |
| H-9   | KDS error handling on bump/start/recall      | ✅     |
| H-10  | Role-based route protection (RoleGuard)      | ✅     |
| H-11  | POS offline queue — network errors only      | ✅     |
| H-12  | KDS polling backoff + 401 detection          | ✅     |
| H-13  | POS fallback menu items removed              | ✅     |
| H-14  | Analytics retention — batch query            | ✅     |
| H-15  | `lookupByBarcode` correct properties         | ✅     |
| H-16  | `parseRange` date validation                 | ✅     |
| H-17  | `WasteLogController::store` DB transaction   | ✅     |
| H-18  | Gitleaks fail-on-leak                        | ❌     |
| H-19  | Frontend CI jobs                             | ✅     |
| H-20  | PurchaseOrdersPage uses shared API client    | ✅     |
| H-21  | Dynamic device IDs                           | ⚠️     |
| H-22  | print-proxy build — no `|| true`             | ✅     |
| H-23  | print-proxy `npm ci --omit=dev`              | ✅     |
| H-24  | AnalyticsPage error state                    | ✅     |
| H-25  | backup.sh / DB_CONNECTION consistency        | ❌     |

### MEDIUM — 25 of 26 verified (1 issue above)

| ID    | Description                                  | Status |
|-------|----------------------------------------------|--------|
| M-1   | Rate limiting on hold/resume/payments        | ❌     |
| M-2   | Promo code throttle:5,1                      | ✅     |
| M-3   | Order quantity max:999                        | ✅     |
| M-4   | Analytics days/lookback capped at 365        | ✅     |
| M-5   | ForecastController date range cap            | ✅     |
| M-6   | Bulk stock-check auth + validation           | ✅     |
| M-7   | Search parameter Str::limit(100)             | ✅     |
| M-8   | Database indexes for reporting               | ✅     |
| M-9   | Image upload dimensions + 5MB limit          | ✅     |
| M-10  | SESSION_SECURE_COOKIE for production         | ✅     |
| M-11  | Phone numbers centralized in `biz.ts`        | ✅     |
| M-12  | VITE_DELIVERY_FEE_MVR NaN validation         | ✅     |
| M-13  | ReservationPage/ReviewForm use shared API    | ✅     |
| M-14  | CustomerController optOut — always 200       | ✅     |
| M-15  | Shift cash scoped to shift_id                | ✅     |
| M-16  | Table close checks for active orders         | ✅     |
| M-17  | Order fillable: tip_amount, wait_minutes     | ✅     |
| M-18  | PIN auth limit(500)                          | ✅     |
| M-19  | XeroController OAuth via Cache               | ✅     |
| M-20  | `.env.example` in all 4 app directories      | ✅     |
| M-21  | admin-dashboard test suite (vitest)          | ✅     |
| M-22  | InventoryController adjust — DB::transaction | ✅     |
| M-23  | Database-agnostic SQL functions              | ✅     |
| M-24  | SECURITY.md correct OTP endpoints            | ✅     |
| M-25  | Stale AI docs deleted                        | ✅     |
| M-26  | gitleaks.toml `[[allowlists]]` syntax        | ✅     |

### LOW — All 12 verified

| ID    | Description                                  | Status |
|-------|----------------------------------------------|--------|
| L-1   | OTP pruning command + daily schedule         | ✅     |
| L-2   | InventoryItem numeric casts                  | ⚠️     |
| L-3   | StaffController paginate(100)                | ✅     |
| L-4   | Push subscribe routes — auth + throttle      | ✅     |
| L-5   | TestChecklistPage RoleGuard                  | ✅     |
| L-6   | CSP meta tags in all apps                    | ✅     |
| L-7   | KDS label: "Auto-refresh (5s)"               | ✅     |
| L-8   | document.title via usePageTitle hook         | ✅     |
| L-9   | print-proxy: axios removed                   | ✅     |
| L-10  | print-proxy: non-root Docker user            | ✅     |
| L-11  | Print ticket: Indian/Maldives timezone       | ✅     |
| L-12  | Docker Compose: restart + resource limits    | ✅     |

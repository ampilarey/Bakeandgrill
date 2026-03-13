# CURSOR PROMPT: Full Codebase Audit Fixes — Bake & Grill

> A comprehensive audit was performed across all backend routes, Blade views,
> 4 React apps, controllers/models, and the shared TypeScript package.
> This prompt lists every issue found, grouped by severity, with exact file
> paths, line numbers, and the fix required.

---

## ARCHITECTURE OVERVIEW

```
backend/                        Laravel 12 — API + Blade views
├── routes/web.php              25 web routes (Blade pages + SPA catch-alls)
├── routes/api.php              210+ API routes
├── resources/views/            26 Blade templates
├── app/Http/Controllers/       Web controllers
├── app/Http/Controllers/Api/   41 API controllers
├── app/Models/                 20+ Eloquent models
├── app/Services/               Business logic services
└── public/                     Compiled SPA assets (order/, admin/)

apps/
├── online-order-web/           Customer ordering SPA (React + Vite, base="/order/")
├── admin-dashboard/            Admin panel SPA (React + Vite, base="/admin/")
├── kds-web/                    Kitchen Display System (React + Vite, base="/kds/")
└── pos-web/                    Point of Sale (React + Vite, base="/pos/")

packages/shared/src/            Shared TypeScript types + API client
├── types/                      Type definitions
└── api/
    ├── client.ts               Generic fetch wrapper
    └── endpoints.ts            Endpoint constants (single source of truth)
```

---

## CRITICAL BUGS — Fix Immediately

### CRIT-1: Missing `PreOrder` Model File

**Problem:** `PreOrderController` calls `PreOrder::create()` and `PreOrder::findOrFail()` but no model file exists. Will throw `Class not found` at runtime.

**Migration exists:** `backend/database/migrations/2026_02_03_192000_create_pre_orders_table.php`

**Fix:** Create `backend/app/Models/PreOrder.php`:

```php
<?php
declare(strict_types=1);
namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PreOrder extends Model
{
    protected $fillable = [
        'order_number', 'customer_id', 'customer_name', 'customer_phone',
        'customer_email', 'fulfillment_date', 'preparation_start',
        'items', 'subtotal', 'total', 'status',
        'approved_by', 'approved_at',
        'customer_notes', 'staff_notes', 'cancellation_reason',
    ];

    protected $casts = [
        'items' => 'array',
        'subtotal' => 'decimal:2',
        'total' => 'decimal:2',
        'fulfillment_date' => 'datetime',
        'preparation_start' => 'datetime',
        'approved_at' => 'datetime',
    ];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function approvedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }
}
```

---

### CRIT-2: Missing `CashMovement` Model File

**Problem:** `CashMovementController` (line 23) calls `CashMovement::create()` but no model exists.

**Migration exists:** `backend/database/migrations/2026_01_27_193012_create_cash_movements_table.php`

**Fix:** Create `backend/app/Models/CashMovement.php` with `$fillable` matching the migration columns (shift_id, type, amount, reason, user_id, etc.) and proper `$casts`.

---

### CRIT-3: KDS Token Not Persisted — Login Lost on Refresh

**File:** `apps/kds-web/src/App.tsx:82-84`

**Problem:** After `staffLogin()` returns the token, the app sets React state but never writes to localStorage. On page refresh, the token is lost and the user must log in again. The `api.ts` client reads from `localStorage.getItem('kds_token')` (line 31) but nothing ever writes it.

**Fix:** In `App.tsx`, after line 82, add:
```typescript
const tokenValue = await staffLogin(pin.trim(), deviceId.trim());
localStorage.setItem('kds_token', tokenValue);  // ← ADD THIS
setToken(tokenValue);
```

Also add initialization from localStorage on mount:
```typescript
// At the top of the App function, add:
useEffect(() => {
  const saved = localStorage.getItem('kds_token');
  if (saved) {
    setToken(saved);
    setIsLoggedIn(true);
  }
}, []);
```

And add a logout function that clears it:
```typescript
const handleLogout = () => {
  localStorage.removeItem('kds_token');
  setToken(null);
  setIsLoggedIn(false);
};
```

---

### CRIT-4: KDS & POS Missing Catch-All Routes in `web.php`

**File:** `backend/routes/web.php`

**Problem:** Only `/order/*` and `/admin/*` have Laravel catch-all routes for their React SPAs. KDS (`/kds/*`) and POS (`/pos/*`) have NO catch-all routes. If a user navigates directly to `/kds/` or `/pos/orders`, they'll get a 404.

**Fix:** Add to `backend/routes/web.php`:

```php
// KDS SPA — catch-all for /kds/* sub-paths
Route::get('/kds', function () {
    return redirect('/kds/');
})->name('kds.redirect');
Route::get('/kds/{any}', function () {
    return response()->file(public_path('kds/index.html'));
})->where('any', '.*')->name('kds.spa');

// POS SPA — catch-all for /pos/* sub-paths
Route::get('/pos', function () {
    return redirect('/pos/');
})->name('pos.redirect');
Route::get('/pos/{any}', function () {
    return response()->file(public_path('pos/index.html'));
})->where('any', '.*')->name('pos.spa');
```

Also verify that `backend/public/kds/index.html` and `backend/public/pos/index.html` exist (they need to be built and copied from `apps/kds-web/dist/` and `apps/pos-web/dist/`).

---

### CRIT-5: `welcome.blade.php` References Non-Existent Routes

**File:** `backend/resources/views/welcome.blade.php:35,43`

**Problem:** Uses `route('login')` and `route('register')` which are undefined. This is the default Laravel welcome page left over from scaffolding.

**Fix:** Delete `backend/resources/views/welcome.blade.php` entirely. It serves no purpose — the home page is handled by `HomeController@index` returning `home.blade.php`.

---

### CRIT-6: No Input Validation in `CashMovementController`

**File:** `backend/app/Http/Controllers/Api/CashMovementController.php:26-28`

**Problem:** Uses raw `$request->input()` with zero validation — no type check on `amount`, no enum check on `type`, no max-length on `reason`.

**Fix:** Add validation before the create:
```php
$validated = $request->validate([
    'type'   => 'required|in:cash_in,cash_out,paid_in,paid_out',
    'amount' => 'required|numeric|min:0.01|max:999999',
    'reason' => 'required|string|max:500',
]);
```
Then use `$validated` in the `CashMovement::create()` call instead of raw `$request->input()`.

---

## HIGH SEVERITY Issues

### HIGH-1: Order Status Type Mismatch

**File:** `packages/shared/src/types/order.ts:3-11`

**Problem:** Type defines `'preparing' | 'ready'` which the backend never uses. Backend KDS uses `'in_progress'` which is **missing** from the type.

**Current:**
```typescript
export type OrderStatus =
  | 'pending' | 'held' | 'preparing' | 'ready'
  | 'partial' | 'paid' | 'completed' | 'cancelled';
```

**Fix:**
```typescript
export type OrderStatus =
  | 'pending' | 'held' | 'in_progress'
  | 'partial' | 'paid' | 'completed' | 'cancelled';
```

---

### HIGH-2: Env Variable Inconsistency in `online-order-web`

**Files:**
- `apps/online-order-web/src/api.ts` → uses `VITE_API_BASE_URL` (correct)
- `apps/online-order-web/src/components/ReviewForm.tsx` → uses `VITE_API_URL` (WRONG)
- `apps/online-order-web/src/pages/ReservationPage.tsx` → uses `VITE_API_URL` (WRONG)
- `apps/online-order-web/src/hooks/usePushNotifications.ts` → uses `VITE_API_URL` (WRONG)

**Fix:** In all three files, change `VITE_API_URL` to `VITE_API_BASE_URL`. Or better: import `API_ORIGIN` or the API base URL from `api.ts` instead of re-computing it.

---

### HIGH-3: KDS Endpoint Constants Mismatch

**File:** `packages/shared/src/api/endpoints.ts:43`

**Problem:** Defines `KDS_ORDER_COMPLETE: (id: number) => /kds/orders/${id}/complete` but the actual backend route is `/kds/orders/{id}/bump`. The KDS app works around this by hardcoding the URL in `api.ts:60`, but the shared constant is wrong.

**Fix:**
```typescript
// Change:
KDS_ORDER_COMPLETE: (id: number) => `/kds/orders/${id}/complete`,
// To:
KDS_ORDER_BUMP:     (id: number) => `/kds/orders/${id}/bump`,
```

Also add the missing recall endpoint:
```typescript
KDS_ORDER_RECALL:   (id: number) => `/kds/orders/${id}/recall`,
```

Then update `apps/kds-web/src/api.ts` to use the shared constants instead of hardcoded paths.

---

### HIGH-4: Demo PINs Exposed in KDS & POS Login UIs

**Files:**
- `apps/kds-web/src/App.tsx:164` — Shows `"Demo PIN: 1234"`
- `apps/pos-web/src/pages/LoginPage.tsx` — Shows `"Demo: 1234"`

**Fix:** Remove these lines entirely. They are a security risk in production. If you want dev-only hints, gate them behind `import.meta.env.DEV`:
```tsx
{import.meta.env.DEV && <p className="text-xs text-slate-400">Dev PIN: 1234</p>}
```

---

### HIGH-5: Missing Authorization on Supplier/Purchase Controllers

**Files:**
- `backend/app/Http/Controllers/Api/SupplierController.php`
- `backend/app/Http/Controllers/Api/PurchaseController.php`

**Problem:** These controllers are behind `auth:sanctum` but have no role/permission checks. A customer with a valid Sanctum token (from OTP login) could potentially access supplier data.

**Fix:** Add a check at the top of each method (or use middleware):
```php
if (!$request->user()->tokenCan('staff')) {
    abort(403, 'Staff access required');
}
```

Or add middleware in `api.php`:
```php
Route::middleware(['auth:sanctum', 'can:staff'])->group(function () {
    // suppliers + purchases routes
});
```

---

## MEDIUM SEVERITY Issues

### MED-1: 12+ Backend Endpoints Missing from `endpoints.ts`

**File:** `packages/shared/src/api/endpoints.ts`

These backend routes exist in `api.php` but have no constant in the shared endpoints file:

```typescript
// Add these to ENDPOINTS:

// KDS (fix existing + add missing)
KDS_ORDER_BUMP:     (id: number) => `/kds/orders/${id}/bump`,
KDS_ORDER_RECALL:   (id: number) => `/kds/orders/${id}/recall`,

// Streams (SSE)
STREAM_ORDERS:         '/stream/orders',
STREAM_KDS:            '/stream/kds',
STREAM_ORDER_STATUS:   (id: number) => `/stream/orders/${id}/status`,
STREAM_PUBLIC_STATUS:  (id: number) => `/stream/order-status/${id}`,

// Delivery
DELIVERY_ORDER_UPDATE: (id: number) => `/orders/${id}/delivery`,

// Customer
CUSTOMER_PROFILE:      '/customer/profile',

// Payments
PARTIAL_PAYMENT:       '/payments/online/initiate-partial',

// Wait time
WAIT_TIME:             '/wait-time',

// Item photos
ITEM_PHOTOS:           (itemId: number) => `/items/${itemId}/photos`,
ITEM_PHOTO_MANAGE:     (itemId: number, photoId: number) => `/items/${itemId}/photos/${photoId}`,

// Admin
ADMIN_UPLOAD_IMAGE:    '/admin/upload-image',
ADMIN_RESERVATION_SETTINGS_UPDATE: '/admin/reservations/settings',
```

---

### MED-2: N+1 Query in `InventoryController::priceHistory()`

**File:** `backend/app/Http/Controllers/Api/InventoryController.php` (around line 170-183)

**Problem:** Inside a `->map()` callback, accesses `$item->purchase?->supplier?->name` which triggers a separate query per row.

**Fix:** Eager-load the relationship:
```php
->with(['purchase.supplier'])
```

---

### MED-3: `ReportsController::salesBreakdown()` Returns Unlimited Rows

**File:** `backend/app/Http/Controllers/Api/ReportsController.php` (around line 76-89)

**Problem:** Uses `->get()` with no pagination or limit. Could return thousands of rows.

**Fix:** Add pagination or a reasonable limit:
```php
->paginate($request->input('per_page', 50))
```

---

### MED-4: `ReviewController` Aggregates Rating in PHP

**File:** `backend/app/Http/Controllers/Api/ReviewController.php` (around line 29)

**Problem:** `$reviews->avg('rating')` computed in PHP after fetching all rows.

**Fix:** Use a database aggregate:
```php
$avgRating = Review::where('item_id', $itemId)->where('is_approved', true)->avg('rating');
```

---

### MED-5: API Client Has No Token Refresh / 401 Retry

**File:** `packages/shared/src/api/client.ts`

**Problem:** If a Sanctum token expires mid-session, API calls fail with a generic error. No retry or refresh logic.

**Fix (recommended):** Add a 401 handler that clears the stored token and dispatches an `auth_expired` event so the UI can redirect to login:
```typescript
if (response.status === 401) {
  window.dispatchEvent(new CustomEvent('auth_expired'));
  throw new Error('Session expired. Please log in again.');
}
```

---

### MED-6: `AnalyticsPage.tsx` Creates API URL Separately

**File:** `apps/admin-dashboard/src/pages/AnalyticsPage.tsx`

**Problem:** Computes its own API base URL instead of importing from `api.ts`.

**Fix:** Import and use the shared API functions from `../api.ts` instead of creating a separate fetch wrapper.

---

## LOW SEVERITY — Cleanup & Best Practices

### LOW-1: Delete Dead Blade Views

These files serve no purpose and clutter the codebase:

| File | Reason |
|------|--------|
| `backend/resources/views/welcome.blade.php` | Default Laravel scaffold, references non-existent routes |
| `backend/resources/views/checkout.blade.php` | Non-functional (uses `alert()`/`confirm()`, no API call) |
| `backend/resources/views/order-type-select.blade.php` | Replaced by React checkout flow |
| `backend/resources/views/color-scheme-1.blade.php` through `color-scheme-8.blade.php` | No routes defined, reference non-existent `route('color-scheme-N')`. Dead demo files. |

**Total: 11 files to delete.**

Also remove corresponding routes from `web.php`:
```php
// DELETE:
Route::get('/order-type', function () { return view('order-type-select'); })->name('order.type');
Route::get('/checkout', [HomeController::class, 'checkout'])->name('checkout');
```

And remove `HomeController::checkout()` method.

---

### LOW-2: 8 Color Scheme Files Reference Non-Existent Routes

**Files:** `backend/resources/views/color-scheme-{1-8}.blade.php`

Each file internally uses `route('color-scheme-N')` for navigation between them — but no routes with those names exist in `web.php`. Loading any of these would crash.

**Fix:** Delete all 8 files (see LOW-1).

---

### LOW-3: Hardcoded Business Info Scattered Across Views

Phone number `+960 9120011` and address `Kalaafaanu Hingun, Malé` appear hardcoded in:
- `layout.blade.php` (lines 531, 549)
- `contact.blade.php` (line 142)
- `hours.blade.php` (line 168)
- `privacy.blade.php` (lines 85, 116)

**Fix:** Move to `config/business.php` and reference via `config('business.phone')`, `config('business.address')`.

---

### LOW-4: Hardcoded Hours in React `HoursPage.tsx`

**File:** `apps/online-order-web/src/pages/HoursPage.tsx`

**Problem:** Weekly hours are hardcoded in a `WEEKLY_HOURS` array. The backend has an `OpeningHoursService` that reads from config.

**Fix:** Create a new public API endpoint `GET /api/opening-hours` that returns the full weekly schedule, then fetch it in `HoursPage.tsx` on mount.

---

### LOW-5: No React Error Boundary in Any App

None of the 4 React apps have an `ErrorBoundary` component. An unhandled render error will show a blank white screen.

**Fix:** Add a simple `ErrorBoundary` wrapper in each app's root.

---

### LOW-6: No Build/Deploy Pipeline

No script or CI config exists to build the 4 React apps and copy them to `backend/public/`. The expected mapping:

```
apps/online-order-web/dist/*  →  backend/public/order/
apps/admin-dashboard/dist/*   →  backend/public/admin/
apps/kds-web/dist/*           →  backend/public/kds/
apps/pos-web/dist/*           →  backend/public/pos/
```

**Fix:** Create a `scripts/build-all.sh`:
```bash
#!/bin/bash
set -e
for app in online-order-web admin-dashboard kds-web pos-web; do
  echo "Building $app..."
  cd apps/$app && npm run build && cd ../..
done

# Map app names to public directories
declare -A DEST=(
  [online-order-web]=order
  [admin-dashboard]=admin
  [kds-web]=kds
  [pos-web]=pos
)

for app in "${!DEST[@]}"; do
  dest="backend/public/${DEST[$app]}"
  rm -rf "$dest"
  cp -r "apps/$app/dist" "$dest"
  echo "Deployed $app → $dest"
done
```

---

### LOW-7: Inconsistent `SmsService` Call Signatures

- `ReceiptController` (line 158) calls: `app(SmsService::class)->send($recipient, $message)`
- `CustomerAuthController` (line 66) calls: `$smsService->send(new SmsMessage(...))`

**Fix:** Standardize to a single `send()` method signature across all callers.

---

### LOW-8: `ReferralController` Hardcoded Reward Values

**File:** `backend/app/Http/Controllers/Api/ReferralController.php:28-30`

Hardcodes `referrer_reward_mvr = 10.00` and `referee_discount_mvr = 5.00`.

**Fix:** Move to `config/loyalty.php` or a settings table.

---

### LOW-9: `DeviceController` Middleware Accepts Body Fallback

**File:** `backend/app/Http/Middleware/EnsureActiveDevice.php:20`

**Problem:** Falls back to reading `device_identifier` from the request body when the `X-Device-Identifier` header is missing. This could allow clients to spoof device identity.

**Fix:** Only accept from the header:
```php
$identifier = $request->header('X-Device-Identifier');
if (!$identifier) {
    return response()->json(['message' => 'Device identifier header required'], 400);
}
```

---

## SUMMARY

| Severity | Count | Key Items |
|----------|-------|-----------|
| **CRITICAL** | 6 | Missing PreOrder/CashMovement models, KDS token loss, KDS/POS no routes, welcome.blade.php crash, CashMovement no validation |
| **HIGH** | 5 | OrderStatus type wrong, env var mismatch, KDS endpoint name wrong, demo PINs exposed, missing auth on suppliers |
| **MEDIUM** | 6 | 12+ missing endpoint constants, N+1 queries, no pagination, no token refresh, analytics URL duplicate |
| **LOW** | 9 | 11 dead Blade files, hardcoded values, no error boundaries, no build script, SmsService inconsistency |

**Priority order:**
1. Create missing models (PreOrder, CashMovement) — app crashes without them
2. Fix KDS token persistence — kitchen staff can't use the system reliably
3. Add KDS/POS catch-all routes — direct navigation broken
4. Delete `welcome.blade.php` — will crash if accessed
5. Add validation to CashMovementController — security hole
6. Fix OrderStatus type + KDS endpoint name — type safety
7. Fix env variable names in online-order-web — reviews/reservations may break in prod
8. Remove demo PINs from KDS/POS — security
9. Everything else

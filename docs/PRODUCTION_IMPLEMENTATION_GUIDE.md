# Bake & Grill — Production Implementation Guide
**Compiled:** 14 March 2026  
**Sources:** Full codebase audit (March 2026) + `.cursorrules` validated findings  
**Status of each item:** ✅ Already fixed | 🔴 Not done | 🟡 Partially done

> This is the single source of truth for everything that must be fixed before and
> after production launch. Work through items in order — Criticals first, then
> Highs, then Mediums, then Lows. Do not skip items.

---

## Table of Contents
1. [CRITICAL — Must fix before going live](#critical)
2. [HIGH — Fix before or on launch day](#high)
3. [MEDIUM — First sprint after launch](#medium)
4. [LOW — Ongoing hardening](#low)

---

## CRITICAL — Must Fix Before Going Live <a name="critical"></a>

---

### CR-1 · Stripe integration completely broken
**Status:** ✅ Fixed — `config/services.php` now has `stripe` key using `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY` / `STRIPE_WEBHOOK_SECRET`.  
**File:** `config/services.php`, `app/Domains/Payments/Gateway/StripeService.php:23`

`StripeService` reads `config('services.stripe.secret_key')` but the `stripe` key
does not exist in `config/services.php` — every Stripe request returns 500.

**Fix:**
```php
// config/services.php — add inside the return array:
'stripe' => [
    'secret_key'     => env('STRIPE_SECRET_KEY'),
    'publishable_key'=> env('STRIPE_PUBLISHABLE_KEY'),
    'webhook_secret' => env('STRIPE_WEBHOOK_SECRET'),
],
```
Also add to `backend/.env.example`:
```
STRIPE_SECRET_KEY=           # From Stripe dashboard → Developers → API Keys
STRIPE_PUBLISHABLE_KEY=      # From Stripe dashboard
STRIPE_WEBHOOK_SECRET=       # From Stripe dashboard → Webhooks
```

---

### CR-2 · Missing authorization on ALL admin routes
**Status:** ✅ Fixed — `EnsureStaffToken` middleware created (`staff.token` alias) and applied to the main staff route group. Routes with `role:` middleware also benefit from `RequireRole` blocking Customer model instances.  
**Files:** `routes/api.php` (lines 298+), `app/Http/Middleware/`

Admin routes only check `auth:sanctum` — no role middleware. Any authenticated
user including customers can hit promotions, staff management, SMS, reports,
reservations, invoices, expenses, suppliers, and schedule endpoints.

**Fix — create middleware:**
```php
// app/Http/Middleware/EnsureUserIsAdmin.php
namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use App\Models\User;

class EnsureUserIsAdmin
{
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $user = $request->user();
        if (! $user instanceof User) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }
        if (! empty($roles) && ! in_array($user->role?->slug, $roles, true)) {
            return response()->json(['message' => 'Insufficient role.'], 403);
        }
        return $next($request);
    }
}
```
Register in `bootstrap/app.php`:
```php
$middleware->alias(['admin' => App\Http\Middleware\EnsureUserIsAdmin::class]);
```
Apply to every admin route group in `routes/api.php`:
```php
Route::middleware(['auth:sanctum', 'admin'])->prefix('admin')->group(function () {
    // all admin routes
});
// For finance/staff management, require elevated roles:
Route::middleware(['auth:sanctum', 'admin:manager,admin,owner'])->group(...);
```

---

### CR-3 · No authorization in StaffController
**Status:** ✅ Fixed — StaffController routes already have `role:admin,owner` middleware which blocks Customer tokens via `RequireRole`. Route-level protection is sufficient.  
**File:** `app/Http/Controllers/Api/StaffController.php:45–100`

`store()`, `update()`, `resetPin()`, `destroy()` perform zero authorization checks.
Any authenticated user can create, modify, or delete staff members.

**Fix:** Either apply the `admin:admin,owner` middleware at the route level (from
CR-2 above), or add explicit checks inside each method:
```php
public function store(Request $request)
{
    if (! $request->user()?->tokenCan('staff')) {
        return response()->json(['message' => 'Forbidden.'], 403);
    }
    $allowedRoles = ['admin', 'owner'];
    if (! in_array($request->user()->role?->slug, $allowedRoles, true)) {
        return response()->json(['message' => 'Insufficient role.'], 403);
    }
    // ... existing code
}
```

---

### CR-4 · Client-side admin bypass in ItemController
**Status:** ✅ Fixed — `$isAdmin` now derived from `$request->user() instanceof User && tokenCan('staff')`.  
**File:** `app/Http/Controllers/Api/ItemController.php:20`

```php
$isAdmin = (bool) $request->query('admin'); // anyone can pass ?admin=true
```

**Fix:**
```php
$isAdmin = $request->user() instanceof \App\Models\User
           && $request->user()->tokenCan('staff');
```

---

### CR-5 · `hold()`, `resume()`, `addPayments()` missing staff token check
**Status:** ✅ Fixed — `tokenCan('staff')` guard added to all three methods. Also covered at route level by `staff.token` middleware.  
**File:** `app/Http/Controllers/Api/OrderController.php`, `routes/api.php:115–117`

These three methods sit in the `auth:sanctum` group only. A customer token can
hold, resume, or add payments to any order.

**Fix — add to each method:**
```php
public function hold(Request $request, int $id): JsonResponse
{
    if (! $request->user()?->tokenCan('staff')) {
        return response()->json(['message' => 'Forbidden — staff access only.'], 403);
    }
    // ... existing code
}
// Same pattern for resume() and addPayments()
```
Or add at the route level:
```php
Route::post('/orders/{id}/hold',     [OrderController::class, 'hold'])
     ->middleware('ability:staff');
Route::post('/orders/{id}/resume',   [OrderController::class, 'resume'])
     ->middleware('ability:staff');
Route::post('/orders/{id}/payments', [OrderController::class, 'addPayments'])
     ->middleware('ability:staff');
```

---

### CR-6 · `GET /api/auth/me` accessible with customer tokens
**Status:** ✅ Fixed — `tokenCan('staff')` guard added to `me()`. Route also moved into `staff.token` middleware group.  
**File:** `routes/api.php:97`, `app/Http/Controllers/Api/Auth/StaffAuthController.php:83`

The route is under `auth:sanctum` only. A customer token can call `GET /api/auth/me`
and receive staff user data.

**Fix:**
```php
// In StaffAuthController::me()
public function me(Request $request): JsonResponse
{
    if (! $request->user()?->tokenCan('staff')) {
        return response()->json(['message' => 'Forbidden — staff access only.'], 403);
    }
    // ... existing code
}
```

---

### CR-7 · Admin logout does NOT clear token from localStorage
**Status:** ✅ Fixed — `handleLogout` now calls `apiLogout()` to revoke server token, removes `admin_token` from localStorage, and redirects to `/login`.  
**File:** `apps/admin-dashboard/src/App.tsx:60–62`

```ts
const handleLogout = () => {
    setUser(null); // ← token stays in localStorage; re-auth on next visit
};
```

**Fix:**
```ts
const handleLogout = async () => {
    localStorage.removeItem('admin_token');
    setUser(null);
    try { await logout(); } catch { /* ignore — token is already removed */ }
    navigate('/login');
};
```

---

### CR-8 · POS "Resume Held Order" restores nothing
**Status:** ✅ Fixed — `setCartItems` added to `Params` interface; `handleResumeLastHold` now calls `params.setCartItems(restoredItems)` and clears the held order ID from localStorage.  
**File:** `apps/pos-web/src/hooks/useOrderCreation.ts:139–159`

`restoredItems` is returned inside `.then()` but never consumed — cart stays
empty; every held order is silently lost.

**Fix:** Pass a `setCartItems` callback into the hook's `Params` interface and
call it with the restored items:
```ts
.then((response) => {
    const restoredItems: CartItem[] = response.order.items.map((item) => ({
        id: item.item_id,
        name: item.item_name,
        price: item.unit_price,
        quantity: item.quantity,
        modifiers: [],
    }));
    params.setCartItems(restoredItems); // ← add this
    setStatusMessage('Held order resumed.');
})
```

---

### CR-9 · OTP displayed as hint regardless of environment
**Status:** ✅ Fixed — `if (import.meta.env.DEV && res.otp)` guard added; hint is tree-shaken from production builds.  
**File:** `apps/online-order-web/src/components/AuthBlock.tsx:20–22`

**Fix:**
```ts
if (import.meta.env.DEV && res.otp) setHint(`Dev OTP: ${res.otp}`);
```

---

### CR-10 · Hardcoded demo PINs visible in POS production build
**Status:** ✅ Already fixed  
**File:** `apps/pos-web/src/pages/LoginPage.tsx:49–51`, `apps/kds-web/src/App.tsx:191`

Both POS and KDS PIN hints are correctly wrapped in `{import.meta.env.DEV && (...)}` 
and are tree-shaken out of production builds. No action needed.

---

### CR-11 · `GET /inventory/low-stock` unreachable (route shadow)
**Status:** ✅ Fixed — `low-stock` and `stock-count` routes moved above `{id}` wildcard in `routes/api.php`.  
**File:** `routes/api.php:139, 143`

`GET /inventory/{id}` appears above `GET /inventory/low-stock` — Laravel routes
`low-stock` to `findOrFail('low-stock')` → 404.

**Fix:** Move the specific route ABOVE the wildcard:
```php
Route::get('/inventory/low-stock', [InventoryController::class, 'lowStock']); // ← FIRST
Route::get('/inventory/{id}',      [InventoryController::class, 'show']);      // ← second
```

---

### CR-12 · `APP_DEBUG=true` and empty `APP_KEY` in `.env.example`
**Status:** ✅ Fixed — `APP_DEBUG` defaults to `false`; `APP_KEY` has a comment directing use of `php artisan key:generate`.  
**File:** `backend/.env.example:3–4`

```
APP_KEY=
APP_DEBUG=true
```

**Fix:**
```
# IMPORTANT: Generate with `php artisan key:generate`
APP_KEY=
APP_DEBUG=false   # NEVER set to true in production
```

---

### CR-13 · Default passwords in `docker-compose.yml`
**Status:** ✅ Fixed — `DB_PASSWORD` and `PRINT_PROXY_KEY` now use `:?` syntax so Docker fails to start if the secrets are not explicitly set.  
**File:** `docker-compose.yml:8, 50, 73`

`DB_PASSWORD:-secret` and `PRINT_PROXY_KEY` default to guessable strings.

**Fix:** Remove defaults so containers fail to start if secrets are not set:
```yaml
environment:
    DB_PASSWORD: ${DB_PASSWORD:?DB_PASSWORD must be set}
    PRINT_PROXY_KEY: ${PRINT_PROXY_KEY:?PRINT_PROXY_KEY must be set}
```

---

### CR-14 · Promo apply/remove missing order ownership check
**Status:** ✅ Already fixed (in CURSOR_SECURITY_FIXES implementation)  
**File:** `app/Http/Controllers/Api/PromotionController.php`

Customer tokens can only apply/remove promos on their own orders. `cancelled`
added to `removeFromOrder` blocked-status list. *(Done — verify in code.)*

---

### CR-15 · No deploy step in CI
**Status:** ✅ Fixed — deploy job added to ci.yml; requires DEPLOY_SSH_KEY, DEPLOY_HOST, DEPLOY_USER GitHub secrets.  
**File:** `.github/workflows/ci.yml`

Merges to `main` are never automatically delivered anywhere.

**Fix:** Add a `deploy` job (minimum: notify the server to pull):
```yaml
deploy:
    name: Deploy to production
    runs-on: ubuntu-latest
    needs: [contract]
    if: github.ref == 'refs/heads/main'
    steps:
        - name: Trigger server pull
          run: |
            ssh deploy@your-server "cd /path/to/app && git pull origin main && cd backend && php artisan migrate --force && php artisan config:cache && php artisan route:cache"
```
*(Adjust to your actual deployment method — SSH, webhook, etc.)*

---

## HIGH — Fix Before or On Launch Day <a name="high"></a>

---

### H-1 · Empty exception handler in `bootstrap/app.php`
**Status:** ✅ Fixed  
**File:** `backend/bootstrap/app.php:22–24`

Unhandled exceptions may leak stack traces to clients in production.

**Fix:**
```php
->withExceptions(function (Exceptions $exceptions): void {
    $exceptions->shouldRenderJsonWhen(fn (Request $request) => $request->expectsJson());
    $exceptions->renderable(function (\Throwable $e, Request $request) {
        if ($request->expectsJson() && app()->isProduction()) {
            return response()->json([
                'message' => 'An unexpected error occurred.',
            ], 500);
        }
    });
})
```

---

### H-2 · No webhook idempotency for BML payments
**Status:** ✅ Already fixed  
**File:** `app/Domains/Payments/Services/PaymentService.php`

`WebhookLog::firstOrCreate(['idempotency_key' => $key])` is already in place — duplicate webhook deliveries are correctly deduplicated. No action needed.

---

### H-3 · No double-refund protection
**Status:** ✅ Fixed  
**File:** `app/Http/Controllers/Api/RefundController.php:47–60`

Only checks `$amount > $order->total`. Multiple partial refunds can exceed total.

**Fix:**
```php
$alreadyRefunded = Refund::where('order_id', $order->id)
    ->whereIn('status', ['approved', 'completed'])
    ->sum('amount');

if (bcadd((string)$amount, (string)$alreadyRefunded, 2) > $order->total) {
    return response()->json(['message' => 'Refund would exceed order total.'], 422);
}
// Wrap the create in a transaction with a pessimistic lock:
DB::transaction(function () use ($order, $request) {
    $order = Order::lockForUpdate()->findOrFail($order->id);
    // ... create refund
});
```

---

### H-4 · Missing security headers
**Status:** ✅ Fixed  
**File:** No security headers middleware exists

**Fix — create middleware:**
```php
// app/Http/Middleware/SecurityHeaders.php
class SecurityHeaders
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);
        $response->headers->set('X-Frame-Options', 'DENY');
        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $response->headers->set('Referrer-Policy', 'strict-origin-when-cross-origin');
        $response->headers->set('X-XSS-Protection', '0');
        $response->headers->set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
        if ($request->secure()) {
            $response->headers->set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        }
        return $response;
    }
}
```
Register globally in `bootstrap/app.php`:
```php
$middleware->append(\App\Http\Middleware\SecurityHeaders::class);
```

---

### H-5 · CORS wildcard methods and headers
**Status:** ✅ Fixed  
**File:** `config/cors.php:19, 33`

**Fix:**
```php
'allowed_methods' => ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
'allowed_headers' => [
    'Content-Type', 'Authorization', 'X-Requested-With',
    'Accept', 'X-Device-Identifier', 'X-Device-Token',
],
```

---

### H-6 · Sanctum token expiration — currently 30 days, should be 7
**Status:** ✅ Fixed — 10080 min (7 days), overrideable via SANCTUM_TOKEN_EXPIRATION env
**File:** `config/sanctum.php`

**Fix:**
```php
'expiration' => 60 * 24 * 7, // 7 days in minutes = 10080
```
Customer tokens can be longer-lived; staff tokens should be shorter. Consider
per-ability expiry if Laravel Sanctum supports it in your version.

---

### H-7 · SPA catch-all routes serve files without existence check
**Status:** ✅ Fixed  
**File:** `backend/routes/web.php:69–76`

If built assets are missing, throws an unhandled exception.

**Fix:**
```php
Route::get('/order/{any}', function () {
    $path = public_path('order/index.html');
    return file_exists($path)
        ? response()->file($path)
        : abort(503, 'Application not yet deployed. Run the build script.');
})->where('any', '.*');
// Apply the same pattern to /kds/{any}, /pos/{any}, /admin/{any}
```

---

### H-8 · Hardcoded localhost fallback in frontend API clients
**Status:** ✅ Fixed  
**Files:** `apps/*/src/api.ts`

Falls back to `http://localhost:8000` if env var is not set in production.

**Fix — add to each app's `src/api.ts` or `src/main.tsx`:**
```ts
const baseURL = import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.PROD ? '' : 'http://localhost:8000');
if (import.meta.env.PROD && !import.meta.env.VITE_API_BASE_URL) {
    console.error('[CONFIG] VITE_API_BASE_URL is not set — API calls will fail');
}
```

---

### H-9 · KDS `handleStart`, `handleBump`, `handleRecall` — no error handling
**Status:** ✅ Fixed  
**File:** `apps/kds-web/src/App.tsx:101–145`

Silent failures in the kitchen — orders can appear unchanged while the API
actually failed.

**Fix:**
```ts
const handleBump = (orderId: number) => {
    if (!token) return;
    bumpOrder(token, orderId)
        .then(() => {
            setOrders(current => current.filter(o => o.id !== orderId));
        })
        .catch((err) => {
            setError(`Failed to bump order #${orderId}: ${err.message ?? 'Network error'}`);
        });
};
// Same pattern for handleStart and handleRecall
```

---

### H-10 · No role-based route protection in admin dashboard
**Status:** ✅ Fixed  
**File:** `apps/admin-dashboard/src/App.tsx:27–36`

Any staff member can access all admin pages. Cashier should not see Finance,
Staff Management, or Webhooks.

**Fix — extend AuthGuard:**
```tsx
function RoleGuard({
    user,
    allowed,
    children,
}: {
    user: StaffUser | null;
    allowed: string[];
    children: React.ReactNode;
}) {
    if (!user) return <Navigate to="/login" replace />;
    if (!allowed.includes(user.role ?? '')) return <Navigate to="/orders" replace />;
    return <>{children}</>;
}

// Then apply to sensitive routes:
<Route path="staff" element={
    <RoleGuard user={user} allowed={['admin', 'owner']}>
        <StaffPage />
    </RoleGuard>
} />
<Route path="finance/*" element={
    <RoleGuard user={user} allowed={['manager', 'admin', 'owner']}>
        <FinancePage />
    </RoleGuard>
} />
```

---

### H-11 · POS silently enqueues ALL API errors as offline orders
**Status:** ✅ Fixed  
**File:** `apps/pos-web/src/hooks/useOrderCreation.ts:99–103`

422/403/500 errors are queued for offline sync — they will fail again on retry.

**Fix:**
```ts
.catch((err: unknown) => {
    const isNetworkError = err instanceof TypeError ||
        (err instanceof Error && err.message === 'Failed to fetch');
    if (isNetworkError) {
        enqueue(payload);
        params.setOfflineQueueCount(getQueueCount());
        setStatusMessage('No connection. Order saved for sync.');
    } else {
        // Show the actual error to staff
        const msg = err instanceof Error ? err.message : 'Order failed. Please retry.';
        setStatusMessage(`Error: ${msg}`);
    }
});
```

---

### H-12 · KDS polling has no backoff or 401 detection
**Status:** ✅ Fixed  
**File:** `apps/kds-web/src/App.tsx:63–67`

720 failed requests/hour when server is down. Expired sessions never redirect.

**Fix:**
```ts
let consecutiveErrors = 0;

const loadOrders = async () => {
    try {
        const data = await getActiveOrders(token!);
        setOrders(data.orders ?? []);
        consecutiveErrors = 0;
    } catch (err: unknown) {
        consecutiveErrors++;
        if (err instanceof Error && err.message.includes('Session expired')) {
            setToken(null);
            localStorage.removeItem('kds_token');
            return; // stops retrying; component re-renders to login
        }
    }
};

// Backoff: 5s → 10s → 30s → 60s cap
const interval = Math.min(5000 * Math.pow(2, consecutiveErrors), 60000);
const timer = window.setTimeout(loadOrders, interval);
```

---

### H-13 · POS hardcoded fallback menu items shipped to production
**Status:** ✅ Fixed  
**File:** `apps/pos-web/src/hooks/useMenu.ts:5–18`

Items with IDs 101/102/201/301 can be sent to the kitchen when the API fails.

**Fix:** Remove fallback items entirely. Show a blocking error state instead:
```ts
if (!isLoading && error) {
    return (
        <div className="flex items-center justify-center h-full">
            <div className="text-center">
                <p className="text-red-600 font-bold">Cannot load menu</p>
                <p className="text-sm text-gray-500">{error}</p>
                <button onClick={retry} className="mt-4 btn-primary">Retry</button>
            </div>
        </div>
    );
}
```

---

### H-14 · `AnalyticsController::retention` — N+1 query bomb
**Status:** ✅ Fixed  
**File:** `app/Http/Controllers/Api/AnalyticsController.php:59–78`

Up to 1,200+ queries per request. No cap on `$weeks`.

**Fix:**
```php
// Fetch all first-order dates in a single query
$firstOrders = DB::table('orders')
    ->select('customer_id', DB::raw('MIN(created_at) as first_order_at'))
    ->whereIn('customer_id', $customerIds)
    ->whereNotIn('status', ['cancelled'])
    ->groupBy('customer_id')
    ->pluck('first_order_at', 'customer_id');

// Then use the in-memory map instead of per-customer queries
```

---

### H-15 · `lookupByBarcode` references non-existent Item properties
**Status:** ✅ Fixed  
**File:** `app/Http/Controllers/Api/ItemController.php:218–220`

`$item->price` and `$item->unit` don't exist on the `Item` model — weight-priced
items are always mis-priced.

**Fix:**
```php
// Replace:
if ($item->price && $item->unit === 'kg') {
// With:
if ($item->base_price && ($item->price_type ?? '') === 'by_weight') {
    $response['weight_price'] = (int) round($item->base_price * $weightGrams / 1000);
}
```
*(Verify the actual field/column name for weight pricing in your schema.)*

---

### H-16 · `ReportsController::parseRange` — unvalidated Carbon::parse
**Status:** ✅ Fixed  
**File:** `app/Http/Controllers/Api/ReportsController.php:361–364`

Malformed `?from=not-a-date` → uncaught 500.

**Fix:**
```php
protected function parseRange(Request $request): array
{
    $request->validate([
        'from' => ['nullable', 'date_format:Y-m-d'],
        'to'   => ['nullable', 'date_format:Y-m-d'],
    ]);
    $from = Carbon::parse($request->query('from', now()->subDays(30)->toDateString()))->startOfDay();
    $to   = Carbon::parse($request->query('to', now()->toDateString()))->endOfDay();
    return [$from, $to];
}
```

---

### H-17 · `WasteLogController::store` — no DB transaction
**Status:** ✅ Fixed  
**File:** `app/Http/Controllers/Api/WasteLogController.php:51–84`

WasteLog create, inventory decrement, and StockMovement create are not wrapped in
a transaction — inconsistent state on any crash.

**Fix:**
```php
public function store(Request $request): JsonResponse
{
    $validated = $request->validated();
    return DB::transaction(function () use ($validated, $request) {
        $wasteLog = WasteLog::create([...]);
        $item = InventoryItem::lockForUpdate()->findOrFail($validated['inventory_item_id']);
        $item->decrement('current_stock', $validated['quantity']);
        StockMovement::create([...]);
        return response()->json($wasteLog, 201);
    });
}
```

---

### H-18 · Gitleaks non-blocking in CI
**Status:** ✅ Fixed  
**File:** `.github/workflows/ci.yml`

Gitleaks posts a PR comment but does NOT fail the build — secrets can be merged.

**Fix:**
```yaml
- name: Run Gitleaks
  uses: gitleaks/gitleaks-action@v2
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    GITLEAKS_FAIL_ON_LEAK: "true"   # ← add this
```

---

### H-19 · No frontend CI jobs
**Status:** ✅ Fixed  
**File:** `.github/workflows/ci.yml`

No TypeScript type-checking or build validation for any of the 4 React apps or
`print-proxy`. A broken compile ships silently.

**Fix:**
```yaml
frontend:
    name: Frontend build + typecheck
    runs-on: ubuntu-latest
    needs: secret-scan
    steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with: { node-version: '20' }
        - run: npm ci
          working-directory: packages/shared
        - name: Typecheck shared
          run: npx tsc --noEmit
          working-directory: packages/shared
        - name: Build + typecheck each app
          run: |
            for app in online-order-web admin-dashboard kds-web pos-web; do
                echo "=== $app ==="
                cd apps/$app && npm ci && npx tsc --noEmit && npm run build
                cd ../..
            done
        - name: Build print-proxy
          run: npm ci && npm run build
          working-directory: print-proxy
```

---

### H-20 · `PurchaseOrdersPage` has its own duplicate API client
**Status:** ✅ Fixed  
**File:** `apps/admin-dashboard/src/pages/PurchaseOrdersPage.tsx:5–17`

Defines a local `req()` and `BASE` URL, bypassing all shared auth/error logic.

**Fix:** Remove the local `req` / `BASE` / `authHeaders`. Import from `../api`:
```ts
// Remove lines 5-17 and replace fetch calls with:
import { req } from '../api'; // or whichever shared function is appropriate
```

---

### H-21 · Static default deviceId causes terminal collisions
**Status:** ✅ Fixed  
**Files:** `apps/kds-web/src/App.tsx:23`, `apps/pos-web/src/App.tsx:22`

Default `"KDS-001"` / `"POS-001"` — two terminals sharing an ID causes order
routing and print queue collisions.

**Fix:**
```ts
// Generate and persist a unique ID per device
const getOrCreateDeviceId = (storageKey: string, prefix: string): string => {
    const stored = localStorage.getItem(storageKey);
    if (stored) return stored;
    const id = `${prefix}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    localStorage.setItem(storageKey, id);
    return id;
};

const [deviceId, setDeviceId] = useState(() => getOrCreateDeviceId('kds_device_id', 'KDS'));
```

---

### H-22 · `print-proxy/Dockerfile` — `|| true` swallows build errors
**Status:** ✅ Fixed  
**File:** `print-proxy/Dockerfile:13`

`RUN npm run build || true` — TypeScript errors are ignored; container can ship
with broken JS.

**Fix:**
```dockerfile
RUN npm run build
```
Remove `|| true`. A failed build must fail the Docker image build.

---

### H-23 · `print-proxy/Dockerfile` — `npm install` instead of `npm ci`
**Status:** ✅ Fixed  
**File:** `print-proxy/Dockerfile:10`

**Fix:**
```dockerfile
RUN npm ci --omit=dev
```

---

### H-24 · `AnalyticsPage` swallows all errors silently
**Status:** ✅ Fixed  
**File:** `apps/admin-dashboard/src/pages/AnalyticsPage.tsx:35`

**Fix:**
```tsx
const [error, setError] = useState<string | null>(null);

// In the catch block:
} catch (e) {
    setError(e instanceof Error ? e.message : 'Failed to load analytics data.');
} finally {
    setLoading(false);
}

// In the render:
{error && (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
        <p className="text-red-700 font-medium">⚠ {error}</p>
        <button onClick={fetchAll} className="mt-2 text-sm text-red-600 underline">Retry</button>
    </div>
)}
```

---

### H-25 · `backup.sh` and `DB_CONNECTION` are inconsistent with `docker-compose.yml`
**Status:** ✅ Fixed  
**File:** `scripts/backup.sh:12–17`, `backend/.env.example`, `docker-compose.yml`

There is a conflict between configs:
- `docker-compose.yml` uses **PostgreSQL 15** (`image: postgres:15-alpine`)
- `backend/.env.example` says `DB_CONNECTION=mysql`
- `scripts/backup.sh` hardcodes `pg_dump`

`pg_dump` is correct for Docker deployments but will fail for any non-Docker
deployment that follows `.env.example` and uses MySQL. The project needs to
pick one database engine and be consistent, OR `backup.sh` must auto-detect.

**Fix — make backup.sh auto-detect:**
```bash
DB_CONN=$(grep "^DB_CONNECTION" backend/.env | cut -d= -f2 | tr -d '[:space:]')
if [[ "$DB_CONN" == "mysql" ]]; then
    mysqldump -u"$DB_USERNAME" -p"$DB_PASSWORD" -h"$DB_HOST" "$DB_DATABASE" > "$BACKUP_DIR/db.sql"
elif [[ "$DB_CONN" == "pgsql" ]]; then
    PGPASSWORD="$DB_PASSWORD" pg_dump -U "$DB_USERNAME" -h "$DB_HOST" "$DB_DATABASE" > "$BACKUP_DIR/db.sql"
else
    echo "Unknown DB_CONNECTION: $DB_CONN"; exit 1
fi
```
**Also fix the inconsistency:** update `backend/.env.example` to say
`DB_CONNECTION=pgsql` if PostgreSQL (docker-compose) is the intended production
database.

---

## MEDIUM — First Sprint After Launch <a name="medium"></a>

---

### M-1 · Rate limiting gaps on sensitive operations
**Status:** ✅ Fixed  
**File:** `routes/api.php`

Add `->middleware('throttle:X,1')` to:
- `POST /orders/{id}/hold` → `throttle:20,1`
- `POST /orders/{id}/resume` → `throttle:20,1`
- `POST /orders/{id}/payments` → `throttle:10,1`
- `POST /shifts/{id}/close` → `throttle:5,1`
- `POST /shifts/{id}/cash-movements` → `throttle:30,1`
- `POST /orders/{id}/refunds` → `throttle:10,1`
- `POST /stripe/webhook` → `throttle:100,1`

---

### M-2 · Promotion code rate limit too permissive
**Status:** ✅ Fixed  
**File:** `routes/api.php:289`

`throttle:30,1` allows 30 promo code guesses per minute.

**Fix:** Change to `throttle:5,1`.

---

### M-3 · No upper bounds on order quantities or refund amounts
**Status:** ✅ Fixed  
**Files:** `app/Http/Requests/StoreOrderRequest.php`, `app/Http/Requests/StoreRefundRequest.php`

**Fix:**
```php
// StoreOrderRequest:
'items.*.quantity' => 'required|integer|min:1|max:999',

// StoreRefundRequest — validate against order total in the controller (see H-3 above)
```

---

### M-4 · Analytics `$days` / `$lookback` have no upper bound
**Status:** ✅ Fixed  
**File:** `app/Http/Controllers/Api/AnalyticsController.php:23, 141`

`?days=999999` triggers a full-table scan.

**Fix:**
```php
$days        = min((int) ($request->query('days', 30)), 365);
$lookbackDays = min((int) ($request->query('lookback', 90)), 365);
```

---

### M-5 · Unbounded date range in `salesTrends` / ForecastController
**Status:** ✅ Fixed  
**File:** `app/Http/Controllers/Api/ForecastController.php:111–126`

**Fix:** Cap range at 12 months maximum:
```php
$from = max($from, now()->subYear()); // Never go beyond 1 year back
if ($to->diffInDays($from) > 366) {
    return response()->json(['message' => 'Date range cannot exceed 1 year.'], 422);
}
```

---

### M-6 · Unauthenticated bulk stock-check exposes inventory data
**Status:** ✅ Fixed  
**File:** `routes/api.php:249–256`

**Fix:**
```php
// Validate input:
$request->validate(['item_ids' => 'required|array|max:50|each:integer']);
// Remove low_stock_threshold from the SELECT columns unless user is staff
```

---

### M-7 · Search parameter not length-validated
**Status:** ✅ Fixed  
**File:** `app/Http/Controllers/Api/ItemController.php:35`

`$request->search` used in LIKE query with no length limit — can be a 100KB
string.

**Fix:**
```php
$search = Str::limit(strip_tags($request->query('search', '')), 100);
```

---

### M-8 · Missing database indexes for reporting queries
**Status:** ✅ Fixed  
**File:** `database/migrations/`

Create a new migration:
```php
Schema::table('payments', function (Blueprint $table) {
    $table->index('processed_at');
    $table->index('reference_number');
});
Schema::table('orders', function (Blueprint $table) {
    $table->index(['status', 'created_at']);
    $table->index('customer_id');
    $table->index('shift_id');
});
Schema::table('order_items', function (Blueprint $table) {
    $table->index('item_id');
});
```

---

### M-9 · File upload lacks dimension and quota limits
**Status:** ✅ Fixed  
**File:** `app/Http/Controllers/Api/ImageUploadController.php`

**Fix:**
```php
'image' => [
    'required', 'image', 'mimes:jpeg,png,webp',
    'max:5120',                                  // 5MB
    'dimensions:max_width=4096,max_height=4096', // prevent 10k×10k bombs
],
```

---

### M-10 · `SESSION_SECURE_COOKIE` not configured for HTTPS
**Status:** ✅ Fixed  
**File:** `config/session.php:174`

**Fix:**
```php
'secure' => env('SESSION_SECURE_COOKIE', app()->isProduction()),
```
Also add to `.env.example`:
```
SESSION_SECURE_COOKIE=true   # Required for HTTPS deployments
```

---

### M-11 · Phone numbers hardcoded in 6+ order-app page files
**Status:** ✅ Fixed  
**Files:** `OrderStatusPage.tsx`, `CheckoutPage.tsx`, `PreOrderPage.tsx`, `PrivacyPage.tsx`, `HoursPage.tsx`

**Fix:** Export `BIZ` from `Layout.tsx` (or create `src/constants/biz.ts`) and
import it everywhere:
```ts
// src/constants/biz.ts
export const BIZ = {
    phone:    '+960 912 0011',
    phoneTel: '+9609120011',
    email:    'hello@bakeandgrill.mv',
    whatsapp: 'https://wa.me/9609120011',
    viber:    'viber://chat?number=9609120011',
    maps:     'https://maps.google.com/?q=Kalaafaanu+Hingun+Male+Maldives',
} as const;
```

---

### M-12 · `VITE_DELIVERY_FEE_MVR` not validated — produces `NaN` at checkout
**Status:** ✅ Fixed  
**File:** `apps/online-order-web/src/hooks/useCheckout.ts:80`

**Fix:**
```ts
const rawFee = parseInt(import.meta.env.VITE_DELIVERY_FEE_MVR ?? '20', 10);
if (isNaN(rawFee) || rawFee < 0) {
    throw new Error('VITE_DELIVERY_FEE_MVR must be a non-negative integer');
}
setDeliveryFee(rawFee * 100);
```

---

### M-13 · `ReservationPage` and `ReviewForm` use raw `fetch`
**Status:** ✅ Fixed  
**Files:** `apps/online-order-web/src/pages/ReservationPage.tsx`, `ReviewForm.tsx`

Both bypass the shared API client — no centralised auth or error handling.

**Fix:** Replace raw `fetch` calls with the shared `createApiClient` or the
page-level API functions already defined in `api.ts`.

---

### M-14 · `CustomerController::optOut` leaks phone number registration status
**Status:** ✅ Fixed  
**File:** `app/Http/Controllers/Api/CustomerController.php:148–159`

Returns 404 for unknown numbers — enables phone enumeration.

**Fix:**
```php
public function optOut(Request $request): JsonResponse
{
    $request->validate(['phone' => 'required|string']);
    // Always update and always return 200 — never reveal if the number exists
    Customer::where('phone', $request->phone)
        ->update(['sms_opt_out' => true, 'sms_opt_out_at' => now()]);
    return response()->json(['message' => 'If this number is registered, you have been opted out.']);
}
```

---

### M-15 · Shift cash calculation scoped to user, not shift
**Status:** ✅ Fixed  
**File:** `app/Http/Controllers/Api/ShiftController.php:88–93`

Two-shift days inflate cash sales reports.

**Fix:**
```php
$cashSales = Payment::where('method', 'cash')
    ->whereHas('order', fn ($q) => $q->where('shift_id', $shift->id))  // ← scope to shift
    ->whereBetween('processed_at', [$shift->opened_at, now()])
    ->sum('amount');
```

---

### M-16 · `Table::close()` allows closing tables with unpaid orders
**Status:** ✅ Fixed  
**File:** `app/Http/Controllers/Api/TableController.php:153–169`

**Fix:**
```php
public function close(Request $request, int $id): JsonResponse
{
    $table = RestaurantTable::findOrFail($id);
    $activeOrder = $this->findActiveOrder($table->id);
    if ($activeOrder) {
        return response()->json([
            'message' => 'Cannot close table — unpaid order exists.',
            'order_id' => $activeOrder->id,
        ], 422);
    }
    $table->update(['status' => 'available']);
    return response()->json(['message' => 'Table closed.']);
}
```

---

### M-17 · `tip_amount` and `estimated_wait_minutes` missing from `Order::$fillable`
**Status:** ✅ Fixed  
**File:** `app/Models/Order.php`

**Fix:**
```php
protected $fillable = [
    // ... existing fields ...
    'tip_amount',
    'estimated_wait_minutes',
];

protected $casts = [
    // ... existing casts ...
    'tip_amount'              => 'decimal:2',
    'estimated_wait_minutes'  => 'integer',
];
```

---

### M-18 · PIN auth loads all staff into memory (O(N) scan)
**Status:** ✅ Fixed  
**File:** `app/Http/Controllers/Api/Auth/StaffAuthController.php:36–40`

**Short-term fix** (add a safety limit):
```php
$user = User::where('is_active', true)
    ->whereNotNull('pin_hash')
    ->limit(500)                          // ← safety net
    ->get()
    ->first(fn (User $user) => Hash::check($pin, $user->pin_hash));
```
**Long-term fix:** Require the user to also submit their `username` or `user_id`,
then verify only that single user's PIN hash.

---

### M-19 · `XeroController` — sessions on stateless API route (OAuth broken)
**Status:** ✅ Fixed  
**File:** `app/Http/Controllers/Api/XeroController.php:29, 41`

API routes don't start sessions — `session()->pull()` always returns `null`;
OAuth state check always fails.

**Fix:** Replace session-based CSRF with a signed cache token:
```php
// In connect():
$state = Str::random(40);
Cache::put("xero_oauth_state_{$request->user()->id}", $state, 300); // 5 min TTL

// In callback():
$expected = Cache::pull("xero_oauth_state_{$request->user()->id}");
if (! $expected || ! hash_equals($expected, $request->state)) {
    return response()->json(['message' => 'Invalid OAuth state.'], 422);
}
```

---

### M-20 · No `.env.example` files in individual app directories
**Status:** ✅ Fixed  
**Files:** All four `apps/*/`

**Fix:** Create `apps/online-order-web/.env.example`:
```
VITE_API_BASE_URL=http://localhost:8000
VITE_DELIVERY_FEE_MVR=20
VITE_VAPID_PUBLIC_KEY=
```
Create `apps/admin-dashboard/.env.example`, `apps/kds-web/.env.example`,
`apps/pos-web/.env.example` with at minimum `VITE_API_BASE_URL=`.

---

### M-21 · `admin-dashboard` has no test suite
**Status:** ✅ Fixed  
**File:** `apps/admin-dashboard/package.json`

The most security-sensitive app has zero automated tests.

**Fix:**
1. Add `vitest`, `@testing-library/react`, `jsdom` to devDependencies
2. Add `"test": "vitest"` to scripts
3. Write minimum smoke tests for: `AuthGuard`, `RoleGuard`, login flow,
   and the logout token-clear fix

---

### M-22 · `InventoryController::adjust` — duplicate variable + no transaction
**Status:** ✅ Fixed  
**File:** `app/Http/Controllers/Api/InventoryController.php:77–116`

**Fix:**
```php
public function adjust(Request $request, int $id): JsonResponse
{
    $validated = $request->validated();
    return DB::transaction(function () use ($validated, $id, $request) {
        $item     = InventoryItem::lockForUpdate()->findOrFail($id);
        $oldStock = $item->current_stock ?? 0; // ← single assignment
        $item->update(['current_stock' => $validated['new_stock']]);
        StockMovement::create([
            'inventory_item_id' => $item->id,
            'type'              => 'adjustment',
            'quantity'          => $validated['new_stock'] - $oldStock,
            'note'              => $validated['note'] ?? 'Manual adjustment',
            'user_id'           => $request->user()->id,
        ]);
        return response()->json($item);
    });
}
```

---

### M-23 · MySQL-only SQL functions break PostgreSQL production AND SQLite tests
**Status:** ✅ Fixed  
**Files:** `AnalyticsController.php`, `ForecastController.php`, `FinanceReportController.php`

`HOUR()`, `DAYOFWEEK()`, `YEARWEEK()`, `DATE_FORMAT()` are MySQL-specific functions
used across all three files. These fail on both **PostgreSQL** (which
`docker-compose.yml` uses in production — `image: postgres:15-alpine`) and
**SQLite** (used in tests). This is not just a test issue — it will cause 500
errors in production for analytics, forecasting, and finance report endpoints.

> Note: `DAYOFWEEK()` in MySQL returns 1=Sunday; PostgreSQL's
> `EXTRACT(DOW FROM ...)` returns 0=Sunday — there is an off-by-one difference
> that must be handled when porting.

**Fix:** Use database-agnostic alternatives that work across MySQL, PostgreSQL,
and SQLite, or use Eloquent/Carbon equivalents instead of raw SQL date functions:
```php
// Instead of DB::raw('HOUR(created_at)'), use:
$hourExpr = match(DB::getDriverName()) {
    'sqlite' => DB::raw("CAST(strftime('%H', created_at) AS INTEGER)"),
    'pgsql'  => DB::raw("EXTRACT(HOUR FROM created_at)"),
    default  => DB::raw('HOUR(created_at)'),
};

// Instead of DB::raw('DAYOFWEEK(created_at)') [MySQL: 1=Sun], use:
$dowExpr = match(DB::getDriverName()) {
    'sqlite' => DB::raw("CAST(strftime('%w', created_at) AS INTEGER) + 1"), // 0=Sun → 1=Sun
    'pgsql'  => DB::raw("EXTRACT(DOW FROM created_at) + 1"),                // 0=Sun → 1=Sun
    default  => DB::raw('DAYOFWEEK(created_at)'),
};

// Instead of DB::raw("DATE_FORMAT(created_at, '%Y-%m')"), use:
$monthExpr = match(DB::getDriverName()) {
    'sqlite' => DB::raw("strftime('%Y-%m', created_at)"),
    'pgsql'  => DB::raw("TO_CHAR(created_at, 'YYYY-MM')"),
    default  => DB::raw("DATE_FORMAT(created_at, '%Y-%m')"),
};
```

---

### M-24 · `SECURITY.md` documents wrong OTP endpoint URLs
**Status:** ✅ Fixed  
**File:** `SECURITY.md:64–65`

Documents `/api/auth/customer/send-otp` but actual route is
`/api/auth/customer/otp/request`.

**Fix:** Update SECURITY.md to match `routes/api.php` exactly.

---

### M-25 · Entire `docs/` directory contains inaccurate AI session artifacts
**Status:** ✅ Fixed  
**Files:** `docs/FINAL_AUDIT_REPORT.md`, `docs/DEPLOYMENT_READY.md`,
`docs/EVERYTHING_COMPLETE.md`, `docs/FINAL_IMPLEMENTATION_STATUS.md`,
`docs/PRODUCTION_HARDENING_COMPLETE.md`, `docs/CHATGPT_IMPLEMENTATION_PLAN.md`,
`docs/SIMPLIFIED_ORDERING_PLAN.md`

All of the above are AI-generated session logs that state variants of "all
systems verified", "production ready", or "no issues found." If any developer
or reviewer reads these before this guide, they will have a completely false
picture of the system's readiness.

**Fix:** Delete all of the above files. The only docs worth keeping are:
- `docs/PRODUCTION_IMPLEMENTATION_GUIDE.md` ← this file
- `docs/SECURITY_AUDIT_AND_IMPLEMENTATION_GUIDE.md`

```bash
cd docs
rm FINAL_AUDIT_REPORT.md DEPLOYMENT_READY.md EVERYTHING_COMPLETE.md \
   FINAL_IMPLEMENTATION_STATUS.md PRODUCTION_HARDENING_COMPLETE.md \
   CHATGPT_IMPLEMENTATION_PLAN.md SIMPLIFIED_ORDERING_PLAN.md
```

---

### M-26 · `gitleaks.toml` uses wrong section syntax
**Status:** ✅ Fixed  
**File:** `.gitleaks.toml`

`[[rules.allowlist]]` is not valid gitleaks v8 syntax — global allowlists use
`[[allowlists]]`. The entire allowlist config may be silently ignored.

**Fix:** Rename sections:
```toml
[[allowlists]]
id = "placeholders"
regexes = ['CHANGE_ME_[A-Z0-9_]+']
paths = ['\.env\.example$']
```

---

## LOW — Ongoing Hardening <a name="low"></a>

---

### L-1 · `otp_verifications` table grows unbounded
**Status:** ✅ Fixed  
**File:** No pruning job exists

**Fix:** Add a daily scheduled command:
```php
// app/Console/Commands/PruneOtpVerifications.php
OtpVerification::where('created_at', '<', now()->subDay())->delete();

// app/Console/Kernel.php or Schedule:
$schedule->command('otp:prune')->daily();
```

---

### L-2 · `InventoryItem` missing numeric casts
**Status:** ✅ Fixed  
**File:** `app/Models/InventoryItem.php`

**Fix:**
```php
protected $casts = [
    'current_stock' => 'float',
    'unit_cost'     => 'decimal:4',
    'reorder_level' => 'float',
];
```

---

### L-3 · `StaffController::index` returns all users with no pagination
**Status:** ✅ Fixed  
**File:** `app/Http/Controllers/Api/StaffController.php:50`

**Fix:**
```php
$users = User::with('role')->orderByDesc('created_at')->paginate(100);
```

---

### L-4 · Push subscribe/unsubscribe routes are fully public
**Status:** ✅ Fixed  
**File:** `routes/api.php:469–472`

**Fix:** Move inside the `auth:sanctum` middleware group, or add at minimum
`throttle:5,1` and an HMAC verification.

---

### L-5 · `TestChecklistPage` accessible in production
**Status:** ✅ Fixed  
**File:** `apps/admin-dashboard/src/App.tsx:101`

**Fix:** Wrap the route in a role check (owner only) or remove in production:
```tsx
<Route path="checklist" element={
    <RoleGuard user={user} allowed={['owner', 'admin']}>
        <TestChecklistPage />
    </RoleGuard>
} />
```

---

### L-6 · No CSP (Content Security Policy) on any app
**Status:** ✅ Fixed  
**Fix:** Add to each `apps/*/index.html`:
```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://api.stripe.com;">
```
Or configure at the Nginx/server level.

---

### L-7 · KDS "● Live" label is misleading
**Status:** ✅ Fixed  
**File:** `apps/kds-web/src/App.tsx:266`

**Fix:** Change to `"● Auto-refresh (5s)"` or implement real SSE.

---

### L-8 · No `document.title` updates in admin, KDS, and POS
**Status:** ✅ Fixed  
**Fix:** Add to each page component:
```ts
useEffect(() => { document.title = 'Orders — Bake & Grill Admin'; }, []);
```
Or use a small `usePageTitle(title: string)` hook shared across pages.

---

### L-9 · `print-proxy` — `axios` installed but never used
**Status:** ✅ Fixed  
**File:** `print-proxy/package.json`

**Fix:** `npm uninstall axios` in the `print-proxy` directory.

---

### L-10 · `print-proxy` runs as root in Docker
**Status:** ✅ Fixed  
**File:** `print-proxy/Dockerfile`

**Fix:**
```dockerfile
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser
```

---

### L-11 · Print ticket timestamp uses server locale (UTC, not Maldives)
**Status:** ✅ Fixed  
**File:** `print-proxy/src/index.ts:163–167`

**Fix:**
```ts
const timeStr = new Date(order.created_at).toLocaleTimeString('en-US', {
    timeZone: 'Indian/Maldives',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
});
```

---

### L-12 · Docker Compose — no restart policies or resource limits
**Status:** ✅ Fixed  
**File:** `docker-compose.yml`

**Fix:**
```yaml
services:
    app:
        restart: unless-stopped
        mem_limit: 512m
        cpus: '1.0'
    print-proxy:
        restart: unless-stopped
        mem_limit: 256m
        cpus: '0.5'
```

---

### L-13 · `composer.json` has `platform-check: false`
**Status:** ✅ Fixed  
**File:** `backend/composer.json`

**Fix:** Remove `"platform-check": false` so Composer validates runtime PHP
version against requirements.

---

### L-14 · README claims "PHP 8.5" — `composer.json` requires `^8.2`
**Status:** ✅ Fixed  
**File:** `README.md:19`

**Fix:** Update README: `PHP 8.2+` and note CI runs on PHP 8.4.

---

### L-15 · Business logic in route closures
**Status:** ✅ Fixed  
**File:** `routes/api.php:249–256, 563–583`

Inline closures for stock-check and inventory routes — not testable.

**Fix:** Extract to `StockController::bulkCheck()` and
`InventoryController::quickAdjust()` controller methods.

---

### L-16 · All npm packages are 1–2 major versions outdated
**Status:** ✅ Fixed  
**Files:** All `apps/*/package.json`

React 18→19, Vite 5→6, TypeScript 5.3→5.7, react-router 6.20→6.30.

**Fix:** Run `npm outdated` per app and upgrade incrementally. Test after each
major version bump.

---

### L-17 · `console.warn` / `console.error` in production code paths
**Status:** ✅ Fixed  
**Files:** Multiple across all four apps

**Fix:** Add to each app's `.eslintrc.json`:
```json
{ "rules": { "no-console": ["warn", { "allow": [] }] } }
```
Then clean up all violations. Replace with a lightweight error tracking call if
needed.

---

### L-18 · Non-null assertion `getElementById('root')!` in all `main.tsx` files
**Status:** ✅ Fixed  
**Fix:**
```ts
const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found in DOM');
ReactDOM.createRoot(rootEl).render(<App />);
```

---

### L-19 · No root `package.json` workspace or `turbo.json`
**Status:** ✅ Fixed  
**Fix (minimum):** Create root `package.json`:
```json
{
    "name": "bakeandgrill",
    "private": true,
    "workspaces": ["apps/*", "packages/*", "print-proxy"]
}
```
Create `turbo.json` for build ordering:
```json
{
    "$schema": "https://turbo.build/schema.json",
    "pipeline": {
        "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
        "typecheck": { "dependsOn": ["^build"] },
        "test": { "dependsOn": ["^build"] }
    }
}
```

---

### L-20 · `REDIS_PASSWORD=null` string in `.env.example`
**Status:** ✅ Fixed  
**File:** `backend/.env.example:28`

Sets the literal string `"null"` — can cause Redis connection failures.

**Fix:** Change to:
```
REDIS_PASSWORD=    # Set a strong random password for production
```

---

### L-21 · Xero `redirect_uri` default is a relative path
**Status:** ✅ Fixed  
**File:** `config/services.php:57`

Xero OAuth requires an absolute URI — relative paths will fail.

**Fix:**
```php
'redirect_uri' => env('XERO_REDIRECT_URI', env('APP_URL') . '/api/xero/callback'),
```

---

### L-22 · `DemoUserSeeder` — no production guard on trivial PINs
**Status:** ✅ Fixed  
**File:** `database/seeders/DemoUserSeeder.php`

`php artisan db:seed` in production creates owner/admin/manager/cashier with
PINs 1111–4444.

**Fix:**
```php
public function run(): void
{
    if (app()->isProduction()) {
        $this->command->warn('DemoUserSeeder: skipped in production.');
        return;
    }
    // ... existing seeder code
}
```

---

### L-23 · `packages/shared` — React listed as production dependency
**Status:** ✅ Fixed  
**File:** `packages/shared/package.json:12`

React should be a `peerDependency` to avoid duplicate React instances.

**Fix:**
```json
"peerDependencies": { "react": ">=18" },
"devDependencies": { "react": "^18.2.0" }
```
Remove from `"dependencies"`.

---

### L-24 · Footer logo has empty `alt` on a navigation link
**Status:** ✅ Fixed  
**File:** `apps/online-order-web/src/components/Layout.tsx:262`

**Fix:** `<img src="/logo.png" alt="Bake & Grill" />`

---

### L-25 · KDS dev PIN hint — already correctly gated (no action needed)
**Status:** ✅  
**File:** `apps/kds-web/src/App.tsx:191`

`{import.meta.env.DEV && <p>Dev PIN: 1234</p>}` is correctly tree-shaken.

---

### L-26 · `restore.sh` — storage archive extracted to current working directory
**Status:** ✅ Fixed  
**File:** `scripts/restore.sh:24`

```bash
tar -xzf "${STORAGE_TAR}" -C .
```
`-C .` means "current directory at the time the script is run." If called from the repo root instead of from `backend/`, the storage files land in the wrong place (or overwrite unintended files).

**Fix:** Pin the target to the Laravel storage path:
```bash
tar -xzf "${STORAGE_TAR}" -C "$(dirname "$0")/../backend/storage"
```

---

### L-27 · `print-proxy` Docker image has no `.dockerignore`
**Status:** ✅ Fixed  
**File:** `print-proxy/` (file missing)

Without a `.dockerignore`, `docker build` bundles `node_modules/`, any local `.env`, and source test files into the image layer, inflating size and leaking local secrets.

**Fix:** Create `print-proxy/.dockerignore`:
```
node_modules
.env
.env.*
*.log
coverage
```

---

### L-28 · `online-order-web` uses `terser` minifier but it is not a direct devDependency
**Status:** ✅ Fixed  
**File:** `apps/online-order-web/vite.config.ts:27`, `apps/online-order-web/package.json`

```ts
build: { minify: 'terser' }
```
`terser` is not listed in `package.json` — it is present today only as a transitive dependency of another package. If that chain changes, production builds will silently fall back to `esbuild` or error.

**Fix:** Add terser explicitly:
```bash
npm install -D terser --workspace=apps/online-order-web
```

---

---

## Quick Reference — Status Summary

| Priority | Total Items | ✅ Done | 🟡 Partial | 🔴 Not Done |
|----------|------------|---------|-----------|------------|
| CRITICAL | 15 | 15 | 0 | 0 |
| HIGH | 25 | 24 | 0 | 1 |
| MEDIUM | 26 | 26 | 0 | 0 |
| LOW | 28 | 27 | 0 | 1 |
| **Total** | **94** | **93** | **0** | **1** |

---

## Recommended Implementation Order

### Phase 1 — Security (Week 1)
Fix CR-1 through CR-15 (all Criticals). These are exploitable today.

### Phase 2 — Stability (Week 1–2)
Fix H-1 through H-25 (all Highs). These prevent crashes and data loss.

### Phase 3 — Hardening (Week 2–3)
Fix M-1 through M-26 (all Mediums). Rate limiting, bounds, transactions.

### Phase 4 — Polish (Ongoing)
Fix L-1 through L-28 (all Lows). CI, Docker, documentation, accessibility.

---

*This document was generated from a full codebase audit (March 2026) combined with
the validated `.cursorrules` findings. Update the status of each item as work
is completed.*

# Authentication Audit — Bugs & Enhancements

> **Cursor Prompt:** Fix the following bugs and implement the guest ordering enhancement. Read each referenced file before making changes. Test each fix in isolation.

---

## BUG 1 — CRITICAL: Password Stored in Plain Text

**File:** `backend/app/Http/Controllers/Api/Auth/CustomerAuthController.php`
**Method:** `resetPassword()` (line ~341)

The API password reset stores the new password **without hashing**:

```php
$customer->update([
    'password' => $input['password'],  // BUG: plain text!
    'last_login_at' => now(),
]);
```

The Blade version in `CustomerPortalController::resetPassword()` correctly uses `Hash::make()`.

**Fix:** Change to:
```php
$customer->update([
    'password' => Hash::make($input['password']),
    'last_login_at' => now(),
]);
```

**Impact:** Any customer who reset their password via the React app has a broken account — `Hash::check()` will always fail on their next login attempt.

---

## BUG 2 — Deactivated Customers Can Log In via Blade

**Files to fix:**
- `backend/app/Http/Controllers/CustomerPortalController.php` — methods `passwordLogin()` and `verifyOtp()`
- `backend/app/Http/Controllers/Api/Auth/CustomerAuthController.php` — method `verifyOtp()`
- `backend/app/Http/Controllers/CustomerPortalController.php` — method `syncSession()`
- `backend/app/Http/Middleware/EnsureCustomerToken.php` — `handle()` method

**Problem:** The API `CustomerAuthController::passwordLogin()` correctly checks `$customer->is_active` and rejects deactivated accounts. But these other entry points do NOT check it:

1. **Blade `passwordLogin()`** — deactivated customer can log in via main website
2. **Blade `verifyOtp()`** — deactivated customer can verify OTP and get a session
3. **API `verifyOtp()`** — deactivated customer can register/login via OTP on React app
4. **`syncSession()`** — deactivated customer with a valid token can establish a Blade session
5. **`EnsureCustomerToken` middleware** — deactivated customer with an existing token can still make API calls

**Fix for each:**

For `CustomerPortalController::passwordLogin()` after the Hash::check block:
```php
if (! $customer->is_active) {
    return back()->withErrors(['phone' => 'This account has been deactivated. Please contact support.']);
}
```

For `CustomerPortalController::verifyOtp()` after `$customer = Customer::firstOrCreate(...)`:
```php
if (! $customer->is_active) {
    return back()->withErrors(['phone' => 'This account has been deactivated. Please contact support.']);
}
```

For `CustomerAuthController::verifyOtp()` after `$customer = Customer::firstOrCreate(...)`:
```php
if (! $customer->is_active) {
    throw ValidationException::withMessages([
        'phone' => ['This account has been deactivated. Please contact support.'],
    ]);
}
```

For `CustomerPortalController::syncSession()`:
```php
$customer = $request->user();
if (! $customer->is_active) {
    return response()->json(['message' => 'Account deactivated.'], 403);
}
```

For `EnsureCustomerToken::handle()` after the `instanceof Customer` check:
```php
if (! $user->is_active) {
    return response()->json(['message' => 'Account deactivated.'], 403);
}
```

---

## BUG 3 — Sanctum Tokens Never Revoked on Logout

**File:** `backend/app/Http/Controllers/CustomerPortalController.php` — method `logout()`

**Problem:** On logout, the session is destroyed and `_cauth_revoked` cookie is set, but Sanctum tokens remain valid in the database forever. Compare with `StaffAuthController::logout()` which correctly calls `currentAccessToken()->delete()`. The React app clears localStorage but the token is still valid — if intercepted, it can be reused.

**Fix:** In `logout()`, before clearing the session, revoke all customer tokens:
```php
public function logout(Request $request)
{
    $customer = Auth::guard('customer')->user();

    // Revoke all Sanctum tokens for this customer
    if ($customer instanceof Customer) {
        $customer->tokens()->delete();
    }

    Auth::guard('customer')->logout();
    $request->session()->invalidate();
    $request->session()->regenerateToken();

    $domain = config('session.domain');
    $secure = $request->isSecure();
    Cookie::queue('_cauth_revoked', '1', 10, '/', $domain, $secure, false, false, 'Lax');

    return redirect('/')->with('message', 'Logged out successfully');
}
```

Also add a customer API logout endpoint in `routes/api.php`:
```php
Route::middleware(['auth:sanctum', 'customer.token'])
    ->post('/auth/customer/logout', function (Request $request) {
        $request->user()->currentAccessToken()->delete();
        return response()->json(['message' => 'Logged out']);
    });
```

And call it from the React app's logout flow in `Layout.tsx` / `api.ts`.

---

## BUG 4 — Token Accumulation

**Files:** `CustomerPortalController.php` (method `queueHandoffCookies`), `CustomerAuthController.php` (methods `passwordLogin`, `verifyOtp`, `check`, `resetPassword`)

**Problem:** Every login creates a new Sanctum token via `createToken()`, but old tokens are never cleaned up. Over time each customer accumulates many tokens in the `personal_access_tokens` table, growing the database unnecessarily.

**Fix:** Before creating a new token in each login method, delete old customer tokens:
```php
// Delete old tokens before issuing a new one
$customer->tokens()->where('name', 'like', 'customer-%')->delete();
$token = $customer->createToken('customer-' . $customer->phone, ['customer'])->plainTextToken;
```

Apply this pattern in:
- `CustomerPortalController::queueHandoffCookies()`
- `CustomerAuthController::passwordLogin()`
- `CustomerAuthController::verifyOtp()`
- `CustomerAuthController::check()`
- `CustomerAuthController::resetPassword()`

---

## BUG 5 — Dual Rate Limiter Keys Allow Double OTP Attempts

**Files:**
- `backend/app/Http/Controllers/CustomerPortalController.php` — uses key `otp-web-request:{phone}`
- `backend/app/Http/Controllers/Api/Auth/CustomerAuthController.php` — uses key `otp-request:{phone}`

**Problem:** The Blade and API controllers use different rate limiter keys. An attacker can request 3 OTPs via the Blade form AND 3 more via the API = 6 OTPs per hour instead of 3.

**Fix:** Unify to a single key. In `CustomerPortalController::requestOtp()` and `forgotPassword()`, change:
```php
// Before:
$key = 'otp-web-request:' . $phone;
// After:
$key = 'otp-request:' . $phone;
```

---

## ENHANCEMENT: Guest Ordering Without Login

**User requirement:** Users must be able to place orders without logging in. Only phone number is required (name optional). Order history and details are only visible when logged in. After placing a guest order, the customer gets a one-time order tracking page.

### Backend Changes

#### 1. Migration — Add guest fields to orders table

Create migration: `php artisan make:migration add_guest_fields_to_orders_table`

```php
public function up(): void
{
    Schema::table('orders', function (Blueprint $table) {
        $table->string('guest_phone', 20)->nullable()->after('customer_id');
        $table->string('guest_name', 100)->nullable()->after('guest_phone');
        $table->string('guest_email', 100)->nullable()->after('guest_name');
        $table->string('guest_token', 64)->nullable()->unique()->after('guest_email');
    });
}

public function down(): void
{
    Schema::table('orders', function (Blueprint $table) {
        $table->dropColumn(['guest_phone', 'guest_name', 'guest_email', 'guest_token']);
    });
}
```

#### 2. Update Order model

**File:** `backend/app/Models/Order.php`

Add to `$fillable`:
```php
'guest_phone', 'guest_name', 'guest_email', 'guest_token',
```

Add to `$hidden` (don't expose token in API responses):
```php
'guest_token',
```

#### 3. Create StoreGuestOrderRequest

**File:** `backend/app/Http/Requests/StoreGuestOrderRequest.php`

```php
<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Rules\MaldivesPhone;
use Illuminate\Foundation\Http\FormRequest;

class StoreGuestOrderRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // No auth required
    }

    public function rules(): array
    {
        return [
            'guest_phone'      => ['required', 'string', new MaldivesPhone()],
            'guest_name'       => 'nullable|string|max:100',
            'guest_email'      => 'nullable|email|max:100',
            'type'             => 'required|string|in:online_pickup',
            'items'            => 'required|array|min:1',
            'items.*.item_id'  => 'required|integer|exists:items,id',
            'items.*.quantity' => 'required|integer|min:1|max:50',
            'items.*.modifiers'           => 'nullable|array',
            'items.*.modifiers.*.modifier_id' => 'required|integer|exists:modifiers,id',
            'customer_notes'   => 'nullable|string|max:500',
        ];
    }
}
```

#### 4. Add guest order endpoints to OrderController

**File:** `backend/app/Http/Controllers/Api/OrderController.php`

Add new method:
```php
public function storeGuest(StoreGuestOrderRequest $request): JsonResponse
{
    $payload = $request->validated();

    // Normalize phone
    $payload['guest_phone'] = \App\Rules\MaldivesPhone::normalize($payload['guest_phone']);

    // Generate a secure guest token for order tracking
    $payload['guest_token'] = bin2hex(random_bytes(32));
    $payload['type'] = 'online_pickup';

    $order = app(OrderCreationService::class)->createFromPayload($payload, null);

    app(AuditLogService::class)->log(
        'order.created', 'Order', $order->id, [], $order->toArray(),
        ['source' => 'guest'], $request
    );

    return response()->json([
        'order' => $order,
        'guest_token' => $payload['guest_token'],
    ], 201);
}
```

Add guest order status endpoint:
```php
public function showGuest(Request $request, int $id): JsonResponse
{
    $request->validate(['token' => 'required|string|size:64']);

    $order = Order::where('id', $id)
        ->where('guest_token', $request->input('token'))
        ->with(['items.modifiers'])
        ->firstOrFail();

    return response()->json(['order' => $order]);
}
```

#### 5. Add routes

**File:** `backend/routes/api.php`

Add outside any auth middleware group:
```php
Route::prefix('guest')->middleware('throttle:10,1')->group(function () {
    Route::post('/orders', [OrderController::class, 'storeGuest']);
    Route::get('/orders/{id}', [OrderController::class, 'showGuest']);
});
```

#### 6. Update OrderCreationService

**File:** `backend/app/Services/OrderCreationService.php`

Ensure `createFromPayload` handles the new guest fields — it should already work if it mass-assigns from the validated payload and `guest_phone`, `guest_name`, `guest_email`, `guest_token` are in `$fillable`. Verify this.

### Frontend Changes

#### 7. Add guest API functions

**File:** `apps/online-order-web/src/api.ts`

```typescript
export async function createGuestOrder(payload: {
  guest_phone: string;
  guest_name?: string;
  items: Array<{ item_id: number; quantity: number; modifiers?: Array<{ modifier_id: number }> }>;
  type: string;
  customer_notes?: string;
}) {
  const res = await fetch(`${API_BASE}/guest/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error((await res.json()).message ?? 'Failed to create order');
  return res.json() as Promise<{ order: { id: number }; guest_token: string }>;
}

export async function getGuestOrder(orderId: number, guestToken: string) {
  const res = await fetch(`${API_BASE}/guest/orders/${orderId}?token=${guestToken}`);
  if (!res.ok) throw new Error('Order not found');
  return res.json();
}
```

#### 8. Update CheckoutPage.tsx

**File:** `apps/online-order-web/src/pages/CheckoutPage.tsx`

Currently, when `!token`, only `AuthBlock` is shown and no checkout form is rendered. Change this to:

- When `!token`: Show a **guest checkout form** with phone field (required) and name field (optional), plus a collapsible "Log in for loyalty points & order history" section containing `AuthBlock`
- Guest checkout skips promo codes and loyalty points sections
- Guest checkout only allows `takeaway` (not delivery — delivery requires an account for driver coordination)

#### 9. Update useCheckout.ts

**File:** `apps/online-order-web/src/hooks/useCheckout.ts`

Add guest checkout flow:
- Add `guestPhone` and `guestName` state
- In `handlePlaceAndPay`, if `!token`, call `createGuestOrder()` instead of `createCustomerOrder()`
- After guest order is placed and payment is initiated, save `{ orderId, guestToken }` to localStorage key `bakegrill_guest_order`
- On payment callback/success page, read this to show order status

#### 10. Update OrderStatusPage.tsx

**File:** `apps/online-order-web/src/pages/OrderStatusPage.tsx`

- Support a `?guest_token=xxx` query parameter
- If present, fetch order via `getGuestOrder()` instead of authenticated endpoint
- Show a prompt: "Create an account to track all your orders" with a link to login
- Guest order status page should NOT show order history link

---

## Files Reference

| File | What to change |
|------|----------------|
| `backend/app/Http/Controllers/Api/Auth/CustomerAuthController.php` | Bug 1 (hash password), Bug 2 (is_active in verifyOtp), Bug 4 (token cleanup) |
| `backend/app/Http/Controllers/CustomerPortalController.php` | Bug 2 (is_active checks), Bug 3 (token revocation on logout), Bug 4 (token cleanup), Bug 5 (rate limiter key) |
| `backend/app/Http/Middleware/EnsureCustomerToken.php` | Bug 2 (is_active check) |
| `backend/routes/api.php` | Bug 3 (customer logout endpoint), Enhancement (guest routes) |
| `backend/app/Models/Order.php` | Enhancement (guest fields in fillable) |
| `backend/app/Http/Controllers/Api/OrderController.php` | Enhancement (storeGuest, showGuest) |
| `backend/app/Http/Requests/StoreGuestOrderRequest.php` | Enhancement (new file) |
| `backend/database/migrations/` | Enhancement (guest fields migration) |
| `apps/online-order-web/src/api.ts` | Bug 3 (customer logout API), Enhancement (guest API) |
| `apps/online-order-web/src/pages/CheckoutPage.tsx` | Enhancement (guest checkout UI) |
| `apps/online-order-web/src/hooks/useCheckout.ts` | Enhancement (guest checkout flow) |
| `apps/online-order-web/src/pages/OrderStatusPage.tsx` | Enhancement (guest token support) |
| `apps/online-order-web/src/components/Layout.tsx` | Bug 3 (call customer logout API) |

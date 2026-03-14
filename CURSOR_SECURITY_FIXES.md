You are working on a Laravel backend for a restaurant monorepo (Bake & Grill). Fix the following 3 verified security vulnerabilities.

---

## Issue 1: Missing ownership check on promotion endpoints

**File:** `backend/app/Http/Controllers/Api/PromotionController.php`

**Problem:** `applyToOrder()` and `removeFromOrder()` are protected by `auth:sanctum` only. Any authenticated user (customer or staff) can apply or remove promotions on ANY order, regardless of ownership. This means Customer A can modify discounts on Customer B's order. Additionally, `removeFromOrder()` only blocks `['paid', 'completed']` statuses but misses `'cancelled'`, while `applyToOrder()` correctly blocks all three.

**Fix for `applyToOrder()`:**
After the line `$order = Order::findOrFail($orderId);` and before the status check, add an ownership guard:

```php
$user = $request->user();
if ($user->tokenCan('customer') && $order->customer_id !== $user->id) {
    return response()->json(['message' => 'Forbidden'], 403);
}
```

This allows staff/admin tokens (which don't have the `customer` ability) to still apply promos to any order, while customers can only modify their own orders.

**Fix for `removeFromOrder()`:**
Add the same ownership guard after `$order = Order::findOrFail($orderId);`:

```php
$user = $request->user();
if ($user->tokenCan('customer') && $order->customer_id !== $user->id) {
    return response()->json(['message' => 'Forbidden'], 403);
}
```

Also fix the incomplete status check in `removeFromOrder()`:

```php
// BEFORE (missing 'cancelled'):
if (in_array($order->status, ['paid', 'completed'], true)) {
    return response()->json(['message' => 'Cannot modify promo on a paid order.'], 422);
}

// AFTER (consistent with applyToOrder):
if (in_array($order->status, ['paid', 'completed', 'cancelled'], true)) {
    return response()->json(['message' => 'Cannot modify promo on this order.'], 422);
}
```

**Do not** change anything about the admin CRUD routes (`adminIndex`, `adminStore`, `adminUpdate`, `adminDestroy`, `adminReport`) — those are separate and not affected.

---

## Issue 2: Sanctum tokens never expire

**File:** `backend/config/sanctum.php`

**Problem:** The `expiration` config is set to `null`, meaning personal access tokens never expire. If a token is leaked or a device is lost, that token remains valid indefinitely.

**Fix:**
Change:
```php
'expiration' => null,
```
To:
```php
'expiration' => 43200, // 30 days in minutes
```

Do not change any other Sanctum config values.

---

## Issue 3: Internal error messages leaked to client in order sync

**File:** `backend/app/Http/Controllers/Api/OrderController.php`

**Problem:** The `sync()` method catches `\Throwable` and returns `$error->getMessage()` directly in the JSON response. This exposes internal details like item IDs, stock quantities, variant IDs, and validation logic to the client. Examples of leaked messages:
- "Item 42 not found or unavailable"
- "Insufficient stock for Garlic Bread. Available: 3, requested: 10"
- "Invalid line total calculated for item 15"

**Fix:**
In the `sync()` method, change the catch block from:
```php
catch (\Throwable $error) {
    $failed[] = ['index' => $index, 'error' => $error->getMessage()];
}
```
To:
```php
catch (\Throwable $error) {
    logger()->error('Order sync failed', [
        'index' => $index,
        'error' => $error->getMessage(),
        'trace' => $error->getTraceAsString(),
    ]);
    $failed[] = ['index' => $index, 'error' => 'Order could not be processed.'];
}
```

The real error details go to the server log for debugging. The client gets a safe generic message.

---

## Testing checklist

After making all three changes, verify:

- [ ] Authenticate as Customer A, try `POST /api/orders/{customerB_order_id}/apply-promo` with a valid code — should return 403 Forbidden
- [ ] Authenticate as Customer A, try `DELETE /api/orders/{customerB_order_id}/promo/{id}` — should return 403 Forbidden
- [ ] Authenticate as Customer A, apply promo to their own order — should work normally
- [ ] Authenticate as staff/admin, apply promo to any order — should work normally (staff tokens don't have `customer` ability)
- [ ] Try removing a promo from a cancelled order — should return 422
- [ ] Trigger a sync error (e.g. send an order with a nonexistent item ID) — response should say "Order could not be processed." and the real error should appear in `storage/logs/laravel.log`
- [ ] Verify existing auth tokens expire after 30 days by checking `sanctum.php` config value is 43200

Do not refactor, rename, or reorganize any other code. Only make the three targeted fixes described above.

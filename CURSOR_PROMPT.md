# Ordering Logic Fixes — Cursor Prompt

> **Context**: This is a Laravel (PHP) + React (TypeScript) monorepo for a restaurant POS & online ordering system (Bake & Grill, Maldives). The backend is in `/backend`, frontend apps are in `/apps/`. All monetary values use dual columns: MVR (decimal) and laari (integer, 1 MVR = 100 laari). Payment gateway is BML Connect (Bank of Maldives).

---

## Fix 1 — CRITICAL: Enforce BML Webhook Signature Verification

**File**: `backend/app/Domains/Payments/Services/PaymentService.php` (lines 211–215)

**Problem**: When BML webhook signature verification fails, the code logs a warning but **continues processing the payment anyway**. An attacker could forge webhook payloads to mark orders as paid without actual payment.

```php
// CURRENT (BROKEN):
if (!$this->bml->verifyWebhookSignature($rawBody, $signature)) {
    Log::warning('BML: Webhook signature mismatch — processing anyway...');
}
```

**Fix**:
- In **production** (`app.env === production`), reject the webhook by throwing a `RuntimeException` when signature verification fails. This will cause the webhook to be logged as `failed` (line 221) and still return 200 to BML (the controller catches all throwables).
- In **non-production**, keep the current warn-and-continue behavior so local/staging development isn't blocked by missing secrets.
- Add an environment variable `BML_ENFORCE_SIGNATURE` (default `true`) to allow overriding this behavior. Read it via `config('bml.enforce_signature')`.
- Add the config key in `backend/config/bml.php` as `'enforce_signature' => env('BML_ENFORCE_SIGNATURE', true)`.
- The rejection should happen right after the existing `Log::warning` line. Throw with message: `'BML webhook signature verification failed — rejecting payload.'`

**Do NOT** change the BmlConnectService `verifyWebhookSignature()` method itself. Only change PaymentService.

---

## Fix 2 — CRITICAL: Promo Removal Does Not Recalculate Order Total

**File**: `backend/app/Http/Controllers/Api/PromotionController.php`, method `removeFromOrder()` (lines 130–157)

**Problem**: When a promo is removed, only `promo_discount_laar` is updated. The `total`, `total_laar`, and `discount_amount` fields are NOT recalculated, so the order keeps the discounted price even after the promo is removed.

**Fix**:
- After updating `promo_discount_laar`, recalculate the order total using the same formula used in `applyToOrder()` (lines 106–116). Specifically, inside the existing `DB::transaction`, after line 153 (`$order->update(['promo_discount_laar' => $totalPromoDiscount])`), add the total recalculation:

```php
$order->update([
    'promo_discount_laar' => $totalPromoDiscount,
    'discount_amount' => round((($order->manual_discount_laar ?? 0) + $totalPromoDiscount) / 100, 2),
    'total' => max(0, round((
        ($order->subtotal_laar ?? (int) round($order->subtotal * 100))
        - $totalPromoDiscount
        - ($order->loyalty_discount_laar ?? 0)
        - ($order->manual_discount_laar ?? 0)
        + ($order->tax_laar ?? (int) round($order->tax_amount * 100))
        + ($order->delivery_fee_laar ?? 0)
    ) / 100, 2)),
    'total_laar' => max(0,
        ($order->subtotal_laar ?? (int) round($order->subtotal * 100))
        - $totalPromoDiscount
        - ($order->loyalty_discount_laar ?? 0)
        - ($order->manual_discount_laar ?? 0)
        + ($order->tax_laar ?? (int) round($order->tax_amount * 100))
        + ($order->delivery_fee_laar ?? 0)
    ),
]);
```

- Also fix `applyToOrder()` (lines 106–116) — it currently does NOT update `total_laar` and does NOT include `delivery_fee_laar`. Apply the same formula above to that method too so both paths are consistent.

---

## Fix 3 — HIGH: Centralize Order Total Calculation

**Problem**: Order totals are calculated inline in at least 4 different places with slightly different logic:
1. `OrderCreationService::createFromPayload()` (line 63) — subtotal + tax - discount
2. `PromotionController::applyToOrder()` (line 109) — subtotal - promo - loyalty - manual + tax (missing delivery fee)
3. `PromotionController::removeFromOrder()` (after Fix 2)
4. `DeliveryOrderController::store()` (line 88) — old total + delivery fee
5. `DeliveryOrderController::update()` (line 137) — old total + fee delta

There is already an `OrderTotalsCalculator` at `backend/app/Domains/Orders/Services/OrderTotalsCalculator.php` but it's not used in the controllers.

**Fix**: Add a convenience method to `Order` model or create a static helper on `OrderTotalsCalculator` that recalculates and persists all total fields from the current order state:

```php
// In OrderTotalsCalculator, add:
public function recalculateAndPersist(Order $order): Order
{
    $subtotalLaar = $order->subtotal_laar ?? (int) round($order->subtotal * 100);
    $promoLaar = $order->promo_discount_laar ?? 0;
    $loyaltyLaar = $order->loyalty_discount_laar ?? 0;
    $manualLaar = $order->manual_discount_laar ?? 0;
    $taxLaar = $order->tax_laar ?? (int) round($order->tax_amount * 100);
    $deliveryFeeLaar = $order->delivery_fee_laar ?? 0;

    $totalDiscountLaar = $promoLaar + $loyaltyLaar + $manualLaar;
    $totalLaar = max(0, $subtotalLaar - $totalDiscountLaar + $taxLaar + $deliveryFeeLaar);

    $order->update([
        'discount_amount' => round($totalDiscountLaar / 100, 2),
        'total_laar' => $totalLaar,
        'total' => round($totalLaar / 100, 2),
    ]);

    return $order;
}
```

Then replace the inline total calculations in:
- `PromotionController::applyToOrder()` — call `$this->calculator->recalculateAndPersist($order)` instead of the inline update (inject `OrderTotalsCalculator` via constructor)
- `PromotionController::removeFromOrder()` — same
- `DeliveryOrderController::store()` — after setting delivery_fee_laar on the order, call recalculateAndPersist
- `DeliveryOrderController::update()` — after updating delivery_fee_laar, call recalculateAndPersist

Do NOT change `OrderCreationService::createFromPayload()` — it has its own flow with tax-per-item logic that works correctly.

---

## Fix 4 — HIGH: `addItemsToOrder` Skips Tax Calculation

**File**: `backend/app/Services/OrderCreationService.php`, method `addItemsToOrder()` (lines 82–93)

**Problem**: When adding items to an existing order (table service), the method adds to subtotal and total but does NOT recalculate tax. If items have tax rates, the order total will be under-reported.

**Fix**:
- After `addOrderItems()`, replicate the tax calculation from `createFromPayload()` (lines 51–58) for the newly added items only.
- Load the new items' related `item` model to get `tax_rate`.
- Add the calculated tax to the order's existing `tax_amount`.
- Or simpler: after adding items, call `recalculateTotals()` but fix that method first (see Fix 5).

---

## Fix 5 — HIGH: `recalculateTotals` Ignores Tax, Delivery, and Discounts

**File**: `backend/app/Services/OrderCreationService.php`, method `recalculateTotals()` (lines 95–104)

**Problem**: This method sets `total = subtotal`, completely ignoring tax, delivery fee, promo/loyalty/manual discounts.

```php
// CURRENT (BROKEN):
public function recalculateTotals(Order $order): Order {
    $subtotal = $order->items()->sum('total_price');
    $order->update(['subtotal' => $subtotal, 'total' => $subtotal]);
    return $order->load(['items.modifiers']);
}
```

**Fix**: Rewrite to account for all components:

```php
public function recalculateTotals(Order $order): Order
{
    $order->load('items.item');

    $subtotal = $order->items->sum('total_price');
    $subtotalLaar = (int) round($subtotal * 100);

    // Recalculate tax from item-level rates
    $taxAmount = 0;
    foreach ($order->items as $orderItem) {
        $item = $orderItem->item;
        if ($item && $orderItem->total_price > 0) {
            $rate = (float) ($item->tax_rate ?? 0);
            $taxAmount += $orderItem->total_price * ($rate / 100);
        }
    }
    $taxLaar = (int) round($taxAmount * 100);

    $promoLaar = $order->promo_discount_laar ?? 0;
    $loyaltyLaar = $order->loyalty_discount_laar ?? 0;
    $manualLaar = $order->manual_discount_laar ?? 0;
    $deliveryFeeLaar = $order->delivery_fee_laar ?? 0;
    $totalDiscountLaar = $promoLaar + $loyaltyLaar + $manualLaar;
    $totalLaar = max(0, $subtotalLaar - $totalDiscountLaar + $taxLaar + $deliveryFeeLaar);

    $order->update([
        'subtotal' => $subtotal,
        'subtotal_laar' => $subtotalLaar,
        'tax_amount' => round($taxAmount, 2),
        'tax_laar' => $taxLaar,
        'discount_amount' => round($totalDiscountLaar / 100, 2),
        'total' => round($totalLaar / 100, 2),
        'total_laar' => $totalLaar,
    ]);

    return $order->load(['items.modifiers']);
}
```

Then update `addItemsToOrder()` to call `$this->recalculateTotals($order)` instead of doing its own partial math.

---

## Fix 6 — MEDIUM: Float Comparison in Payment Status Check

**File**: `backend/app/Http/Controllers/Api/OrderController.php`, method `addPayments()` (line 203)

**Problem**: Payment total comparison uses float cast which can cause precision issues:
```php
if ((float) $paidTotal >= (float) $order->total) {
```

**Fix**: Compare integer laari values instead:
```php
$paidTotalLaar = (int) $order->payments()
    ->whereIn('status', ['paid', 'completed', 'confirmed'])
    ->sum('amount_laar');

$orderTotalLaar = $order->total_laar ?? (int) round($order->total * 100);

if ($paidTotalLaar >= $orderTotalLaar) {
```

If `amount_laar` is not always populated (legacy POS payments use `amount` only), fall back:
```php
$paidTotalLaar = (int) $order->payments()
    ->whereIn('status', ['paid', 'completed', 'confirmed'])
    ->selectRaw('COALESCE(SUM(amount_laar), SUM(ROUND(amount * 100))) as total_laar')
    ->value('total_laar');
```

---

## Fix 7 — MEDIUM: Phone Number Validation on Backend

**File**: `backend/app/Http/Controllers/Api/DeliveryOrderController.php` (line 51)

**Problem**: `delivery_contact_phone` accepts any string up to 30 chars with no format validation.

**Fix**: Add a regex rule for Maldivian phone numbers (7 digits starting with 3, 7, or 9) or international format:
```php
'delivery_contact_phone' => ['required', 'string', 'max:30', 'regex:/^(\+?960)?[379]\d{6}$/'],
```

Also add the same validation to the `update()` method (line 124):
```php
'delivery_contact_phone' => ['sometimes', 'string', 'max:30', 'regex:/^(\+?960)?[379]\d{6}$/'],
```

---

## Fix 8 — MEDIUM: Frontend Cart Cleared Before Payment Confirmation

**File**: `apps/online-order-web/src/hooks/useCheckout.ts` (line 284)

**Problem**: The cart is cleared from localStorage immediately after redirect to BML payment — before payment is confirmed. If the user cancels or payment fails, their cart is lost.

**Fix**:
- Do NOT clear the cart in `useCheckout.ts` after initiating payment.
- Instead, move the cart-clearing logic to `OrderStatusPage.tsx`. Clear the cart only when the order status is confirmed as `pending` or `paid` (meaning payment went through):

In `OrderStatusPage.tsx`, in the effect that fetches order status, add:
```typescript
if (order && ['pending', 'paid', 'completed', 'preparing', 'ready'].includes(order.status)) {
    localStorage.removeItem('bakegrill_cart');
}
```

Remove the `localStorage.removeItem('bakegrill_cart')` call from `useCheckout.ts`.

---

## Fix 9 — MEDIUM: Tracking Token Entropy Too Low

**File**: `backend/app/Models/Order.php` (line 97)

**Problem**: Tracking tokens are 16 lowercase alphanumeric characters. The public tracking endpoint exposes PII (delivery address, contact name/phone).

**Fix**: Increase token length to 32 characters and use the full alphanumeric charset:
```php
$order->tracking_token = Str::random(32);
```

`Str::random()` already uses `random_bytes()` internally (cryptographically secure). The change from `Str::lower(Str::random(16))` to `Str::random(32)` dramatically increases entropy (from ~83 bits to ~190 bits).

---

## Fix 10 — LOW: Add Minimum Order Value Enforcement

**File**: `backend/app/Services/OrderCreationService.php`

**Problem**: No minimum order amount is enforced. Customers can place orders for trivially small amounts.

**Fix**: After calculating the total (line 63), add a minimum check:
```php
$minOrderMvr = (float) config('ordering.minimum_order_mvr', 0);
if ($minOrderMvr > 0 && $total < $minOrderMvr && ($payload['type'] ?? '') !== 'dine_in') {
    abort(422, "Minimum order amount is MVR " . number_format($minOrderMvr, 2));
}
```

Add config in `backend/config/ordering.php`:
```php
return [
    'minimum_order_mvr' => env('MINIMUM_ORDER_MVR', 0),
];
```

---

## Fix 11 — LOW: Stale Order Cleanup

**Problem**: Orders stuck at `payment_pending` status have no TTL. They sit in the database forever if payment is never completed.

**Fix**: Create an Artisan command `app:cancel-stale-orders`:

**File**: `backend/app/Console/Commands/CancelStaleOrders.php`

```php
// Find orders with status 'payment_pending' older than 30 minutes
// Update their status to 'cancelled'
// Release any active loyalty holds for those orders
// Log the cancellation
// Schedule in Console/Kernel.php to run every 5 minutes
```

Register in `backend/app/Console/Kernel.php`:
```php
$schedule->command('app:cancel-stale-orders')->everyFiveMinutes();
```

---

## General Rules

- Do NOT change any database migration files. If schema changes are needed, create new migrations.
- Do NOT remove or rename existing API endpoints.
- Do NOT change the `StoreCustomerOrderRequest` validation rules (they are correct and secure).
- Do NOT modify the `BmlConnectService::verifyWebhookSignature()` method.
- All monetary math must use integer laari where possible, converting to MVR only for display/storage in decimal columns.
- Use `max(0, ...)` to guard against negative totals everywhere.
- Keep all existing audit logging in place.
- Run `./vendor/bin/pint` after making changes to ensure code style compliance.

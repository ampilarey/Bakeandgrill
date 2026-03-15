# Bake & Grill — Full Bug & Security Audit Report

**Date:** 9 Feb 2026  
**Audited by:** AI Code Review (Backend + Frontend + Database)  
**Scope:** `/backend/app`, `/apps/admin-dashboard`, `/apps/online-order-web`, `/apps/pos-web`, `/backend/database`

---

## Severity Legend

| Icon | Level | Meaning |
|------|-------|---------|
| 🔴 | **CRITICAL** | Security vulnerability or data loss — fix before any new traffic |
| 🟠 | **HIGH** | Crash or wrong data — fix before public launch |
| 🟡 | **MEDIUM** | Poor UX, incorrect behaviour, silent failure |
| 🟢 | **LOW** | Technical debt, minor inconsistency |

---

## 🔴 CRITICAL

### C-1 · `CategoryController` & `ItemController` — No Staff Auth Guard
**File:** `backend/app/Http/Controllers/Api/CategoryController.php`, `ItemController.php`  
**Routes:** `POST/PATCH/DELETE /api/categories`, `POST/PATCH/DELETE /api/items`

Routes are protected only by `auth:sanctum`. Any **customer token** can create, edit, or delete menu categories and items. No `tokenCan('staff')` or permission check exists in either controller.

Additionally, `CategoryController::index()` accepts `?admin=1` from any unauthenticated request, bypassing the `is_active` filter and exposing all hidden/draft categories.

**Fix:** Add `$request->user()->tokenCan('staff')` guard to all mutating methods. Remove or guard the `?admin=1` bypass.

---

### C-2 · `StreamController` — Real-time Order Data Exposed to Customers
**File:** `backend/app/Http/Controllers/Api/StreamController.php`  
**Routes:** `GET /api/stream/orders`, `GET /api/stream/kds`

Neither SSE endpoint checks `tokenCan('staff')`. Any customer can subscribe and receive **all orders from every customer** and the full KDS queue in real-time.

**Fix:** Add staff token check at the top of both `orders()` and `kds()` methods.

---

### C-3 · `DeliveryOrderController::update()` — Any Customer Can Modify Any Order
**File:** `backend/app/Http/Controllers/Api/DeliveryOrderController.php`  
**Route:** `PATCH /api/orders/{order}/delivery`

No ownership check. Any authenticated user can change the delivery address, contact name, and phone of any order — including orders belonging to other customers.

**Fix:** Verify `$order->customer_id === $request->user()->id` before allowing the update.

---

### C-4 · `webhook_logs` Missing Outgoing-Webhook Columns
**File:** `backend/database/migrations/2026_03_13_100000_create_webhook_tables.php`

This migration wraps its `webhook_logs` block in `if (!Schema::hasTable('webhook_logs'))`. Because an earlier migration (`2026_02_09_100400`) already created the table, the entire block is **silently skipped** on every real database. The outgoing webhook columns — `direction`, `webhook_subscription_id`, `url`, `event`, `response_code`, `response_body`, `source`, `processed` — were never added.

`WebhookLog::subscription()` will throw `Column not found: 1054 Unknown column 'webhook_subscription_id'` on every call.

**Fix:** Create a new migration that adds the missing columns with `if (!Schema::hasColumn(...))` guards.

---

### C-5 · `preferred_supplier_id` — Wrong Column Type (String vs Integer FK)
**File:** `backend/database/migrations/2026_03_12_500000_add_inventory_enhancements.php`

Column is defined as `$table->string('preferred_supplier_id')` (varchar) but used as an integer FK in `InventoryItem::preferredSupplier()`. The JOIN `inventory_items.preferred_supplier_id = suppliers.id` will **never match** because string `"5"` ≠ integer `5` in MySQL strict mode. The relationship always returns `null`.

**Fix:** A new migration to change the column to `unsignedBigInteger` (or drop and re-add as `foreignId`).

---

### C-6 · `Order::$casts` — `shift_id` References a Non-Existent Column
**File:** `backend/app/Models/Order.php` line 59

`'shift_id' => 'integer'` appears in `Order::$casts` but **no migration has ever added `shift_id` to the `orders` table**. The only `shift_id` column in the codebase is on `cash_movements`. This is a dangling cast that silently returns `null` and misleads developers.

**Fix:** Remove `'shift_id'` from `Order::$casts`.

---

## 🟠 HIGH

### H-1 · POS App: `OrderCart.tsx` Crash — `item.price.toFixed()` on String
**File:** `apps/pos-web/src/components/OrderCart.tsx` line 60  
**File:** `apps/pos-web/src/hooks/useCart.ts` line 57

`useCart` stores `price: item.base_price` directly from the API response. MySQL returns DECIMAL columns as strings. When the cart renders, `item.price.toFixed(2)` throws:
```
TypeError: item.price.toFixed is not a function
```
This crashes the entire cart view every time an item is added.

**Fix:** In `useCart.ts` line 57: `price: parseFloat(String(item.base_price))`.

---

### H-2 · POS App: `OpsPanel.tsx` — 8 Crash Points on String Decimals
**File:** `apps/pos-web/src/components/OpsPanel.tsx` lines 15, 19, 20, 122–125, 129, 189

All of these call `.toFixed()` directly on MySQL decimal string values:
- `ops.shift.opening_cash.toFixed(2)` — line 15
- `ops.shift.expected_cash?.toFixed(2)` — line 19 *(optional chaining doesn't help when value is `"12.50"` string)*
- `ops.shift.variance?.toFixed(2)` — line 20
- `ops.reportData.totals.subtotal.toFixed(2)` — line 122
- `ops.reportData.totals.tax_amount.toFixed(2)` — line 123
- `ops.reportData.totals.discount_amount.toFixed(2)` — line 124
- `ops.reportData.totals.total.toFixed(2)` — line 125
- `r.amount.toFixed(2)` in refund list — line 189

**Fix:** Wrap every call: `parseFloat(String(value ?? 0)).toFixed(2)`.

---

### H-3 · POS App: Cart Total is `NaN` When Any Item Has a Modifier
**File:** `apps/pos-web/src/hooks/useCart.ts` lines 22–33, 57

`price` is stored as a MySQL string (e.g. `"35.00"`). In the `cartTotal` reducer:
```js
item.modifiers.reduce((s, m) => s + m.price, 0)
// → 0 + "5.00" → "05.00"  (string concatenation)
item.price + "05.00"
// → "35.0005.00"  (string concatenation)
"35.0005.00" * quantity → NaN
```
The displayed total is `NaN` and the checkout payment amount is wrong.

**Fix:** Store `price: parseFloat(String(item.base_price))` in `useCart.ts` line 57. Same for modifier prices.

---

### H-4 · Online Order App: `OrderStatusPage` Crash on Item Prices
**File:** `apps/online-order-web/src/pages/OrderStatusPage.tsx` line 415

```tsx
MVR {item.total_price.toFixed(2)}
```
No `parseFloat(String(...))` guard. If `total_price` arrives as a string (which it does from MySQL), this crashes the page every time a customer views their ordered items.

**Fix:** `parseFloat(String(item.total_price ?? 0)).toFixed(2)`.

---

### H-5 · Payment: `initiatePartial` Does Not Set `payment_pending`
**File:** `backend/app/Http/Controllers/Api/PaymentController.php` — `initiatePartial()` method

`initiateOnline()` correctly sets the order to `payment_pending` so the KDS/kitchen doesn't see it prematurely. But `initiatePartial()` (lines 56–96) has no equivalent update. Partial-payment online orders remain `pending` and appear immediately in the KDS queue before payment is confirmed.

**Fix:** Add the same `$order->update(['status' => 'payment_pending'])` block to `initiatePartial()`.

---

### H-6 · Payment: `addPayments()` Race Condition — Order May Never Reach `paid`
**File:** `backend/app/Http/Controllers/Api/OrderController.php` lines 176–216

The payment insert and the paid-total sum + status update are in **two separate transactions** with no row lock on the `orders` row. Concurrent split-payment calls can both read `paidTotal < total` after their inserts, both set `status = 'partial'`, and the order never transitions to `'paid'`.

**Fix:** Combine into one transaction and use `Order::lockForUpdate()->findOrFail($id)` at the start.

---

### H-7 · Inventory: TOCTOU Race in `InventoryDeductionService`
**File:** `backend/app/Services/InventoryDeductionService.php` line 45

```php
$alreadyDeducted = StockMovement::where('idempotency_key', $key)->exists();
// ← race window ←
DB::table('inventory_items')->where('id', $id)->decrement('stock_level', $qty);
StockMovement::create([...]);  // unique constraint would catch duplicate, but decrement already ran
```

Two concurrent requests can both pass `exists()`, both decrement stock, and only the second `StockMovement::create()` fails with a unique constraint — leaving stock **double-decremented** with no record of the second deduction.

**Fix:** Use `lockForUpdate()` on the inventory item row inside the transaction, or handle the unique constraint exception and reverse the decrement.

---

### H-8 · Missing Model Casts on 25+ Models
MySQL/PDO returns all `DECIMAL`, `TINYINT(1)`, and integer FK columns as PHP strings. Most models are missing casts, causing string arithmetic, wrong comparisons, and type errors throughout the app.

**Most impactful missing casts:**

| Model | Missing Casts |
|-------|---------------|
| `OrderItem` | `unit_price`, `total_price` (decimal), `quantity`, `order_id`, `item_id` (integer) |
| `Shift` | `opening_cash`, `closing_cash`, `expected_cash`, `variance` (decimal) |
| `LoyaltyAccount` | `points_balance`, `points_held`, `lifetime_points` (integer) |
| `Variant` | `price` (decimal), `is_active` (boolean), `sort_order` (integer) |
| `Modifier` | `price` (decimal), `is_active` (boolean) |
| `Payment` | `amount`, `amount_laar` (decimal/integer), `order_id` (integer) |
| `Expense` | `amount`, `tax_amount` (decimal), `amount_laar` (integer) |
| `Purchase` | `subtotal`, `tax_amount`, `total` (decimal) |
| `Refund` | `amount` (decimal), `order_id`, `user_id` (integer) |
| `SupplierRating` | All score columns (integer) |
| `Customer` | `loyalty_points` (integer), `is_active` (boolean) |
| `RestaurantTable` | `capacity` (integer), `is_active` (boolean) |
| `Promotion` | `discount_value`, `min_order_laar`, `max_uses` (integer) |
| `OrderItemModifier` | `modifier_price` (decimal), `quantity` (integer) |
| `PurchaseItem` | `quantity`, `unit_cost`, `total_cost` (decimal) |

**Fix:** Add `$casts` arrays to all affected models. See full list in section 8 below.

---

### H-9 · Database: Customer Delivery Fields Not in `$fillable`
**File:** `backend/app/Models/Customer.php`  
**Migration:** `2026_02_04_001000_add_delivery_address_to_customers_table.php`

Five columns — `delivery_address`, `delivery_area`, `delivery_building`, `delivery_floor`, `delivery_notes` — exist in the database but are **absent from `Customer::$fillable`**. Any `$customer->update([...])` call for delivery details silently does nothing.

**Fix:** Add all five to `Customer::$fillable`.

---

### H-10 · Database: `idempotency_key` Not in `StockMovement` and `PrintJob` `$fillable`
These models have a unique-constrained `idempotency_key` column in the DB but it's missing from `$fillable`. The deduplication logic that tries to set it via mass-assignment silently drops the value.

**Fix:** Add `idempotency_key` to `$fillable` in both models.

---

### H-11 · Request Validation: `StoreRefundRequest` — `declined` vs `rejected` Mismatch
**File:** `backend/app/Http/Requests/StoreRefundRequest.php`  
**File:** `backend/app/Http/Controllers/Api/RefundController.php` line 51

Validation allows `status: 'declined'` but `RefundController::store()` queries `->where('status', '!=', 'rejected')`. These are different strings. Declined refunds are always counted in the `already_refunded` total, potentially blocking legitimate refunds.

**Fix:** Standardise on one value — use `'rejected'` everywhere.

---

### H-12 · Request Validation: `StorePurchaseRequest` `supplier_id` Nullable vs NOT NULL
**File:** `backend/app/Http/Requests/StorePurchaseRequest.php`

`supplier_id` is `nullable` in validation but the `purchases` table has `NOT NULL` with no default. Submitting null returns a 500 DB constraint error instead of a clean 422 validation error.

**Fix:** Change validation to `required|integer|exists:suppliers,id`.

---

## 🟡 MEDIUM

### M-1 · Admin Dashboard: 10 Routes Lack `PermissionGuard`
**File:** `apps/admin-dashboard/src/App.tsx`

Routes `/dashboard`, `/orders`, `/kds`, `/delivery`, `/menu`, `/promotions`, `/loyalty`, `/sms`, `/reports`, `/reservations` are wrapped only in `AuthGuard` (any logged-in user). Direct URL navigation bypasses the sidebar permission filter. The backend still enforces permissions, but there's no frontend "Access Denied" page.

**Fix:** Wrap each route in a `PermissionGuard` component that checks `can(user, permission)` and renders a 403 page if denied.

---

### M-2 · Online Order App: Payment Success + "Order Not Found" Shown Together
**File:** `apps/online-order-web/src/pages/OrderStatusPage.tsx` lines 131–141

If the customer's browser storage is cleared after BML redirect (private browsing, session timeout), `token` is null. `loadOrder()` returns immediately, leaving `order = null`. The CONFIRMED success banner renders correctly, but simultaneously the page shows "Order not found. Please sign in." — deeply confusing at the critical payment moment.

**Fix:** When `paymentState === "CONFIRMED"` and `order === null`, show a simplified "Payment received — check your email for confirmation" message instead of the "not found" error.

---

### M-3 · Admin Dashboard: `DashboardPage` Divides Values by 100
**File:** `apps/admin-dashboard/src/pages/DashboardPage.tsx` line 20

```ts
function fmt(laari: number) { return 'MVR ' + (laari / 100).toFixed(2); }
```

This is the **only** page that divides by 100 before display. Verify whether `/api/reports/daily-summary` returns values in laari (smallest unit) or MVR. If it returns MVR, all dashboard stats are displayed as 1/100th of the actual value.

---

### M-4 · Admin Dashboard: `InvoicesPage` Action Handlers Have No Error Handling
**File:** `apps/admin-dashboard/src/pages/InvoicesPage.tsx` lines 30–39

`handleSent`, `handlePaid`, `handleVoid` have no `try/catch`. A network error or server 500 is silently swallowed — the UI refreshes as if the action succeeded and the user has no idea it failed.

**Fix:** Add `try/catch` to each handler with a toast error message.

---

### M-5 · Backend: Opening Hours Hardcoded in `ReservationService`
**File:** `backend/app/Domains/Reservations/Services/ReservationService.php` lines 154–155

```php
$start = Carbon::createFromTime(9, 0);
$end   = Carbon::createFromTime(22, 0);
```

9:00–22:00 is baked into the code. Should read from `ReservationSetting` or an `opening_hours` config so restaurant staff can change hours without a code deploy.

---

### M-6 · Online Order App: `loadOrder` Stale Closure in Polling Effect
**File:** `apps/online-order-web/src/pages/OrderStatusPage.tsx` lines 154, 199–204

Both the initial load effect and the 10-second polling interval suppress `exhaustive-deps` warnings with `eslint-disable` comments. The polling interval uses a stale closure of `loadOrder` — if `token` changes mid-session, the interval continues using the old captured value.

**Fix:** Use `useCallback` for `loadOrder` with proper deps, and add it to both effect dependency arrays.

---

### M-7 · Database: Missing Indexes on Frequently-Queried Tables

| Table | Missing Index | Impact |
|-------|--------------|--------|
| `refunds` | `order_id`, `user_id` | Full scan for refund lookups |
| `cash_movements` | `shift_id`, `user_id` | Full scan for shift summaries |
| `supplier_ratings` | `supplier_id`, `purchase_id` | Full scan for intelligence queries |
| `expenses` | `user_id`, `supplier_id` | Slow P&L and expense reports |
| `sms_campaign_recipients` | `customer_id` | Slow customer history |

---

### M-8 · Backend: N+1 Queries in `OrderCreationService`
**File:** `backend/app/Services/OrderCreationService.php` lines 107, 164

One DB query per line item to load items + modifiers (line 107), plus one more per modifier per item (line 164) even though modifiers were already eager-loaded. A 10-item order with 3 modifiers each = 10 + 30 = **40 queries**.

**Fix:** Pre-load all referenced items before the loop with `Item::with(['variants', 'modifiers'])->whereIn('id', $itemIds)->get()->keyBy('id')`. For modifiers on line 164: use `$itemModel->modifiers->firstWhere('id', $modifierId)` (in-memory, no query).

---

### M-9 · Database: `LowStockAlert` Model is Completely Empty
**File:** `backend/app/Models/LowStockAlert.php`

No `$fillable`, no `$casts`, no relationships. The model is a stub and the low-stock alerting feature is non-functional.

---

## 🟢 LOW — Technical Debt

| # | File | Issue |
|---|------|-------|
| L-1 | `backend/app/Models/Order.php` | `store_id` added to `orders` table but not in `$fillable` or as relationship on any of the 5 affected models |
| L-2 | `backend/app/Models/Order.php` | `driver_assigned_at` added by migration but missing from `$fillable` |
| L-3 | `backend/app/Models/PurchaseItem.php` | `received_at` missing from `$fillable`; `received_quantity` has precision conflict between two migrations (10,3 vs 10,4) |
| L-4 | `apps/admin-dashboard/src/utils/fmt.ts` | `n()`, `fmt()`, `mvr()` helpers exist but are unused — all pages inline `parseFloat(String(...))` manually |
| L-5 | `apps/online-order-web/src/constants/biz.ts` | Phone, WhatsApp, email hardcoded in bundle — requires redeploy to change |
| L-6 | `apps/admin-dashboard/src/pages/OrdersPage.tsx` | Double-fetch on every filter change (two separate `useEffect` blocks with same deps) |
| L-7 | `apps/pos-web/src/hooks/useOps.ts` | Date-range change triggers all 5 API calls (shift, inventory, suppliers, refunds, sales) instead of only the sales summary |
| L-8 | `backend/app/Jobs/SendSmsCampaignRecipientJob.php` | FQCNs hardcoded as strings (`'App\Models\SmsCampaign'`) instead of `SmsCampaign::class` |
| L-9 | `backend/app/Domains/Payments/Services/PaymentService.php` | `'MVR'` still hardcoded in two places (lines 49, 95) — should always use `config('bml.default_currency')` |
| L-10 | `backend/database/migrations` | `orders.customer_id` has two overlapping indexes (composite + single) from separate migrations |

---

## Section 8: Full Model Cast Additions Required

```php
// OrderItem
protected $casts = [
    'order_id'    => 'integer', 'item_id'   => 'integer', 'variant_id' => 'integer',
    'quantity'    => 'integer', 'unit_price' => 'decimal:2', 'total_price' => 'decimal:2',
];

// Shift
protected $casts = [
    'user_id' => 'integer', 'device_id' => 'integer',
    'opening_cash' => 'decimal:2', 'closing_cash' => 'decimal:2',
    'expected_cash' => 'decimal:2', 'variance' => 'decimal:2',
    'opened_at' => 'datetime', 'closed_at' => 'datetime',
];

// Variant
protected $casts = [
    'item_id' => 'integer', 'sort_order' => 'integer',
    'price' => 'decimal:2', 'is_active' => 'boolean',
];

// Modifier
protected $casts = [
    'sort_order' => 'integer', 'price' => 'decimal:2', 'is_active' => 'boolean',
];

// OrderItemModifier
protected $casts = [
    'order_item_id' => 'integer', 'modifier_id' => 'integer',
    'quantity' => 'integer', 'modifier_price' => 'decimal:2',
];

// LoyaltyAccount
protected $casts = [
    'customer_id' => 'integer',
    'points_balance' => 'integer', 'points_held' => 'integer', 'lifetime_points' => 'integer',
];

// LoyaltyLedger
protected $casts = [
    'customer_id' => 'integer', 'order_id' => 'integer',
    'points' => 'integer', 'balance_after' => 'integer',
    'occurred_at' => 'datetime', 'metadata' => 'array',
];

// LoyaltyHold
protected $casts = [
    'customer_id' => 'integer', 'order_id' => 'integer',
    'points_held' => 'integer', 'discount_laar' => 'integer',
    'expires_at' => 'datetime', 'consumed_at' => 'datetime', 'released_at' => 'datetime',
];

// Payment
protected $casts = [
    'order_id' => 'integer', 'amount' => 'decimal:2', 'amount_laar' => 'integer',
    'processed_at' => 'datetime', 'bml_status_raw' => 'array',
];

// Expense
protected $casts = [
    'expense_category_id' => 'integer', 'supplier_id' => 'integer',
    'user_id' => 'integer', 'approved_by' => 'integer', 'purchase_id' => 'integer',
    'amount' => 'decimal:2', 'tax_amount' => 'decimal:2',
    'amount_laar' => 'integer', 'tax_laar' => 'integer',
    'is_recurring' => 'boolean', 'expense_date' => 'date',
];

// Purchase
protected $casts = [
    'supplier_id' => 'integer', 'user_id' => 'integer', 'approved_by' => 'integer',
    'subtotal' => 'decimal:2', 'tax_amount' => 'decimal:2', 'total' => 'decimal:2',
    'ordered_at' => 'datetime', 'expected_at' => 'datetime', 'received_at' => 'datetime',
    'approved_at' => 'datetime',
];

// Refund
protected $casts = [
    'order_id' => 'integer', 'user_id' => 'integer', 'amount' => 'decimal:2',
    'processed_at' => 'datetime',
];

// Supplier
protected $casts = ['is_active' => 'boolean'];

// RestaurantTable
protected $casts = ['capacity' => 'integer', 'is_active' => 'boolean'];

// SupplierRating
protected $casts = [
    'supplier_id' => 'integer', 'purchase_id' => 'integer', 'user_id' => 'integer',
    'quality_score' => 'integer', 'delivery_score' => 'integer',
    'accuracy_score' => 'integer', 'price_score' => 'integer',
];

// Promotion
protected $casts = [
    // existing boolean/datetime casts +
    'discount_value' => 'integer', 'min_order_laar' => 'integer',
    'max_uses' => 'integer', 'max_uses_per_customer' => 'integer',
    'redemptions_count' => 'integer',
];

// Customer (add to existing $casts)
// 'loyalty_points' => 'integer', 'is_active' => 'boolean'
```

---

## Fix Priority Checklist

```
[ ] C-1  Add staff auth guard to CategoryController & ItemController
[ ] C-2  Add staff auth guard to StreamController SSE endpoints
[ ] C-3  Add ownership check to DeliveryOrderController::update()
[ ] C-4  New migration: add missing outgoing-webhook columns to webhook_logs
[ ] C-5  New migration: fix preferred_supplier_id column type to unsignedBigInteger
[ ] C-6  Remove dangling shift_id cast from Order model
[ ] H-1  pos-web: fix base_price → parseFloat in useCart.ts
[ ] H-2  pos-web: wrap all 8 OpsPanel.tsx .toFixed() calls
[ ] H-3  pos-web: fix modifier price string concat → NaN cart total
[ ] H-4  online-order-web: fix OrderStatusPage item.total_price.toFixed()
[ ] H-5  PaymentController: add payment_pending to initiatePartial()
[ ] H-6  OrderController::addPayments() — single transaction + lockForUpdate()
[ ] H-7  InventoryDeductionService — lockForUpdate() on inventory row
[ ] H-8  Add $casts to 15+ models (see Section 8)
[ ] H-9  Customer: add delivery fields to $fillable
[ ] H-10 StockMovement & PrintJob: add idempotency_key to $fillable
[ ] H-11 StoreRefundRequest: change 'declined' → 'rejected' everywhere
[ ] H-12 StorePurchaseRequest: change supplier_id to required
[ ] M-1  Admin dashboard: add PermissionGuard to 10 unguarded routes
[ ] M-2  OrderStatusPage: better UX when token missing after payment
[ ] M-3  Verify DashboardPage laari vs MVR unit
[ ] M-4  InvoicesPage: add try/catch to action handlers
[ ] M-5  ReservationService: read opening hours from ReservationSetting
[ ] M-6  OrderStatusPage: fix stale closure in polling useEffect
[ ] M-7  New migration: add missing indexes (refunds, cash_movements, etc.)
[ ] M-8  OrderCreationService: fix N+1 queries with bulk pre-load
[ ] M-9  Implement LowStockAlert model
[ ] L-*  Address low-priority items as time permits
```

---

*This report was generated by static code analysis. Reported issues should be verified before fixing. New issues may have been introduced since this audit was run.*

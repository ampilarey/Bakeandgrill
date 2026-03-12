# Bake & Grill — Inventory & Finance System Enhancement (Full Build)

You are enhancing the **inventory management** and **financial management** systems for a Maldivian cafe POS/ordering platform. The codebase is a Laravel 11 monorepo with 4 React frontends.

---

## Project Structure

```
backend/                          ← Laravel 11 API (PHP 8.3)
  app/
    Models/                       ← Eloquent models
    Http/Controllers/Api/         ← API controllers
    Services/                     ← Business logic services
    Domains/                      ← Domain-driven modules
      Payments/Services/          ← PaymentService, OrderTotalsCalculator
      Payments/Gateway/           ← BmlConnectService
      Inventory/Listeners/        ← DeductInventoryListener
      Shared/ValueObjects/Money   ← Immutable laari-based money
    Http/Requests/                ← Form request validation
  database/migrations/            ← All migrations
  routes/api.php                  ← API routes

apps/admin-dashboard/             ← React admin panel (Vite)
  src/pages/                      ← AnalyticsPage, ReportsPage, etc.
```

**Currency:** MVR (Maldivian Rufiyaa). 1 MVR = 100 laari. All financial amounts stored as integer laari internally via `Money` value object (`app/Domains/Shared/ValueObjects/Money.php`). Display columns use `decimal(10,2)`.

**Auth:** Laravel Sanctum tokens. Staff tokens have `staff` ability. Customer tokens have `customer` ability. Check `tokenCan('staff')` for admin endpoints.

**Existing patterns to follow:**
- Controllers return `response()->json([...])` with consistent key naming
- Form requests in `app/Http/Requests/` for validation
- `AuditLogService::log()` for important state changes
- Migrations use `$table->foreignId('xxx')->constrained()->cascadeOnDelete()` pattern
- Models use `declare(strict_types=1)` and typed relationships
- Routes registered in `routes/api.php` with `auth:sanctum` middleware

---

## CURRENT STATE AUDIT

### What ALREADY EXISTS (do NOT rebuild these):

**Inventory:**
- `inventory_items` table (name, sku, unit, current_stock, reorder_point, unit_cost, last_purchase_price, expiry_date, is_active)
- `stock_movements` table (type: purchase/sale/adjustment/waste, quantity, balance_after, unit_cost, idempotency_key)
- `stock_reservations` table (3-minute cart hold per session)
- `recipes` + `recipe_items` tables (menu item → ingredients mapping with yield_quantity)
- `suppliers` table (name, contact_name, phone, email, address, payment_terms, is_active, soft deletes)
- `purchases` + `purchase_items` + `purchase_receipts` tables
- `low_stock_alerts` table (SMS to managers)
- `waste_logs` table (reason: spoilage/over_prep/drop/expired/quality/other)
- `items` table has: stock_quantity, low_stock_threshold, track_stock, availability_type, allow_pre_order, cost
- `InventoryController` — CRUD, adjust, stockCount, lowStock, priceHistory, cheapestSupplier
- `SupplierController` — full CRUD with soft delete
- `PurchaseController` — CRUD, receipt upload, CSV import
- `WasteLogController` — index with date filter + total_cost, store
- `InventoryDeductionService` — recipe-based auto-deduction on OrderPaid (idempotent, atomic)
- `StockManagementService` — checkStock, deductStock, triggerLowStockAlert, getAvailabilityStatus
- `StockReservationService` — reserveStock, getAvailableStock, releaseExpired

**Finance:**
- `payments` table (method, gateway, currency, amount, amount_laar, status, BML fields)
- `payment_attempts` table (BML gateway attempts)
- `refunds` table (order_id, amount, status, reason)
- `cash_movements` table (shift_id, type: in/out, amount, reason)
- `shifts` table (opening_cash, closing_cash, expected_cash, variance)
- `orders` table has: subtotal, tax_amount, discount_amount, total, *_laar columns, tax_inclusive, tax_rate_bp, paid_at
- `ReportsController` — salesSummary, salesBreakdown (by item/category/employee), xReport, zReport, inventoryValuation + CSV exports
- `AnalyticsController` — peakHours, retention, profitability (item-level margin%), forecast (7-day by DOW), customerLtv
- `PaymentService` — BML gateway, partial payments, webhook handling
- `OrderTotalsCalculator` — deterministic: subtotal → promos → loyalty → manual discount → tax → total
- `Money` value object — immutable laari math, tax extraction/addition

**Admin Dashboard pages that exist:**
- AnalyticsPage.tsx (peak hours, forecast, retention, LTV, profitability)
- ReportsPage.tsx (sales summary with date range)
- No inventory, purchase, supplier, or finance pages exist in the dashboard

---

## PHASE 1: Fix Existing Bugs

### Bug 1: Waste log doesn't deduct stock

**File:** `app/Http/Controllers/Api/WasteLogController.php`, `store()` method

**Problem:** When waste is logged, `cost_estimate` is recorded but `inventory_items.current_stock` is NOT decremented. Stock count drifts from reality over time.

**Fix:** After creating the WasteLog, if `inventory_item_id` is provided, deduct from `current_stock` and create a `StockMovement`:

```php
// In WasteLogController::store(), after WasteLog::create():
if ($wasteLog->inventory_item_id) {
    $invItem = \App\Models\InventoryItem::find($wasteLog->inventory_item_id);
    if ($invItem) {
        DB::table('inventory_items')
            ->where('id', $invItem->id)
            ->decrement('current_stock', $validated['quantity']);

        $invItem->refresh();

        StockMovement::create([
            'inventory_item_id' => $invItem->id,
            'user_id'           => $validated['user_id'],
            'type'              => 'waste',
            'quantity'          => -$validated['quantity'],
            'balance_after'     => $invItem->current_stock,
            'unit_cost'         => $invItem->unit_cost ?? 0,
            'reference_type'    => 'waste_log',
            'reference_id'      => $wasteLog->id,
            'notes'             => "Waste: {$validated['reason']}",
        ]);
    }
}
```

### Bug 2: Purchase `unit_cost` update logic is wrong

**File:** `app/Http/Controllers/Api/PurchaseController.php`, `createFromPayload()`, lines 208-214

**Current:**
```php
if (!$inventoryItem->unit_cost) {
    $inventoryItem->unit_cost = $itemPayload['unit_cost'];
}
```

**Problem:** `unit_cost` only updates if it was previously null. If flour was $5/kg last month and is now $6/kg, `unit_cost` stays at $5. Only `last_purchase_price` updates. Inventory valuation uses `unit_cost`, so it's always stale.

**Fix:** Update `unit_cost` to use weighted average cost (WAC):
```php
// Replace the if (!$inventoryItem->unit_cost) block with:
$oldStock = max(0, ($inventoryItem->current_stock ?? 0) - $itemPayload['quantity']);
$oldCost = $inventoryItem->unit_cost ?? 0;
$newCost = $itemPayload['unit_cost'];
$newStock = $inventoryItem->current_stock;

if ($newStock > 0) {
    $inventoryItem->unit_cost = round(
        (($oldStock * $oldCost) + ($itemPayload['quantity'] * $newCost)) / $newStock,
        4
    );
}
```

### Bug 3: `cheapestSupplier` only returns the single cheapest, not useful for comparison

Not a bug per se, but we'll enhance this in Phase 3.

---

## PHASE 2: Invoicing System

### New Migration: `invoices`

```php
Schema::create('invoices', function (Blueprint $table) {
    $table->id();
    $table->string('invoice_number')->unique();          // INV-20260312-0001
    $table->enum('type', ['sale', 'purchase', 'credit_note'])->default('sale');
    $table->enum('status', ['draft', 'sent', 'paid', 'overdue', 'cancelled', 'void'])->default('draft');
    $table->foreignId('order_id')->nullable()->constrained()->nullOnDelete();
    $table->foreignId('purchase_id')->nullable()->constrained()->nullOnDelete();
    $table->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();
    $table->foreignId('supplier_id')->nullable()->constrained()->nullOnDelete();
    $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
    $table->string('recipient_name')->nullable();
    $table->string('recipient_phone')->nullable();
    $table->string('recipient_email')->nullable();
    $table->text('recipient_address')->nullable();
    $table->integer('subtotal_laar')->default(0);
    $table->integer('tax_laar')->default(0);
    $table->integer('discount_laar')->default(0);
    $table->integer('total_laar')->default(0);
    $table->decimal('subtotal', 10, 2)->default(0);
    $table->decimal('tax_amount', 10, 2)->default(0);
    $table->decimal('discount_amount', 10, 2)->default(0);
    $table->decimal('total', 10, 2)->default(0);
    $table->unsignedSmallInteger('tax_rate_bp')->default(0);  // basis points
    $table->date('issue_date');
    $table->date('due_date')->nullable();
    $table->timestamp('paid_at')->nullable();
    $table->string('payment_method')->nullable();
    $table->string('payment_reference')->nullable();
    $table->text('notes')->nullable();
    $table->text('terms')->nullable();
    $table->string('pdf_path')->nullable();
    $table->foreignId('parent_invoice_id')->nullable()->constrained('invoices')->nullOnDelete(); // for credit notes
    $table->timestamps();
    $table->softDeletes();

    $table->index(['type', 'status']);
    $table->index('issue_date');
    $table->index('due_date');
});
```

### New Migration: `invoice_items`

```php
Schema::create('invoice_items', function (Blueprint $table) {
    $table->id();
    $table->foreignId('invoice_id')->constrained()->cascadeOnDelete();
    $table->foreignId('item_id')->nullable()->constrained()->nullOnDelete();
    $table->foreignId('inventory_item_id')->nullable()->constrained()->nullOnDelete();
    $table->string('description');
    $table->decimal('quantity', 10, 3);
    $table->string('unit')->nullable();
    $table->integer('unit_price_laar')->default(0);
    $table->integer('total_laar')->default(0);
    $table->decimal('unit_price', 10, 2)->default(0);
    $table->decimal('total', 10, 2)->default(0);
    $table->unsignedSmallInteger('tax_rate_bp')->default(0);
    $table->timestamps();
});
```

### New Model: `Invoice`

**File:** `app/Models/Invoice.php`

Relations: belongsTo(Order, Purchase, Customer, Supplier, User:created_by, Invoice:parent_invoice), hasMany(InvoiceItem). Use SoftDeletes.

Cast: issue_date → date, due_date → date, paid_at → datetime.

### New Model: `InvoiceItem`

**File:** `app/Models/InvoiceItem.php`

Relations: belongsTo(Invoice, Item, InventoryItem).

### New Controller: `InvoiceController`

**File:** `app/Http/Controllers/Api/InvoiceController.php`

Endpoints:

```
GET    /api/invoices                      → index (filter: type, status, customer_id, supplier_id, from, to)
POST   /api/invoices                      → store (create draft invoice)
GET    /api/invoices/{id}                 → show (with items, customer/supplier)
PATCH  /api/invoices/{id}                 → update (only draft status)
POST   /api/invoices/{id}/send            → markSent (set status=sent)
POST   /api/invoices/{id}/mark-paid       → markPaid (set status=paid, paid_at, payment_method)
POST   /api/invoices/{id}/void            → void (set status=void)
POST   /api/invoices/{id}/credit-note     → createCreditNote (creates type=credit_note linked to parent)
GET    /api/invoices/{id}/pdf             → generatePdf (return PDF download)
POST   /api/orders/{orderId}/invoice      → createFromOrder (auto-populate from order + order_items)
POST   /api/purchases/{purchaseId}/invoice → createFromPurchase (auto-populate from purchase)
```

**Invoice number generation:** `INV-YYYYMMDD-XXXX` where XXXX is zero-padded daily sequence. Use the same pattern as `PurchaseController::generatePurchaseNumber()`.

**Auto-create from order:** When called, pull order items, customer info, tax, totals. Set type=sale.

**Auto-create from purchase:** Pull purchase items, supplier info. Set type=purchase.

**PDF generation:** Use a Blade template rendered to HTML, then convert to PDF. Store at `storage/app/invoices/{invoice_number}.pdf`. Use Laravel's built-in `Browsershot` or `dompdf`. If neither is installed, generate a simple HTML invoice served as a download with `Content-Type: text/html` and `Content-Disposition: attachment`.

### Routes to add in `routes/api.php`:

```php
// Invoices (staff)
Route::middleware('auth:sanctum')->prefix('invoices')->group(function () {
    Route::get('/',                   [InvoiceController::class, 'index']);
    Route::post('/',                  [InvoiceController::class, 'store']);
    Route::get('/{id}',              [InvoiceController::class, 'show']);
    Route::patch('/{id}',            [InvoiceController::class, 'update']);
    Route::post('/{id}/send',        [InvoiceController::class, 'markSent']);
    Route::post('/{id}/mark-paid',   [InvoiceController::class, 'markPaid']);
    Route::post('/{id}/void',        [InvoiceController::class, 'voidInvoice']);
    Route::post('/{id}/credit-note', [InvoiceController::class, 'createCreditNote']);
    Route::get('/{id}/pdf',          [InvoiceController::class, 'generatePdf']);
});
Route::middleware('auth:sanctum')->group(function () {
    Route::post('/orders/{orderId}/invoice',       [InvoiceController::class, 'createFromOrder']);
    Route::post('/purchases/{purchaseId}/invoice',  [InvoiceController::class, 'createFromPurchase']);
});
```

---

## PHASE 3: Expense Tracking

### New Migration: `expense_categories`

```php
Schema::create('expense_categories', function (Blueprint $table) {
    $table->id();
    $table->string('name');                    // Rent, Utilities, Salaries, Marketing, Maintenance, Supplies, Other
    $table->string('slug')->unique();
    $table->string('icon')->nullable();        // For admin UI
    $table->boolean('is_active')->default(true);
    $table->timestamps();
});

// Seed default categories:
// rent, utilities, salaries, marketing, maintenance, supplies, packaging, cleaning, transport, licenses, insurance, other
```

### New Migration: `expenses`

```php
Schema::create('expenses', function (Blueprint $table) {
    $table->id();
    $table->string('expense_number')->unique();   // EXP-20260312-0001
    $table->foreignId('expense_category_id')->constrained()->restrictOnDelete();
    $table->foreignId('supplier_id')->nullable()->constrained()->nullOnDelete();
    $table->foreignId('user_id')->constrained();  // who logged it
    $table->foreignId('purchase_id')->nullable()->constrained()->nullOnDelete(); // link to purchase if applicable
    $table->string('description');
    $table->integer('amount_laar');
    $table->decimal('amount', 10, 2);
    $table->integer('tax_laar')->default(0);
    $table->decimal('tax_amount', 10, 2)->default(0);
    $table->string('payment_method')->nullable();  // cash, bank_transfer, card
    $table->string('reference_number')->nullable(); // receipt/check number
    $table->date('expense_date');
    $table->string('receipt_path')->nullable();     // uploaded receipt photo
    $table->boolean('is_recurring')->default(false);
    $table->string('recurrence_interval')->nullable(); // weekly, monthly, quarterly, yearly
    $table->date('next_recurrence_date')->nullable();
    $table->enum('status', ['pending', 'approved', 'rejected'])->default('approved');
    $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
    $table->text('notes')->nullable();
    $table->timestamps();
    $table->softDeletes();

    $table->index('expense_date');
    $table->index(['expense_category_id', 'expense_date']);
});
```

### New Models:

**`ExpenseCategory`** — fillable: name, slug, icon, is_active. HasMany expenses.

**`Expense`** — fillable: all columns. BelongsTo: ExpenseCategory, Supplier, User, Purchase. SoftDeletes. Cast expense_date as date, next_recurrence_date as date.

### New Controller: `ExpenseController`

**File:** `app/Http/Controllers/Api/ExpenseController.php`

Endpoints:

```
GET    /api/expenses                    → index (filter: category_id, supplier_id, from, to, status, is_recurring)
POST   /api/expenses                    → store
GET    /api/expenses/{id}               → show
PATCH  /api/expenses/{id}               → update
DELETE /api/expenses/{id}               → destroy (soft delete)
POST   /api/expenses/{id}/approve       → approve (set status=approved, approved_by)
POST   /api/expenses/{id}/upload-receipt → uploadReceipt (store file, same pattern as PurchaseController::uploadReceipt)
GET    /api/expenses/categories          → listCategories
POST   /api/expenses/categories          → storeCategory
PATCH  /api/expenses/categories/{id}     → updateCategory
GET    /api/expenses/summary             → summary (total by category for date range, with comparison to previous period)
```

**Expense number generation:** `EXP-YYYYMMDD-XXXX` — same daily sequence pattern.

### New: `RecurringExpenseCommand`

**File:** `app/Console/Commands/ProcessRecurringExpenses.php`

Artisan command: `php artisan expenses:process-recurring`

Logic: Find all expenses where `is_recurring = true` AND `next_recurrence_date <= today`. For each:
1. Create a new expense copying all fields but with `expense_date = next_recurrence_date`
2. Update `next_recurrence_date` based on `recurrence_interval`
3. Log via AuditLogService

Schedule in `app/Console/Kernel.php`: `->daily()` at midnight.

### Routes:

```php
Route::middleware('auth:sanctum')->prefix('expenses')->group(function () {
    Route::get('/',                       [ExpenseController::class, 'index']);
    Route::post('/',                      [ExpenseController::class, 'store']);
    Route::get('/categories',             [ExpenseController::class, 'listCategories']);
    Route::post('/categories',            [ExpenseController::class, 'storeCategory']);
    Route::patch('/categories/{id}',      [ExpenseController::class, 'updateCategory']);
    Route::get('/summary',                [ExpenseController::class, 'summary']);
    Route::get('/{id}',                  [ExpenseController::class, 'show']);
    Route::patch('/{id}',                [ExpenseController::class, 'update']);
    Route::delete('/{id}',              [ExpenseController::class, 'destroy']);
    Route::post('/{id}/approve',         [ExpenseController::class, 'approve']);
    Route::post('/{id}/upload-receipt',  [ExpenseController::class, 'uploadReceipt']);
});
```

---

## PHASE 4: Supplier Intelligence

### New Migration: `supplier_ratings`

```php
Schema::create('supplier_ratings', function (Blueprint $table) {
    $table->id();
    $table->foreignId('supplier_id')->constrained()->cascadeOnDelete();
    $table->foreignId('purchase_id')->nullable()->constrained()->nullOnDelete();
    $table->foreignId('user_id')->constrained();
    $table->unsignedTinyInteger('delivery_rating')->nullable();  // 1-5
    $table->unsignedTinyInteger('quality_rating')->nullable();   // 1-5
    $table->unsignedTinyInteger('price_rating')->nullable();     // 1-5
    $table->text('notes')->nullable();
    $table->timestamps();
});
```

### New Migration: Add `delivery_days` to `suppliers`

```php
Schema::table('suppliers', function (Blueprint $table) {
    $table->unsignedSmallInteger('typical_delivery_days')->nullable()->after('payment_terms');
    $table->string('category')->nullable()->after('typical_delivery_days'); // local, import, wholesale
    $table->string('tax_id')->nullable()->after('category');               // business registration
});
```

### New Model: `SupplierRating`

BelongsTo: Supplier, Purchase, User. Fillable: all columns.

### Enhance `SupplierController` — add these methods:

```
GET  /api/suppliers/{id}/price-comparison    → priceComparison
GET  /api/suppliers/{id}/performance         → performance
POST /api/suppliers/{id}/ratings             → addRating
GET  /api/suppliers/spending-summary         → spendingSummary
```

**`priceComparison($supplierId)`:**
For every inventory item this supplier has ever sold (via purchase_items), return:
```json
{
  "items": [
    {
      "inventory_item_id": 5,
      "name": "All-Purpose Flour",
      "this_supplier": {
        "last_price": 12.50,
        "avg_price": 12.00,
        "min_price": 11.00,
        "purchase_count": 8
      },
      "market": {
        "cheapest_price": 10.50,
        "cheapest_supplier": "Maldives Food Supply",
        "avg_across_suppliers": 11.75,
        "supplier_count": 3
      },
      "price_trend": "rising"  // "rising", "falling", "stable" — based on last 5 purchases
    }
  ]
}
```

**`performance($supplierId)`:**
```json
{
  "total_purchases": 45,
  "total_spent": 125000.00,
  "first_purchase": "2026-01-15",
  "last_purchase": "2026-03-10",
  "avg_delivery_rating": 4.2,
  "avg_quality_rating": 3.8,
  "avg_price_rating": 4.0,
  "rating_count": 12,
  "top_items": [
    { "name": "Flour", "total_quantity": 500, "total_spent": 6250.00 }
  ]
}
```

**`spendingSummary(?from, ?to)`:**
```json
{
  "suppliers": [
    {
      "id": 1,
      "name": "Maldives Food Supply",
      "total_spent": 50000.00,
      "purchase_count": 20,
      "percentage_of_total": 40.0,
      "avg_order_value": 2500.00
    }
  ],
  "total": 125000.00
}
```

### Enhance `InventoryController` — add:

```
GET /api/inventory/{id}/supplier-comparison → supplierComparison
```

**`supplierComparison($inventoryItemId)`:**
All suppliers who have ever sold this item, ranked by best value:
```json
{
  "item": { "id": 5, "name": "All-Purpose Flour" },
  "suppliers": [
    {
      "supplier_id": 1,
      "supplier_name": "Maldives Food Supply",
      "last_price": 10.50,
      "avg_price": 10.75,
      "min_price": 10.00,
      "max_price": 11.50,
      "purchase_count": 8,
      "last_purchase_date": "2026-03-01",
      "avg_delivery_rating": 4.2,
      "recommended": true  // cheapest average + rating > 3.5
    }
  ]
}
```

---

## PHASE 5: Purchase Order Workflow Enhancement

### Modify `purchases` table — add status values:

```php
Schema::table('purchases', function (Blueprint $table) {
    // Change status to support full workflow
    // Old: 'draft', 'received'
    // New: 'draft', 'submitted', 'approved', 'partially_received', 'received', 'cancelled'
    $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
    $table->timestamp('approved_at')->nullable();
    $table->timestamp('submitted_at')->nullable();
    $table->text('rejection_reason')->nullable();
    $table->integer('expected_delivery_days')->nullable();
    $table->date('expected_delivery_date')->nullable();
    $table->date('actual_delivery_date')->nullable();
});
```

### Modify `purchase_items` — add receiving support:

```php
Schema::table('purchase_items', function (Blueprint $table) {
    $table->decimal('quantity_received', 10, 3)->default(0);
    $table->decimal('quantity_rejected', 10, 3)->default(0);
    $table->string('rejection_reason')->nullable();
});
```

### Enhance `PurchaseController` — add methods:

```
POST  /api/purchases/{id}/submit          → submit (draft → submitted)
POST  /api/purchases/{id}/approve         → approve (submitted → approved, requires manager)
POST  /api/purchases/{id}/reject          → reject (submitted → draft, with reason)
POST  /api/purchases/{id}/receive         → receive (approved → partially_received or received)
POST  /api/purchases/{id}/cancel          → cancel (any non-received → cancelled)
GET   /api/purchases/pending-delivery     → pendingDelivery (approved but not yet received)
GET   /api/purchases/auto-suggest         → autoSuggest (generate PO based on reorder points)
```

**`receive()`** — accepts partial receiving:
```json
{
  "items": [
    { "purchase_item_id": 1, "quantity_received": 20, "quantity_rejected": 5, "rejection_reason": "damaged" },
    { "purchase_item_id": 2, "quantity_received": 10 }
  ]
}
```
Logic:
- Update purchase_items.quantity_received, quantity_rejected
- Update inventory_items.current_stock ONLY by quantity_received
- Create StockMovement for received items
- If ALL items fully received → status = "received"
- If SOME items partially received → status = "partially_received"

**`autoSuggest()`** — generates a suggested purchase order:
```
1. Find all inventory_items where current_stock <= reorder_point
2. For each, find the cheapest supplier (or most recent supplier if no cheapest)
3. Calculate suggested quantity: (reorder_point * 2) - current_stock  (order enough to get to 2x reorder point)
4. Group by supplier
5. Return suggested POs ready for staff to review and submit
```

---

## PHASE 6: Financial Reports

### New Controller: `FinancialReportController`

**File:** `app/Http/Controllers/Api/FinancialReportController.php`

### Endpoint 1: Profit & Loss Statement

```
GET /api/reports/profit-loss?from=2026-03-01&to=2026-03-31
```

Response:
```json
{
  "from": "2026-03-01",
  "to": "2026-03-31",
  "revenue": {
    "gross_sales": 150000.00,
    "refunds": -5000.00,
    "discounts": -8000.00,
    "net_revenue": 137000.00
  },
  "cost_of_goods_sold": {
    "ingredient_cost": 45000.00,
    "waste_cost": 2000.00,
    "total_cogs": 47000.00
  },
  "gross_profit": 90000.00,
  "gross_margin_pct": 65.7,
  "operating_expenses": {
    "rent": 15000.00,
    "salaries": 30000.00,
    "utilities": 5000.00,
    "marketing": 2000.00,
    "maintenance": 1000.00,
    "other": 3000.00,
    "total_opex": 56000.00
  },
  "net_profit": 34000.00,
  "net_margin_pct": 24.8
}
```

Logic:
- **Revenue:** Sum of completed orders' `total` minus refunds minus discount_amount
- **COGS — ingredient_cost:** Sum of `stock_movements` where type='sale' during period: `SUM(ABS(quantity) * unit_cost)`
- **COGS — waste_cost:** Sum of `waste_logs.cost_estimate` during period
- **Operating Expenses:** Sum of `expenses` by category during period
- **Gross Profit:** net_revenue - total_cogs
- **Net Profit:** gross_profit - total_opex

### Endpoint 2: Cash Flow

```
GET /api/reports/cash-flow?from=2026-03-01&to=2026-03-31&group_by=day
```

Response:
```json
{
  "from": "2026-03-01",
  "to": "2026-03-31",
  "summary": {
    "cash_in": 137000.00,
    "cash_out": 103000.00,
    "net_cash_flow": 34000.00
  },
  "cash_in_breakdown": {
    "cash_payments": 50000.00,
    "card_payments": 40000.00,
    "bml_payments": 45000.00,
    "other": 2000.00
  },
  "cash_out_breakdown": {
    "purchases": 47000.00,
    "expenses": 56000.00,
    "refunds": 5000.00
  },
  "daily": [
    { "date": "2026-03-01", "cash_in": 4500.00, "cash_out": 3200.00, "net": 1300.00 },
    ...
  ]
}
```

Logic:
- **Cash in:** Sum of payments (status: confirmed/paid/completed) by method, grouped by date
- **Cash out:** Sum of purchases (status: received) + expenses (status: approved) + refunds, grouped by date

### Endpoint 3: Tax Summary

```
GET /api/reports/tax-summary?from=2026-03-01&to=2026-03-31
```

Response:
```json
{
  "from": "2026-03-01",
  "to": "2026-03-31",
  "output_tax": {
    "total_taxable_sales": 130000.00,
    "total_tax_collected": 7800.00,
    "by_rate": [
      { "rate_bp": 600, "rate_display": "6%", "taxable_amount": 130000.00, "tax": 7800.00 }
    ]
  },
  "input_tax": {
    "total_purchases_with_tax": 45000.00,
    "total_input_tax": 2700.00
  },
  "net_tax_payable": 5100.00
}
```

### Endpoint 4: Daily Summary

```
GET /api/reports/daily-summary?date=2026-03-12
```

Response:
```json
{
  "date": "2026-03-12",
  "sales": {
    "total": 4500.00,
    "orders_count": 32,
    "avg_order_value": 140.63,
    "by_channel": { "pos": 2500.00, "online": 1500.00, "delivery": 500.00 }
  },
  "refunds": { "total": 150.00, "count": 1 },
  "purchases": { "total": 1200.00, "count": 2 },
  "expenses": { "total": 800.00, "count": 3 },
  "waste": { "total_cost": 50.00, "count": 2 },
  "net_position": 2300.00,
  "payment_methods": {
    "cash": 1800.00,
    "card": 1200.00,
    "bml_connect": 1500.00
  }
}
```

### Endpoint 5: Accounts Payable (what you owe suppliers)

```
GET /api/reports/accounts-payable
```

Returns all invoices where type='purchase' AND status IN ('sent', 'overdue'), grouped by supplier, with aging buckets:
```json
{
  "suppliers": [
    {
      "supplier_id": 1,
      "supplier_name": "Maldives Food Supply",
      "total_owed": 15000.00,
      "aging": {
        "current": 5000.00,
        "days_30": 5000.00,
        "days_60": 3000.00,
        "days_90_plus": 2000.00
      },
      "invoices": [...]
    }
  ],
  "total_payable": 45000.00
}
```

### All CSV exports

Every financial report endpoint should have a corresponding `/csv` variant, following the same pattern as `ReportsController`.

### Routes:

```php
Route::middleware('auth:sanctum')->prefix('reports')->group(function () {
    // ... existing report routes ...

    // Financial reports
    Route::get('/profit-loss',         [FinancialReportController::class, 'profitLoss']);
    Route::get('/profit-loss/csv',     [FinancialReportController::class, 'profitLossCsv']);
    Route::get('/cash-flow',           [FinancialReportController::class, 'cashFlow']);
    Route::get('/cash-flow/csv',       [FinancialReportController::class, 'cashFlowCsv']);
    Route::get('/tax-summary',         [FinancialReportController::class, 'taxSummary']);
    Route::get('/tax-summary/csv',     [FinancialReportController::class, 'taxSummaryCsv']);
    Route::get('/daily-summary',       [FinancialReportController::class, 'dailySummary']);
    Route::get('/daily-summary/csv',   [FinancialReportController::class, 'dailySummaryCsv']);
    Route::get('/accounts-payable',    [FinancialReportController::class, 'accountsPayable']);
    Route::get('/accounts-payable/csv',[FinancialReportController::class, 'accountsPayableCsv']);
});
```

---

## PHASE 7: Advanced Forecasting & Analytics

### Enhance `AnalyticsController`

**Replace `forecast()` with smarter logic:**

Current: simple day-of-week average.

New: **Weighted moving average** — recent weeks count more.

```php
public function forecast(Request $request): JsonResponse
{
    $lookbackDays = (int) ($request->query('lookback', 90));

    // Get daily order data
    $dailyData = DB::table('orders')
        ->where('created_at', '>=', now()->subDays($lookbackDays))
        ->whereNotIn('status', ['cancelled'])
        ->selectRaw('DATE(created_at) as date, DAYOFWEEK(created_at) as dow, COUNT(*) as order_count, SUM(total) as revenue')
        ->groupByRaw('DATE(created_at), DAYOFWEEK(created_at)')
        ->orderBy('date')
        ->get();

    // Calculate weighted average by DOW (more recent = higher weight)
    $forecast = [];
    for ($i = 0; $i < 7; $i++) {
        $date = Carbon::now()->addDays($i);
        $dow = $date->dayOfWeek + 1;

        $matching = $dailyData->where('dow', $dow)->values();
        if ($matching->isEmpty()) {
            $forecast[] = ['date' => $date->toDateString(), 'day' => $date->format('D'), 'predicted_orders' => 0, 'predicted_revenue' => 0, 'confidence' => 'low'];
            continue;
        }

        // Exponential weights: most recent occurrence gets weight N, second most gets N-1, etc.
        $totalWeight = 0;
        $weightedOrders = 0;
        $weightedRevenue = 0;
        $count = $matching->count();

        foreach ($matching as $idx => $row) {
            $weight = $idx + 1; // oldest=1, newest=N
            $weightedOrders += $row->order_count * $weight;
            $weightedRevenue += $row->revenue * $weight;
            $totalWeight += $weight;
        }

        $forecast[] = [
            'date' => $date->toDateString(),
            'day' => $date->format('D'),
            'predicted_orders' => (int) round($weightedOrders / $totalWeight),
            'predicted_revenue' => round($weightedRevenue / $totalWeight, 2),
            'confidence' => $count >= 8 ? 'high' : ($count >= 4 ? 'medium' : 'low'),
            'data_points' => $count,
        ];
    }

    return response()->json(['forecast' => $forecast, 'lookback_days' => $lookbackDays]);
}
```

### New endpoint: Item demand forecast

```
GET /api/admin/analytics/item-forecast/{itemId}?days=7
```

Returns predicted daily demand for a specific menu item, plus suggested prep quantity:
```json
{
  "item": { "id": 5, "name": "Chicken Burger" },
  "forecast": [
    {
      "date": "2026-03-13",
      "day": "Fri",
      "predicted_quantity": 25,
      "confidence": "high"
    }
  ],
  "weekly_total": 150,
  "ingredient_needs": [
    { "inventory_item": "Chicken Patties", "quantity_needed": 150, "current_stock": 200, "sufficient": true },
    { "inventory_item": "Burger Buns", "quantity_needed": 150, "current_stock": 80, "sufficient": false, "shortfall": 70 }
  ]
}
```

Logic:
- Get `order_items` for this item_id grouped by date over last 90 days
- Apply same weighted moving average by DOW
- Cross-reference with recipe_items to calculate ingredient needs
- Compare with inventory_items.current_stock

### New endpoint: Seasonal trends

```
GET /api/admin/analytics/trends?months=6
```

Returns month-over-month comparison:
```json
{
  "months": [
    {
      "month": "2026-03",
      "revenue": 137000.00,
      "orders": 980,
      "avg_order_value": 139.80,
      "new_customers": 45,
      "returning_customers": 120,
      "revenue_change_pct": 12.5,
      "orders_change_pct": 8.3
    }
  ]
}
```

### New endpoint: Ingredient cost trends

```
GET /api/admin/analytics/ingredient-costs?months=6
```

Returns cost trends for top ingredients:
```json
{
  "ingredients": [
    {
      "id": 5,
      "name": "All-Purpose Flour",
      "monthly_costs": [
        { "month": "2026-01", "avg_unit_cost": 10.50, "total_purchased": 500, "total_cost": 5250.00 },
        { "month": "2026-02", "avg_unit_cost": 11.00, "total_purchased": 450, "total_cost": 4950.00 },
        { "month": "2026-03", "avg_unit_cost": 12.00, "total_purchased": 480, "total_cost": 5760.00 }
      ],
      "trend": "rising",
      "change_pct": 14.3
    }
  ]
}
```

---

## PHASE 8: Inventory Enhancements

### New Migration: `inventory_categories`

```php
Schema::create('inventory_categories', function (Blueprint $table) {
    $table->id();
    $table->string('name');        // Dairy, Dry Goods, Produce, Meat, Packaging, Cleaning, Beverages
    $table->string('slug')->unique();
    $table->unsignedInteger('sort_order')->default(0);
    $table->timestamps();
});

Schema::table('inventory_items', function (Blueprint $table) {
    $table->foreignId('inventory_category_id')->nullable()->after('name')->constrained()->nullOnDelete();
});
```

### New Migration: `unit_conversions`

```php
Schema::create('unit_conversions', function (Blueprint $table) {
    $table->id();
    $table->string('from_unit');        // bag
    $table->string('to_unit');          // kg
    $table->decimal('factor', 12, 6);  // 25.0 (1 bag = 25 kg)
    $table->foreignId('inventory_item_id')->nullable()->constrained()->cascadeOnDelete(); // item-specific conversion
    $table->timestamps();

    $table->unique(['from_unit', 'to_unit', 'inventory_item_id']);
});
```

### Expiry Alert Command

**File:** `app/Console/Commands/CheckExpiringItems.php`

Artisan command: `php artisan inventory:check-expiry`

Logic:
1. Find inventory_items where `expiry_date IS NOT NULL` AND `expiry_date <= today + 3 days` AND `current_stock > 0`
2. Group: already expired vs expiring within 3 days
3. Send SMS to managers (same pattern as `StockManagementService::triggerLowStockAlert`)
4. Check for duplicate alert within 24h before sending

Schedule: Run daily at 7:00 AM.

### Auto-Reorder Command

**File:** `app/Console/Commands/AutoReorderCheck.php`

Artisan command: `php artisan inventory:auto-reorder`

Logic:
1. Find inventory_items where `current_stock <= reorder_point` AND `is_active = true`
2. For each, find cheapest supplier (reuse `cheapestSupplier` logic)
3. Calculate order quantity: `(reorder_point * 2) - current_stock`
4. Group by supplier
5. Create Purchase records with status='draft' (staff must approve)
6. Send SMS notification to managers: "Auto-reorder: X draft POs created for review"

Schedule: Run daily at 6:00 AM.

### Enhance `InventoryController` — add:

```
GET /api/inventory/expiring          → expiringItems (within 7 days)
GET /api/inventory/categories        → listCategories
POST /api/inventory/categories       → storeCategory
PATCH /api/inventory/categories/{id} → updateCategory
GET /api/inventory/dashboard         → dashboard (summary stats)
```

**`dashboard()`:**
```json
{
  "total_items": 150,
  "total_value": 125000.00,
  "low_stock_count": 8,
  "expiring_count": 3,
  "out_of_stock_count": 2,
  "recent_movements": [...last 10 movements...],
  "top_movers": [...5 items with most movement this week...],
  "pending_purchase_orders": 2
}
```

---

## PHASE 9: Admin Dashboard Pages

### New pages to create in `apps/admin-dashboard/src/pages/`:

**1. `InventoryPage.tsx`** — Inventory management
- Tab 1: **Items** — list all inventory items with search, filter by category, stock status badges (in stock/low/out/expired)
- Tab 2: **Categories** — manage inventory categories
- Tab 3: **Stock Count** — bulk stock count form
- Dashboard cards at top: total value, low stock count, expiring count, out of stock count
- Each item row: name, SKU, category, current stock, unit, reorder point, unit cost, last purchase price, actions (adjust, view history)
- Click item → detail panel with stock movement history chart

**2. `PurchasesPage.tsx`** — Purchase orders
- Tab 1: **Purchase Orders** — list with status filter (draft/submitted/approved/received/cancelled)
- Tab 2: **Create PO** — form with supplier select, add line items (search inventory items), auto-calculate totals
- Tab 3: **Import CSV** — drag-and-drop CSV upload
- Each PO row: PO number, supplier, date, status badge, total, actions (view/edit/approve/receive)
- Receive modal: for each item, enter quantity received + rejected

**3. `SuppliersPage.tsx`** — Supplier management
- List with search, active filter
- Each supplier row: name, contact, phone, total spent, last order date, avg rating, actions
- Detail panel: price comparison table, performance metrics, rating form, purchase history

**4. `ExpensesPage.tsx`** — Expense tracking
- Tab 1: **Expenses** — list with date range, category filter, status filter
- Tab 2: **Add Expense** — form with category select, amount, date, receipt upload, recurring toggle
- Tab 3: **Categories** — manage expense categories
- Summary cards at top: total this month, by category pie chart, vs last month comparison
- Recurring expenses highlighted with badge

**5. `InvoicesPage.tsx`** — Invoice management
- List with type filter (sale/purchase/credit_note), status filter, date range
- Each row: invoice number, type badge, recipient, date, total, status badge, actions (view/PDF/mark paid/void)
- Create invoice form: manual or auto-create from order/purchase
- PDF preview/download

**6. `FinancePage.tsx`** — Financial dashboard
- Tab 1: **P&L** — profit & loss with date range selector, comparison to previous period
- Tab 2: **Cash Flow** — daily cash in/out chart with payment method breakdown
- Tab 3: **Tax** — tax summary for date range, output vs input tax
- Tab 4: **Daily Summary** — single-day snapshot
- Tab 5: **Accounts Payable** — what you owe, aging buckets

**Follow existing dashboard patterns:**
- Look at `ReportsPage.tsx` and `AnalyticsPage.tsx` for API call patterns, date range pickers, card layouts
- Use the same fetch utility and auth token handling
- Use the same styling patterns (inline styles matching existing pages)
- All amounts display as `MVR {amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`

---

## Constraints

- **Do NOT install new npm packages** in frontend apps — use what exists
- **You MAY install Laravel packages** if needed (e.g., `barryvdh/laravel-dompdf` for PDF generation) — run `composer require` in `backend/`
- **Do NOT modify existing working endpoints** — only ADD new ones or EXTEND existing controllers
- **Do NOT change the Money value object** — it's battle-tested for the payment flow
- **Do NOT change OrderTotalsCalculator** — it handles the entire checkout flow
- **Follow existing code patterns** — strict types, form requests for validation, audit logging, JSON responses
- **All financial amounts** must have both decimal and laar (integer) columns
- **Staff-only endpoints** must check `$request->user()->tokenCan('staff')` or be inside `auth:sanctum` middleware
- **All new artisan commands** must be idempotent (safe to run multiple times)
- **CSV exports** must sanitize values (use existing `sanitizeCsvValue` pattern from ReportsController)

---

## Implementation Order

1. **Phase 1** — Fix bugs (waste deduction, purchase cost update) — 30 min
2. **Phase 2** — Invoicing (migrations, model, controller, routes) — 2-3 hrs
3. **Phase 3** — Expense tracking (migrations, model, controller, recurring command) — 2-3 hrs
4. **Phase 6** — Financial reports (P&L, cash flow, tax, daily summary) — depends on Phase 3
5. **Phase 4** — Supplier intelligence (ratings, comparison endpoints) — 1-2 hrs
6. **Phase 5** — Purchase order workflow (status machine, receiving, auto-suggest) — 2-3 hrs
7. **Phase 8** — Inventory enhancements (categories, conversions, expiry alerts, auto-reorder) — 2-3 hrs
8. **Phase 7** — Advanced forecasting (weighted avg, item forecast, trends) — 1-2 hrs
9. **Phase 9** — Admin dashboard pages (6 new React pages) — 4-6 hrs

Start with Phase 1 (bugs), then Phase 2 (invoicing), then Phase 3 (expenses). These unlock Phase 6 (financial reports) which is the most business-critical deliverable.

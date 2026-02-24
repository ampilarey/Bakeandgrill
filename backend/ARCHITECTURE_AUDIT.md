# Bake & Grill — Architecture Audit
> Generated: Feb 2026 — Phase 0.1 of Modular Monolith Refactor

---

## 1. ROUTE CATALOG

### API Routes (`routes/api.php`)

#### Public (no auth)
| Method | Path | Controller | Notes |
|--------|------|-----------|-------|
| GET | `/api/health` | closure | Returns status/timestamp |
| GET | `/api/opening-hours/status` | closure → `OpeningHoursService` | Returns open/closed + message |
| GET | `/api/categories` | `CategoryController@index` | Public menu |
| GET | `/api/categories/{id}` | `CategoryController@show` | |
| GET | `/api/items` | `ItemController@index` | |
| GET | `/api/items/{id}` | `ItemController@show` | |
| GET | `/api/items/barcode/{barcode}` | `ItemController@lookupByBarcode` | |
| POST | `/api/items/stock-check` | closure → `Item::whereIn` | `{ item_ids: [] }` |
| GET | `/api/receipts/{token}` | `ReceiptController@show` | Public receipt view |
| POST | `/api/receipts/{token}/resend` | `ReceiptController@resend` | throttle:5,10 |
| POST | `/api/receipts/{token}/feedback` | `ReceiptController@feedback` | throttle:10,10 |
| POST | `/api/customer/sms/opt-out` | `CustomerController@optOut` | |

#### Staff Auth (no token required)
| Method | Path | Controller | Notes |
|--------|------|-----------|-------|
| POST | `/api/auth/staff/pin-login` | `StaffAuthController@pinLogin` | throttle:10,1 |
| POST | `/api/auth/customer/otp/request` | `CustomerAuthController@requestOtp` | throttle:5,10 |
| POST | `/api/auth/customer/otp/verify` | `CustomerAuthController@verifyOtp` | throttle:10,10 |

#### Protected — `auth:sanctum`
| Method | Path | Controller | Middleware |
|--------|------|-----------|-----------|
| POST | `/api/auth/logout` | `StaffAuthController@logout` | |
| GET | `/api/auth/me` | `StaffAuthController@me` | |
| POST | `/api/devices/register` | `DeviceController@register` | `can:device.manage`, throttle:10,1 |
| GET | `/api/devices` | `DeviceController@index` | `can:device.manage` |
| PATCH | `/api/devices/{id}/disable` | `DeviceController@disable` | `can:device.manage` |
| PATCH | `/api/devices/{id}/enable` | `DeviceController@enable` | `can:device.manage` |
| POST | `/api/orders` | `OrderController@store` | `device.active` |
| POST | `/api/orders/sync` | `OrderController@sync` | `device.active` |
| GET | `/api/orders/{id}` | `OrderController@show` | |
| POST | `/api/orders/{id}/hold` | `OrderController@hold` | |
| POST | `/api/orders/{id}/resume` | `OrderController@resume` | |
| POST | `/api/orders/{id}/payments` | `OrderController@addPayments` | |
| GET | `/api/kds/orders` | `KdsController@index` | |
| POST | `/api/kds/orders/{id}/start` | `KdsController@start` | |
| POST | `/api/kds/orders/{id}/bump` | `KdsController@bump` | |
| POST | `/api/kds/orders/{id}/recall` | `KdsController@recall` | |
| GET | `/api/print-jobs` | `PrintJobController@index` | |
| POST | `/api/print-jobs/{id}/retry` | `PrintJobController@retry` | |
| GET | `/api/inventory` | `InventoryController@index` | |
| POST | `/api/inventory` | `InventoryController@store` | |
| GET | `/api/inventory/{id}` | `InventoryController@show` | |
| PATCH | `/api/inventory/{id}` | `InventoryController@update` | |
| POST | `/api/inventory/{id}/adjust` | `InventoryController@adjust` | |
| POST | `/api/inventory/stock-count` | `InventoryController@stockCount` | |
| GET | `/api/inventory/low-stock` | `InventoryController@lowStock` | |
| GET | `/api/inventory/{id}/price-history` | `InventoryController@priceHistory` | |
| GET | `/api/inventory/{id}/cheapest-supplier` | `InventoryController@cheapestSupplier` | |
| GET | `/api/suppliers` | `SupplierController@index` | |
| POST | `/api/suppliers` | `SupplierController@store` | |
| GET | `/api/suppliers/{id}` | `SupplierController@show` | |
| PATCH | `/api/suppliers/{id}` | `SupplierController@update` | |
| DELETE | `/api/suppliers/{id}` | `SupplierController@destroy` | |
| GET | `/api/purchases` | `PurchaseController@index` | |
| POST | `/api/purchases` | `PurchaseController@store` | |
| GET | `/api/purchases/{id}` | `PurchaseController@show` | |
| PATCH | `/api/purchases/{id}` | `PurchaseController@update` | |
| POST | `/api/purchases/{id}/receipts` | `PurchaseController@uploadReceipt` | |
| POST | `/api/purchases/import` | `PurchaseController@import` | |
| GET | `/api/shifts/current` | `ShiftController@current` | |
| POST | `/api/shifts/open` | `ShiftController@open` | |
| POST | `/api/shifts/{id}/close` | `ShiftController@close` | |
| POST | `/api/shifts/{id}/cash-movements` | `CashMovementController@store` | |
| GET | `/api/reports/sales-summary` | `ReportsController@salesSummary` | |
| GET | `/api/reports/sales-breakdown` | `ReportsController@salesBreakdown` | |
| GET | `/api/reports/x-report` | `ReportsController@xReport` | |
| GET | `/api/reports/z-report` | `ReportsController@zReport` | |
| GET | `/api/reports/inventory-valuation` | `ReportsController@inventoryValuation` | |
| GET | `/api/reports/sales-summary/csv` | `ReportsController@salesSummaryCsv` | throttle:20,1 |
| GET | `/api/reports/sales-breakdown/csv` | `ReportsController@salesBreakdownCsv` | throttle:20,1 |
| GET | `/api/reports/x-report/csv` | `ReportsController@xReportCsv` | throttle:20,1 |
| GET | `/api/reports/z-report/csv` | `ReportsController@zReportCsv` | throttle:20,1 |
| GET | `/api/reports/inventory-valuation/csv` | `ReportsController@inventoryValuationCsv` | throttle:20,1 |
| GET | `/api/tables` | `TableController@index` | |
| POST | `/api/tables` | `TableController@store` | |
| PATCH | `/api/tables/{id}` | `TableController@update` | |
| POST | `/api/tables/{id}/open` | `TableController@open` | `device.active` |
| POST | `/api/tables/{tableId}/orders/{orderId}/items` | `TableController@addItems` | `device.active` |
| POST | `/api/tables/{id}/close` | `TableController@close` | |
| POST | `/api/tables/merge` | `TableController@merge` | |
| POST | `/api/tables/{id}/split` | `TableController@split` | |
| POST | `/api/receipts/{orderId}/send` | `ReceiptController@send` | |
| GET | `/api/refunds` | `RefundController@index` | |
| GET | `/api/refunds/{id}` | `RefundController@show` | |
| POST | `/api/orders/{orderId}/refunds` | `RefundController@store` | |
| GET | `/api/sms/promotions` | `SmsPromotionController@index` | |
| GET | `/api/sms/promotions/{id}` | `SmsPromotionController@show` | |
| POST | `/api/sms/promotions/preview` | `SmsPromotionController@preview` | throttle:10,5 |
| POST | `/api/sms/promotions/send` | `SmsPromotionController@send` | throttle:5,60 |

#### Protected — Customer (`auth:sanctum`, `/api/customer` prefix)
| Method | Path | Controller |
|--------|------|-----------|
| GET | `/api/customer/me` | `CustomerController@me` |
| GET | `/api/customer/orders` | `CustomerController@orders` |
| POST | `/api/customer/orders` | `OrderController@storeCustomer` |
| PATCH | `/api/customer/profile` | `CustomerController@update` |

#### Protected — Menu Management (`auth:sanctum`)
| Method | Path | Controller |
|--------|------|-----------|
| POST | `/api/categories` | `CategoryController@store` |
| PATCH | `/api/categories/{id}` | `CategoryController@update` |
| DELETE | `/api/categories/{id}` | `CategoryController@destroy` |
| POST | `/api/items` | `ItemController@store` |
| GET | `/api/items/{id}/recipe` | `ItemController@showWithRecipe` |
| PATCH | `/api/items/{id}` | `ItemController@update` |
| DELETE | `/api/items/{id}` | `ItemController@destroy` |
| PATCH | `/api/items/{id}/toggle-availability` | `ItemController@toggleAvailability` |

### Web Routes (`routes/web.php`)
| Method | Path | Controller |
|--------|------|-----------|
| GET | `/thumb/{path}` | `ImageThumbController@show` |
| GET | `/dashboard` | closure → redirect |
| GET | `/admin` | `MenuAdminController@index` |
| GET | `/` | `HomeController@index` |
| GET | `/menu` | `HomeController@menu` |
| GET | `/contact` | `HomeController@contact` |
| GET | `/hours` | `HomeController@hours` |
| GET | `/privacy` | `HomeController@privacy` |
| GET | `/customer/login` | `CustomerPortalController@showLogin` |
| POST | `/customer/request-otp` | `CustomerPortalController@requestOtp` |
| POST | `/customer/verify-otp` | `CustomerPortalController@verifyOtp` |
| POST | `/customer/logout` | `CustomerPortalController@logout` |
| GET | `/order-type` | closure |
| GET | `/checkout` | `HomeController@checkout` |
| GET | `/pre-order` | `PreOrderController@create` |
| POST | `/pre-order` | `PreOrderController@store` |
| GET | `/pre-order/{id}/confirmation` | `PreOrderController@confirmation` |
| GET | `/receipts/{token}` | `ReceiptPageController@show` |
| GET | `/receipts/{token}/pdf` | `ReceiptPageController@pdf` |
| POST | `/receipts/{token}/feedback` | `ReceiptPageController@feedback` |
| POST | `/receipts/{token}/resend` | `ReceiptPageController@resend` |

---

## 2. CURRENT MODELS

| Model | Table | Key Relations |
|-------|-------|---------------|
| `Order` | `orders` | items, payments, customer, user, device, table, receipt |
| `OrderItem` | `order_items` | order, item, modifiers |
| `OrderItemModifier` | `order_item_modifiers` | orderItem, modifier |
| `Payment` | `payments` | order |
| `Item` | `items` | category, variants, modifiers, recipe |
| `Category` | `categories` | items |
| `Modifier` | `modifiers` | items |
| `Variant` | `variants` | item |
| `Customer` | `customers` | orders |
| `User` | `users` | role |
| `Role` | `roles` | users |
| `Device` | `devices` | |
| `Shift` | `shifts` | cashMovements |
| `CashMovement` | `cash_movements` | shift |
| `Receipt` | `receipts` | order, feedback |
| `ReceiptFeedback` | `receipt_feedback` | receipt |
| `PrintJob` | `print_jobs` | order, printer |
| `Printer` | `printers` | |
| `InventoryItem` | `inventory_items` | stockMovements, suppliers |
| `StockMovement` | `stock_movements` | inventoryItem |
| `Recipe` | `recipes` | item, recipeItems |
| `RecipeItem` | `recipe_items` | recipe, inventoryItem |
| `Supplier` | `suppliers` | purchases |
| `Purchase` | `purchases` | supplier, items, receipts |
| `PurchaseItem` | `purchase_items` | purchase, inventoryItem |
| `PurchaseReceipt` | `purchase_receipts` | purchase |
| `RestaurantTable` | `restaurant_tables` | orders |
| `Refund` | `refunds` | order |
| `SmsPromotion` | `sms_promotions` | recipients |
| `SmsPromotionRecipient` | `sms_promotion_recipients` | promotion |
| `AuditLog` | `audit_logs` | |
| `LowStockAlert` | `low_stock_alerts` | |

---

## 3. CRITICAL FLOWS

### 3.1 Order Create (POS Staff)
```
POST /api/orders
  → OrderController@store
  → checks tokenCan('staff')
  → OrderCreationService::createFromPayload()
      → DB::transaction
      → generate order number (daily_sequences lockForUpdate)
      → Order::create (status=pending)
      → for each item:
          → validate item exists + is_active + is_available
          → check stock if track_stock && stock_based
          → load price from DB (variant or base_price)
          → validate modifiers belong to item
          → create OrderItem + OrderItemModifiers from DB prices only
      → calculate subtotal, tax (per-item rate), discount
      → Order::update with totals
      → dispatch print jobs to kitchen/bar printers (PrintProxyService::send)
  → AuditLogService::log(order.created)
  → return { order } 201
```

**Key security:** All prices sourced from DB only. Client-provided prices are ignored.

### 3.2 Payment Recording + Order Completion (POS)
```
POST /api/orders/{id}/payments
  → OrderController@addPayments
  → for each payment: Payment::create
  → sum confirmed payments
  → if paidTotal >= order.total:
      → order.status = completed
      → InventoryDeductionService::deductForOrder (idempotent via StockMovement check)
      → dispatchReceiptPrintJobs (receipt/counter printers)
  → else: order.status = partial
  → return { order, paid_total }
```

**Coupling hotspot:** Inventory deduction and print dispatch happen inline in the controller. No events.

### 3.3 KDS Bump
```
POST /api/kds/orders/{id}/bump
  → KdsController@bump
  → validates status in [pending, in_progress]
  → order.status = completed
  → InventoryDeductionService::deductForOrder
  → return { order }
```

**Bug:** `$request` variable used in bump/recall but not injected in method signature — will throw.

### 3.4 Receipt Send / Resend
```
POST /api/receipts/{orderId}/send     (staff)
POST /api/receipts/{token}/resend     (public)
  → ReceiptController
  → cooldown check (120s), max resends (3)
  → deliverReceipt():
      → SMS: SmsService::send
      → Email: Mail::to()->send(ReceiptMail)
  → receipt.resend_count++, last_sent_at = now
  → AuditLogService::log
```

**Duplication:** Receipt send logic duplicated between `Api/ReceiptController` and `ReceiptPageController`.

### 3.5 Inventory Deduction
```
InventoryDeductionService::deductForOrder($order)
  → DB::transaction
  → idempotency: check StockMovement where reference_type=order AND reference_id=order.id
  → for each order item:
      → load item.recipe.recipeItems.inventoryItem
      → calculate neededQuantity = (recipeItem.quantity × orderItem.quantity) / recipe.yield_quantity
      → inventoryItem.current_stock -= neededQuantity  ← direct save (not increment)
      → StockMovement::create
```

**Risk:** `$inventoryItem->save()` is a full model save, not atomic DB increment — race condition under concurrency.

### 3.6 Print Job Dispatch
```
PrintProxyService::send($job)
  → HTTP POST to PRINT_PROXY_URL/print with X-Print-Key header
  → on success: job.status = printed
  → on failure: job.status = failed, last_error = response body
```

**Print payload shape (MUST PRESERVE):**
```json
{
  "printer_name": "Kitchen 1",
  "type": "kitchen",
  "printer": { "id", "name", "ip_address", "port", "type", "station" },
  "order": {
    "id", "order_number", "type", "notes", "created_at",
    "items": [{ "id", "item_name", "quantity", "modifiers": [{ "id", "modifier_name", "modifier_price" }] }]
  }
}
```

**Receipt print payload additionally includes:** `subtotal`, `tax_amount`, `discount_amount`, `total`, `payments[]`

### 3.7 Shifts
```
POST /api/shifts/open
  → check no existing open shift for user
  → Shift::create with opening_cash

POST /api/shifts/{id}/close
  → sum cash_in, cash_out movements
  → sum cash payments in shift window
  → calculate expected_cash, variance
  → Shift::update closed_at, closing_cash, variance
```

---

## 4. EXISTING SERVICES SUMMARY

| Service | Responsibility | Issues |
|---------|---------------|--------|
| `OrderCreationService` | Create order + items + modifiers + totals + print dispatch | Mixes business logic + printing |
| `InventoryDeductionService` | Deduct stock on order complete | Non-atomic save, race condition risk |
| `PrintProxyService` | HTTP call to print proxy | Fine, but called inline everywhere |
| `PrintJobService` | Print job management | Needs review |
| `SmsService` | SMS via Dhiraagu API | Fine, needs wrapping in Notifier |
| `StockManagementService` | Stock check on order create | Fine |
| `StockReservationService` | Stock reservation | Needs review |
| `AuditLogService` | Audit logging | Called everywhere inline — ok but verbose |
| `OpeningHoursService` | Opening hours config | Move to Shared/Support |

---

## 5. COUPLING HOTSPOTS & RISKS

| Risk | Location | Severity |
|------|----------|----------|
| Inventory deduction + printing inline in controller | `OrderController@addPayments` | HIGH |
| Inventory deduction in KDS bump inline | `KdsController@bump` | HIGH |
| `$request` not injected in `KdsController@bump/recall` | `KdsController` | BUG |
| Non-atomic inventory save (race condition) | `InventoryDeductionService` | HIGH |
| Receipt logic duplicated web + API | `ReceiptController`, `ReceiptPageController` | MEDIUM |
| No events fired on order completion | `OrderController`, `KdsController` | HIGH |
| Print payload built inline in 2 places | `OrderCreationService`, `OrderController` | MEDIUM |
| No idempotency key on print jobs | `PrintJob` | MEDIUM |
| No `Payment` model columns for BML gateway | `Payment` | NEW |
| No promotions/loyalty tables exist | — | NEW |
| Order status `partial` used but not in KDS states | `OrderController` | MEDIUM |

---

## 6. KEY PAYLOAD SHAPES

### `POST /api/orders` request
```json
{
  "type": "dine_in",
  "restaurant_table_id": 3,
  "notes": "No onions",
  "customer_notes": null,
  "device_identifier": "POS-001",
  "discount_amount": 0,
  "print": true,
  "items": [
    {
      "item_id": 12,
      "variant_id": null,
      "quantity": 2,
      "modifiers": [
        { "modifier_id": 5, "quantity": 1 }
      ]
    }
  ]
}
```

### `POST /api/orders` response
```json
{
  "order": {
    "id": 101,
    "order_number": "BG-20260225-0001",
    "type": "dine_in",
    "status": "pending",
    "subtotal": "25.00",
    "tax_amount": "0.00",
    "discount_amount": "0.00",
    "total": "25.00",
    "items": [ ... ],
    "created_at": "..."
  }
}
```

### `POST /api/orders/{id}/payments` request
```json
{
  "payments": [
    { "method": "cash", "amount": 25.00, "status": "paid" },
    { "method": "card", "amount": 10.00, "reference_number": "TXN123" }
  ],
  "print_receipt": true
}
```

### `GET /api/kds/orders` response
```json
{
  "orders": [
    {
      "id": 101,
      "order_number": "BG-20260225-0001",
      "status": "pending",
      "type": "dine_in",
      "items": [
        {
          "item_name": "Grilled Chicken",
          "quantity": 2,
          "modifiers": [{ "modifier_name": "Extra Sauce", "modifier_price": "1.00" }]
        }
      ]
    }
  ]
}
```

### `GET /api/receipts/{token}` response
```json
{
  "receipt": { "id", "token", "channel", "recipient", "sent_at", "resend_count", "last_sent_at" },
  "order": { "id", "order_number", "total", "items": [...], "payments": [...] },
  "feedback_count": 0
}
```

---

## 7. DATABASE TABLES (existing)

```
users, roles
customers, otp_verifications
devices
orders, order_items, order_item_modifiers
payments
categories, items, variants, modifiers
recipes, recipe_items
inventory_items, stock_movements
suppliers, purchases, purchase_items, purchase_receipts
shifts, cash_movements
print_jobs, printers
receipts, receipt_feedback
restaurant_tables
refunds
sms_promotions, sms_promotion_recipients
audit_logs
daily_sequences
```

---

## 8. WHAT THE REFACTOR MUST PRESERVE

1. All route paths and HTTP methods above
2. All request/response JSON shapes above
3. Print proxy payload format (golden-tested in contract tests)
4. Receipt token URL scheme `/receipts/{token}`
5. Order number format `BG-{YYYYMMDD}-{0001}`
6. Price-from-DB-only security in order creation
7. Inventory deduction idempotency check (existence of StockMovement)
8. Receipt resend cooldown (120s) and max resends (3)
9. `AuditLogService` call signatures

# Bake & Grill — Loyverse Parity & Integration Enhancement Prompt

You are enhancing the **Bake & Grill** POS system — a Laravel 12 + React 18 monorepo for a Maldivian café. The system already has a comprehensive POS, KDS, online ordering, inventory, CRM, loyalty, and analytics stack. This prompt closes feature gaps identified in a **Loyverse POS comparison** and adds critical integrations the system currently lacks.

---

## Project Structure

```
backend/                          # Laravel 12 API
  app/
    Http/Controllers/Api/         # 37 API controllers
    Models/                       # 59 Eloquent models
    Services/                     # 9 service classes
  config/
    bml.php                       # BML Connect payment gateway
    delivery.php                  # Zone-based delivery fees
    opening_hours.php             # Opening hours + closures
    services.php                  # Dhiraagu SMS, print proxy, Slack
  database/migrations/            # 75+ migrations
  routes/api.php                  # All API routes (Sanctum auth)

apps/
  pos-web/                        # Staff POS terminal (React)
  kds-web/                        # Kitchen Display System (React)
  online-order-web/               # Customer ordering app (React)
  admin-dashboard/                # Admin panel (React)

packages/                         # Shared packages
print-proxy/                      # Node.js thermal printer bridge
```

### Tech Stack
- **Backend:** PHP 8.2, Laravel 12, Sanctum 4, DomPDF
- **Frontend:** React 18, Vite, Tailwind CSS, React Router v6
- **Database:** MySQL/SQLite
- **Auth:** PIN-based (staff), OTP-based (customers), Sanctum tokens
- **Payments:** BML Connect (Bank of Maldives) — only gateway
- **SMS:** Dhiraagu API
- **Printing:** ESC/POS via Node.js print-proxy
- **Currency:** MVR (Maldivian Rufiyaa)

### Existing Key Services
- `OrderCreationService` — creates orders with items, modifiers, variants
- `InventoryDeductionService` — atomic, idempotent stock deduction on sale
- `StockManagementService` — availability status, low stock alerts
- `StockReservationService` — 3-minute cart holds
- `PrintJobService` / `PrintProxyService` — thermal receipt + kitchen printing
- `SmsService` — Dhiraagu SMS gateway
- `OpeningHoursService` — opening/closing time checks
- `AuditLogService` — audit trail for all mutations

### Existing Models (59 total)
`AuditLog`, `CashMovement`, `Category`, `ComboItem`, `Customer`, `DailySpecial`, `Device`, `GiftCard`, `GiftCardTransaction`, `InventoryItem`, `Item`, `ItemPhoto`, `LowStockAlert`, `LoyaltyAccount`, `LoyaltyHold`, `LoyaltyLedger`, `Modifier`, `Order`, `OrderItem`, `OrderItemModifier`, `OrderPromotion`, `OtpVerification`, `Payment`, `PrintJob`, `Printer`, `Promotion`, `PromotionRedemption`, `PromotionTarget`, `Purchase`, `PurchaseItem`, `PurchaseReceipt`, `PushSubscription`, `Receipt`, `ReceiptFeedback`, `Recipe`, `RecipeItem`, `Referral`, `ReferralCode`, `Refund`, `Reservation`, `ReservationSetting`, `RestaurantTable`, `Review`, `Role`, `Shift`, `SmsCampaign`, `SmsCampaignRecipient`, `SmsLog`, `SmsPromotion`, `SmsPromotionRecipient`, `StaffSchedule`, `StockMovement`, `Supplier`, `User`, `Variant`, `WasteLog`, `WebhookLog`

---

## PHASE 1: EVENT SYSTEM FOUNDATION

**Why:** The system currently has NO Laravel events/listeners. Every feature (webhooks, integrations, notifications) requires an event backbone. Build this first — everything else depends on it.

### Task 1.1: Create Core Domain Events

Create these event classes in `app/Events/`:

```php
// app/Events/OrderPlaced.php
class OrderPlaced {
    public function __construct(public Order $order) {}
}

// app/Events/OrderStatusChanged.php
class OrderStatusChanged {
    public function __construct(
        public Order $order,
        public string $oldStatus,
        public string $newStatus
    ) {}
}

// app/Events/OrderCompleted.php
class OrderCompleted {
    public function __construct(public Order $order) {}
}

// app/Events/OrderRefunded.php
class OrderRefunded {
    public function __construct(public Refund $refund) {}
}

// app/Events/PaymentReceived.php
class PaymentReceived {
    public function __construct(public Payment $payment) {}
}

// app/Events/StockLevelChanged.php
class StockLevelChanged {
    public function __construct(
        public InventoryItem|Item $item,
        public float $oldQuantity,
        public float $newQuantity,
        public string $reason // 'sale', 'adjustment', 'purchase', 'waste'
    ) {}
}

// app/Events/LowStockReached.php
class LowStockReached {
    public function __construct(public Item $item, public float $currentStock) {}
}

// app/Events/ShiftOpened.php
class ShiftOpened {
    public function __construct(public Shift $shift) {}
}

// app/Events/ShiftClosed.php
class ShiftClosed {
    public function __construct(public Shift $shift, public array $summary) {}
}

// app/Events/CustomerCreated.php
class CustomerCreated {
    public function __construct(public Customer $customer) {}
}

// app/Events/ReservationCreated.php
class ReservationCreated {
    public function __construct(public Reservation $reservation) {}
}
```

### Task 1.2: Dispatch Events from Existing Code

Wire events into existing services and controllers. Do NOT refactor — just add `event()` calls at the right points:

- **`OrderCreationService`** → dispatch `OrderPlaced` after successful order creation
- **`OrderController::addPayments()`** → dispatch `PaymentReceived` for each payment added
- **`KdsController::bump()`** → dispatch `OrderStatusChanged` (preparing → ready) and `OrderCompleted` when bumped to final
- **`RefundController::store()`** → dispatch `OrderRefunded`
- **`InventoryDeductionService`** → dispatch `StockLevelChanged` after deducting
- **`InventoryController::adjust()`** → dispatch `StockLevelChanged` with reason 'adjustment'
- **`StockManagementService::triggerLowStockAlert()`** → dispatch `LowStockReached`
- **`ShiftController::open()`** → dispatch `ShiftOpened`
- **`ShiftController::close()`** → dispatch `ShiftClosed` with cash summary
- **`CustomerAuthController::verifyOtp()`** → dispatch `CustomerCreated` for new customers
- **`ReservationController::store()`** → dispatch `ReservationCreated`

### Task 1.3: Create Event Subscriber / EventServiceProvider

Register all event-listener mappings in `app/Providers/EventServiceProvider.php`. Initially wire to empty listeners — they'll be filled in subsequent phases.

---

## PHASE 2: GENERIC WEBHOOK SYSTEM

**Why:** Currently only BML payment webhooks exist. A generic outgoing webhook system lets external tools (Zapier, Make, n8n, custom scripts) subscribe to business events — this is the #1 integration gap vs Loyverse.

### Task 2.1: Webhook Subscriptions

**Migration:** `create_webhook_subscriptions_table`

```php
Schema::create('webhook_subscriptions', function (Blueprint $table) {
    $table->id();
    $table->string('name');                          // e.g. "Xero Sales Sync"
    $table->string('url');                           // target URL
    $table->string('secret', 64);                    // HMAC signing secret
    $table->json('events');                          // ['order.placed', 'order.completed', ...]
    $table->boolean('active')->default(true);
    $table->unsignedInteger('failure_count')->default(0);
    $table->timestamp('last_triggered_at')->nullable();
    $table->timestamp('disabled_at')->nullable();    // auto-disabled after 10 failures
    $table->timestamps();
});
```

**Model:** `WebhookSubscription` with:
- `scopeActive()` — where active = true AND disabled_at IS NULL
- `scopeForEvent(string $event)` — whereJsonContains('events', $event)
- `markFailed()` — increment failure_count, disable if >= 10
- `markSuccess()` — reset failure_count, update last_triggered_at

### Task 2.2: Webhook Dispatch Service

**`app/Services/WebhookDispatchService.php`:**

```php
class WebhookDispatchService
{
    /**
     * Dispatch a webhook event to all active subscriptions.
     * Each delivery is dispatched as a queued job for resilience.
     */
    public function dispatch(string $event, array $payload): void
    {
        $subscriptions = WebhookSubscription::active()->forEvent($event)->get();

        foreach ($subscriptions as $sub) {
            DispatchWebhook::dispatch($sub, $event, $payload);
        }
    }
}
```

**`app/Jobs/DispatchWebhook.php`:**

```php
class DispatchWebhook implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;
    public array $backoff = [10, 60, 300]; // 10s, 1min, 5min

    public function __construct(
        public WebhookSubscription $subscription,
        public string $event,
        public array $payload
    ) {}

    public function handle(): void
    {
        $body = json_encode([
            'event' => $this->event,
            'timestamp' => now()->toIso8601String(),
            'data' => $this->payload,
        ]);

        $signature = hash_hmac('sha256', $body, $this->subscription->secret);

        $response = Http::timeout(15)
            ->withHeaders([
                'Content-Type' => 'application/json',
                'X-Webhook-Signature' => $signature,
                'X-Webhook-Event' => $this->event,
            ])
            ->withBody($body, 'application/json')
            ->post($this->subscription->url);

        if ($response->failed()) {
            $this->subscription->markFailed();
            // Log to existing WebhookLog model
            WebhookLog::create([
                'direction' => 'outgoing',
                'url' => $this->subscription->url,
                'event' => $this->event,
                'payload' => $this->payload,
                'response_code' => $response->status(),
                'response_body' => $response->body(),
            ]);
            throw new \RuntimeException("Webhook failed: HTTP {$response->status()}");
        }

        $this->subscription->markSuccess();
    }
}
```

### Task 2.3: Webhook Admin API

Add routes under `admin/webhooks`:

```
GET    /admin/webhooks              → list all subscriptions
POST   /admin/webhooks              → create subscription (auto-generate secret)
PATCH  /admin/webhooks/{id}         → update subscription
DELETE /admin/webhooks/{id}         → delete subscription
POST   /admin/webhooks/{id}/test    → send test payload
POST   /admin/webhooks/{id}/enable  → re-enable after auto-disable
GET    /admin/webhooks/{id}/logs    → delivery logs for this subscription
```

**Controller:** `WebhookSubscriptionController`

### Task 2.4: Wire Events to Webhooks

Create a single listener `app/Listeners/DispatchWebhookOnEvent.php` that:
- Listens to ALL domain events from Phase 1
- Maps each event class to a webhook event name:
  - `OrderPlaced` → `order.placed`
  - `OrderCompleted` → `order.completed`
  - `OrderRefunded` → `order.refunded`
  - `PaymentReceived` → `payment.received`
  - `StockLevelChanged` → `stock.changed`
  - `LowStockReached` → `stock.low`
  - `ShiftClosed` → `shift.closed`
  - `CustomerCreated` → `customer.created`
  - `ReservationCreated` → `reservation.created`
- Serializes the event model(s) to array and calls `WebhookDispatchService::dispatch()`

### Task 2.5: Webhook Admin UI

In `apps/admin-dashboard/`, add a **Webhooks** page:
- Table showing all subscriptions with name, URL, events, status, failure count, last triggered
- Create/edit modal with: name, URL, event checkboxes, active toggle
- "Test" button that sends a sample payload
- "Re-enable" button for auto-disabled subscriptions
- Delivery log viewer per subscription

### Supported Webhook Events (document in UI):

| Event | Trigger | Payload |
|-------|---------|---------|
| `order.placed` | New order created | Full order with items, customer, totals |
| `order.completed` | Order bumped from KDS | Order + completion time |
| `order.refunded` | Refund processed | Refund details + original order |
| `payment.received` | Payment added to order | Payment method, amount, order_id |
| `stock.changed` | Stock adjusted (any reason) | item_id, old_qty, new_qty, reason |
| `stock.low` | Stock drops below threshold | item_id, current_stock, threshold |
| `shift.closed` | Shift ended | Shift summary, cash variance, employee |
| `customer.created` | New customer registered | Customer details |
| `reservation.created` | New reservation made | Reservation details |

---

## PHASE 3: MISSING LOYVERSE FEATURES

These are features Loyverse has that the Bake & Grill system currently lacks.

### Task 3.1: Employee Clock-In / Clock-Out

**Why:** Loyverse charges $5/employee/month for this. Build it free into the existing system.

**Migration:** `create_time_entries_table`

```php
Schema::create('time_entries', function (Blueprint $table) {
    $table->id();
    $table->foreignId('user_id')->constrained()->cascadeOnDelete();
    $table->timestamp('clock_in');
    $table->timestamp('clock_out')->nullable();
    $table->decimal('hours_worked', 6, 2)->nullable();     // calculated on clock-out
    $table->decimal('break_minutes', 5, 0)->default(0);    // manual break deduction
    $table->text('notes')->nullable();
    $table->timestamps();
    $table->index(['user_id', 'clock_in']);
});
```

**Controller:** `TimeClockController`

```
POST   /api/staff/clock-in         → clock in (reject if already clocked in)
POST   /api/staff/clock-out        → clock out + calculate hours
GET    /api/staff/clock-status     → current clock status for authenticated user
GET    /api/admin/time-entries     → list all entries (filter by user, date range)
GET    /api/admin/time-entries/summary → hours summary per employee per period
PATCH  /api/admin/time-entries/{id}    → admin correction (add notes)
```

**Logic:**
- `clock_in`: Check no open entry exists for this user. Create new entry.
- `clock_out`: Find open entry, set clock_out = now(), calculate `hours_worked = (clock_out - clock_in - break_minutes) / 60`
- `summary`: Group by user_id, sum hours_worked for date range. Return per-employee totals.
- Integrate with existing `StaffSchedule` — show scheduled vs actual hours comparison.

**POS UI (`apps/pos-web/`):**
- Add clock in/out button to the staff header or login screen
- Show current clock status (clocked in since HH:MM, or "Not clocked in")
- Visual indicator in staff list showing who is currently clocked in

**Admin Dashboard (`apps/admin-dashboard/`):**
- Time entries page with date range filter
- Per-employee hours summary table
- Export to CSV

### Task 3.2: Tax Summary Report

**Why:** Tax is already calculated per order (`tax_amount` column on `orders` table, `tax` on `order_items`), but there's no aggregated tax report.

**Add to `ReportsController`:**

```php
public function taxReport(Request $request): JsonResponse
{
    $request->validate([
        'start_date' => 'required|date',
        'end_date'   => 'required|date|after_or_equal:start_date',
        'group_by'   => 'in:day,week,month',
    ]);

    // Tax collected grouped by period
    $taxByPeriod = Order::whereBetween('created_at', [$start, $end])
        ->where('status', '!=', 'cancelled')
        ->selectRaw("
            DATE_FORMAT(created_at, ?) as period,
            SUM(tax_amount) as total_tax,
            COUNT(*) as order_count,
            SUM(total) as total_revenue
        ", [$dateFormat])
        ->groupBy('period')
        ->orderBy('period')
        ->get();

    // Tax by category (from order_items)
    $taxByCategory = OrderItem::join('orders', 'order_items.order_id', '=', 'orders.id')
        ->join('items', 'order_items.item_id', '=', 'items.id')
        ->join('categories', 'items.category_id', '=', 'categories.id')
        ->whereBetween('orders.created_at', [$start, $end])
        ->where('orders.status', '!=', 'cancelled')
        ->selectRaw('categories.name as category, SUM(order_items.tax) as tax_total')
        ->groupBy('categories.name')
        ->get();

    // Refunded tax (to subtract from owed amount)
    $refundedTax = Refund::whereBetween('created_at', [$start, $end])
        ->sum('tax_refunded'); // may need to add this column

    return response()->json([
        'period' => ['start' => $start, 'end' => $end],
        'total_tax_collected' => $taxByPeriod->sum('total_tax'),
        'total_tax_refunded' => $refundedTax,
        'net_tax_payable' => $taxByPeriod->sum('total_tax') - $refundedTax,
        'by_period' => $taxByPeriod,
        'by_category' => $taxByCategory,
    ]);
}
```

**Routes:**
```
GET /api/reports/tax-report         → taxReport()
GET /api/reports/tax-report/csv     → taxReportCsv()
```

**Admin Dashboard:** Add "Tax Report" tab to the Reports section. Show:
- Total tax collected, refunded, and net payable
- Line chart of tax by period
- Breakdown table by category
- CSV export button

### Task 3.3: Sales Trend Comparison

**Why:** Loyverse shows growth/decline vs previous period. The existing `salesSummary` endpoint only shows absolute numbers for a date range.

**Add to `ReportsController`:**

```php
public function salesTrend(Request $request): JsonResponse
{
    $request->validate([
        'period' => 'required|in:day,week,month',
        'date'   => 'required|date',
    ]);

    $current = $this->getSalesSummaryForPeriod($date, $period);
    $previous = $this->getSalesSummaryForPeriod($previousDate, $period);

    return response()->json([
        'current' => $current,
        'previous' => $previous,
        'change' => [
            'revenue' => $this->percentChange($previous['revenue'], $current['revenue']),
            'orders'  => $this->percentChange($previous['orders'], $current['orders']),
            'avg_order_value' => $this->percentChange($previous['avg_order_value'], $current['avg_order_value']),
            'customers' => $this->percentChange($previous['customers'], $current['customers']),
        ],
    ]);
}

private function percentChange(float $old, float $new): ?float
{
    if ($old == 0) return $new > 0 ? 100.0 : null;
    return round((($new - $old) / $old) * 100, 1);
}
```

**Route:** `GET /api/reports/sales-trend`

**Admin Dashboard:** Add trend indicators (green up arrow / red down arrow with %) to the sales dashboard cards showing comparison with previous period.

### Task 3.4: Barcode Label Printing

**Why:** Loyverse can print barcode labels for inventory items. Useful for retail items at the café (packaged goods, merchandise).

**Controller:** `BarcodeLabelController`

```
POST /api/admin/barcode-labels/generate   → generate PDF of barcode labels
```

**Request:**
```json
{
  "items": [
    { "item_id": 1, "quantity": 5 },
    { "item_id": 2, "quantity": 10 }
  ],
  "label_size": "38x25",      // mm, standard label sizes
  "include_price": true,
  "include_name": true
}
```

**Logic:**
- Use `barryvdh/laravel-dompdf` (already installed) to generate a PDF
- Each label contains: item name (optional), barcode (Code 128 or EAN-13), price (optional)
- Generate barcode SVGs using a pure PHP barcode library (add `picqer/php-barcode-generator` to composer)
- Layout labels in a grid matching the label sheet size
- Return PDF for download/print

### Task 3.5: Customer Notes Field

**Why:** Loyverse allows notes on customers (allergies, preferences, VIP status). Currently missing.

**Migration:** `add_notes_to_customers_table`

```php
Schema::table('customers', function (Blueprint $table) {
    $table->text('notes')->nullable()->after('delivery_address');
});
```

**Update:**
- `Customer` model — add `'notes'` to `$fillable`
- `CustomerController::update()` — accept and save `notes` field
- `CustomerController::me()` — include notes in response
- Admin customer list — show notes column (truncated), full notes in detail view
- POS — show customer notes popup when customer is attached to an order (allergy warning)

### Task 3.6: Partial Purchase Receiving

**Why:** Loyverse Advanced Inventory ($25/mo) supports receiving partial shipments. Currently, purchases go straight to "received" status.

**Migration:** `enhance_purchases_for_partial_receiving`

```php
Schema::table('purchases', function (Blueprint $table) {
    $table->string('status')->default('ordered')->after('total'); // ordered, partial, received, cancelled
});

Schema::table('purchase_items', function (Blueprint $table) {
    $table->decimal('received_quantity', 10, 2)->default(0)->after('quantity');
});

Schema::create('purchase_receivings', function (Blueprint $table) {
    $table->id();
    $table->foreignId('purchase_id')->constrained()->cascadeOnDelete();
    $table->foreignId('received_by')->constrained('users');
    $table->text('notes')->nullable();
    $table->timestamps();
});

Schema::create('purchase_receiving_items', function (Blueprint $table) {
    $table->id();
    $table->foreignId('purchase_receiving_id')->constrained()->cascadeOnDelete();
    $table->foreignId('purchase_item_id')->constrained()->cascadeOnDelete();
    $table->decimal('quantity', 10, 2);
    $table->timestamps();
});
```

**Add to `PurchaseController`:**

```
POST /api/purchases/{id}/receive    → receive items (full or partial)
GET  /api/purchases/{id}/receivings → list all receivings for a purchase
```

**Logic:**
- Accept array of `{ purchase_item_id, quantity }` for each item being received
- Update `purchase_items.received_quantity += quantity`
- Create `PurchaseReceiving` + `PurchaseReceivingItem` records
- Update inventory stock via `StockMovement` (reason: 'purchase_received')
- Set purchase status: all items fully received → 'received', some received → 'partial'
- Dispatch `StockLevelChanged` event for each received item

**POS/Admin UI:**
- Purchase detail page shows ordered vs received quantities
- "Receive Items" button opens modal with quantity inputs pre-filled with remaining quantities
- Receiving history log on purchase detail page

---

## PHASE 4: ACCOUNTING & FINANCIAL INTEGRATIONS

### Task 4.1: Xero Integration (OAuth 2.0)

**Why:** This is the #1 requested integration for small businesses. Auto-sync sales data to Xero eliminates manual bookkeeping.

**Install:** `composer require xeroapi/xero-php-oauth2`

**Config:** `config/xero.php`

```php
return [
    'client_id'     => env('XERO_CLIENT_ID'),
    'client_secret' => env('XERO_CLIENT_SECRET'),
    'redirect_uri'  => env('XERO_REDIRECT_URI', env('APP_URL') . '/api/admin/integrations/xero/callback'),
    'scopes'        => 'openid profile email accounting.transactions accounting.contacts',
    'webhook_key'   => env('XERO_WEBHOOK_KEY'),
];
```

**Migration:** `create_integration_connections_table`

```php
Schema::create('integration_connections', function (Blueprint $table) {
    $table->id();
    $table->string('provider');              // 'xero', future: 'quickbooks'
    $table->string('tenant_id')->nullable(); // Xero tenant/org ID
    $table->text('access_token');
    $table->text('refresh_token');
    $table->timestamp('token_expires_at');
    $table->json('settings')->nullable();    // mapping config (accounts, tax rates)
    $table->boolean('active')->default(true);
    $table->foreignId('connected_by')->constrained('users');
    $table->timestamps();
});
```

**Service:** `app/Services/XeroIntegrationService.php`

```php
class XeroIntegrationService
{
    // OAuth flow
    public function getAuthorizationUrl(): string;
    public function handleCallback(string $code): IntegrationConnection;
    public function refreshTokenIfNeeded(IntegrationConnection $connection): void;

    // Data sync
    public function syncDailySales(Carbon $date): void;
    // Creates a single Xero invoice per day with line items grouped by category
    // e.g. "Food Sales - 2026-03-12", "Beverage Sales - 2026-03-12"

    public function syncRefund(Refund $refund): void;
    // Creates a Xero credit note

    public function syncPurchase(Purchase $purchase): void;
    // Creates a Xero bill from supplier purchase

    // Helpers
    public function getXeroAccounts(): array;  // fetch chart of accounts for mapping
    public function getTaxRates(): array;       // fetch tax rates for mapping
}
```

**Controller:** `XeroIntegrationController`

```
GET    /api/admin/integrations/xero/connect     → redirect to Xero OAuth
GET    /api/admin/integrations/xero/callback     → handle OAuth callback
DELETE /api/admin/integrations/xero/disconnect   → revoke connection
GET    /api/admin/integrations/xero/status       → connection status + last sync
POST   /api/admin/integrations/xero/sync         → manual sync trigger
GET    /api/admin/integrations/xero/accounts     → fetch Xero accounts for mapping
PATCH  /api/admin/integrations/xero/settings     → save account mappings
```

**Settings Mapping (stored in `integration_connections.settings`):**
```json
{
    "sales_account": "200",
    "cash_account": "100",
    "card_account": "101",
    "bml_account": "102",
    "tax_rate": "GST on Income",
    "purchase_account": "300",
    "auto_sync": true,
    "sync_frequency": "daily"
}
```

**Event Listener:** Listen to `ShiftClosed` event → if Xero is connected and auto_sync is enabled, queue a `SyncDailySalesToXero` job.

**Admin Dashboard UI:**
- Integrations page with Xero card
- "Connect to Xero" button → OAuth flow
- Account mapping dropdowns (Sales account, Cash account, etc.)
- Last sync status + manual sync button
- Sync history log

### Task 4.2: Generic Integration Hub Page

**Admin Dashboard:** Create an "Integrations" page at `/admin/integrations`:

```
┌─────────────────────────────────────────────────────────────┐
│  Integrations                                                │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │  🏦 Xero     │  │  📨 Webhooks │  │  💳 Payments │       │
│  │  Connected ✓ │  │  3 active    │  │  BML Connect │       │
│  │  [Settings]  │  │  [Manage]    │  │  [Settings]  │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐                         │
│  │  📱 SMS      │  │  🖨 Printing │                         │
│  │  Dhiraagu    │  │  Print Proxy │                         │
│  │  [Settings]  │  │  [Settings]  │                         │
│  └──────────────┘  └──────────────┘                         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

Each card shows connection status, and links to its settings page.

---

## PHASE 5: MULTI-STORE FOUNDATION

**Why:** Loyverse supports multiple locations for free. While Bake & Grill is currently single-location, laying the foundation now avoids a painful refactor later. This is **optional/stretch** — implement only if the business plans to expand.

### Task 5.1: Store/Location Model

**Migration:** `create_stores_table`

```php
Schema::create('stores', function (Blueprint $table) {
    $table->id();
    $table->string('name');
    $table->string('address')->nullable();
    $table->string('phone')->nullable();
    $table->string('timezone')->default('Indian/Maldives');
    $table->json('opening_hours')->nullable();
    $table->boolean('active')->default(true);
    $table->timestamps();
});
```

**Seed a default store** from existing config values.

**Add `store_id` foreign keys to:**
- `orders` — which store the order belongs to
- `shifts` — which store the shift is at
- `inventory_items` — stock is per-store
- `users` — staff assigned to store(s) (many-to-many via `store_user` pivot)
- `devices` — device registered to a store
- `printers` — printer belongs to a store
- `restaurant_tables` — tables belong to a store

**Make all columns nullable initially** with default = 1 (the seeded default store). This way all existing data continues to work without migration issues.

**DO NOT** refactor all queries yet. Just add the columns and the model. The actual multi-store filtering will be a separate future task.

---

## PHASE 6: PAYMENT REDUNDANCY

### Task 6.1: Stripe Payment Gateway (International Cards)

**Why:** BML Connect is Maldives-only. Adding Stripe enables international card payments (tourists, online orders from abroad).

**Install:** `composer require stripe/stripe-php`

**Config:** `config/stripe.php`

```php
return [
    'secret_key'      => env('STRIPE_SECRET_KEY'),
    'publishable_key' => env('STRIPE_PUBLISHABLE_KEY'),
    'webhook_secret'  => env('STRIPE_WEBHOOK_SECRET'),
    'currency'        => env('STRIPE_CURRENCY', 'usd'), // or 'mvr' if Stripe supports it
];
```

**Service:** `app/Services/StripePaymentService.php`

```php
class StripePaymentService
{
    public function createPaymentIntent(Order $order, string $currency = 'usd'): array
    {
        // Create Stripe PaymentIntent
        // Return client_secret for frontend
    }

    public function handleWebhook(Request $request): void
    {
        // Verify signature
        // Handle payment_intent.succeeded → mark order as paid
        // Handle payment_intent.payment_failed → log failure
    }

    public function refund(Payment $payment, float $amount): array
    {
        // Create Stripe refund
    }
}
```

**Controller:** `StripePaymentController`

```
POST /api/orders/{orderId}/pay/stripe      → create PaymentIntent, return client_secret
POST /api/payments/stripe/webhook          → handle Stripe webhooks (no auth, signature verified)
```

**Frontend (`apps/online-order-web/`):**
- Add Stripe Elements (card input) as alternative payment method on checkout
- Show BML and Stripe as payment options
- Use `@stripe/stripe-js` and `@stripe/react-stripe-js` packages

**Update `PaymentController`:**
- Add `gateway` field to payment method selection: `bml` or `stripe`
- Route to appropriate service based on gateway

### Task 6.2: Payment Gateway Admin Settings

In admin dashboard Integrations page, add a Payments section:
- Toggle BML on/off
- Toggle Stripe on/off
- Configure default gateway
- Test connection buttons

---

## PHASE 7: OPERATIONAL POLISH

### Task 7.1: Weight Barcode Support

**Why:** Loyverse supports scanning barcodes with embedded weight data (GS1 format). Useful for items sold by weight.

**Update `ItemController::lookupByBarcode()`:**

```php
public function lookupByBarcode(string $barcode): JsonResponse
{
    // Check for weight-embedded barcode (starts with '2')
    // GS1 format: 2XPPPPWWWWWC where P=product code, W=weight, C=check digit
    if (strlen($barcode) === 13 && str_starts_with($barcode, '2')) {
        $productCode = substr($barcode, 2, 5);
        $weight = (int) substr($barcode, 7, 5) / 1000; // grams to kg

        $item = Item::where('barcode', 'LIKE', "__${productCode}%")->first();
        if ($item) {
            return response()->json([
                'item' => $item,
                'weight' => $weight,
                'calculated_price' => $item->price * $weight,
                'weight_barcode' => true,
            ]);
        }
    }

    // Standard barcode lookup (existing logic)
    $item = Item::where('barcode', $barcode)->firstOrFail();
    return response()->json(['item' => $item, 'weight_barcode' => false]);
}
```

**POS UI:** When a weight barcode is scanned, auto-populate quantity with the weight and show calculated price.

### Task 7.2: Customer Display (Second Screen) Support

**Why:** Loyverse shows order details on a customer-facing display. This builds on the existing SSE infrastructure.

**Create a new lightweight page** in `apps/pos-web/` (or a standalone mini-app):

**Route:** `/customer-display`

**Features:**
- Connects to SSE stream `/api/stream/orders` (reuse existing)
- Shows current order items as they're added (line items, prices, running total)
- Shows final total with payment status
- When idle, shows a branded welcome screen or daily specials
- Full-screen mode, optimized for a secondary monitor or tablet

**No backend changes needed** — this is purely a frontend page consuming existing SSE streams. The POS would need to broadcast item additions in real-time (may need a new SSE event type for "cart updated").

### Task 7.3: Expiry Date Alerts

**Why:** The `expiry_date` column exists on `inventory_items` but nothing checks it.

**Add a scheduled command:** `app/Console/Commands/CheckExpiringItems.php`

```php
class CheckExpiringItems extends Command
{
    protected $signature = 'inventory:check-expiry';

    public function handle(): void
    {
        // Items expiring in next 7 days
        $expiring = InventoryItem::whereNotNull('expiry_date')
            ->whereBetween('expiry_date', [now(), now()->addDays(7)])
            ->where('current_stock', '>', 0)
            ->get();

        // Items already expired
        $expired = InventoryItem::whereNotNull('expiry_date')
            ->where('expiry_date', '<', now())
            ->where('current_stock', '>', 0)
            ->get();

        if ($expiring->isNotEmpty() || $expired->isNotEmpty()) {
            // Send SMS to admin (reuse SmsService)
            // Create audit log entry
            // Dispatch ExpiryAlert event (for webhook system)
        }
    }
}
```

**Schedule in `routes/console.php`:**
```php
Schedule::command('inventory:check-expiry')->dailyAt('06:00');
```

**Admin Dashboard:** Show expiry warnings as notification badges on the inventory page.

### Task 7.4: Offline Mode Robustness

**Why:** The `/orders/sync` endpoint exists but the frontend offline queue needs hardening.

**In `apps/pos-web/`:**
- Add IndexedDB storage for offline order queue (use `idb` or `localforage` package)
- Detect network status with `navigator.onLine` + periodic health check to `/api/health`
- When offline:
  - Show offline indicator banner
  - Queue orders locally with timestamps and device ID
  - Continue to function for cash payments only (no BML/Stripe)
  - Auto-sync when connection restores
- When back online:
  - Process queue via `/api/orders/sync` (already exists)
  - Show sync progress indicator
  - Handle conflicts (e.g. stock changed while offline)
- Add a `last_synced_at` display in the POS footer

---

## PHASE 8: ADMIN DASHBOARD ENHANCEMENTS

### Task 8.1: Dashboard Home / Overview Page

**Why:** The admin dashboard needs a home page that surfaces key metrics at a glance (like Loyverse's dashboard).

**Route:** `/admin/` or `/admin/dashboard`

**Layout:**
```
┌──────────────────────────────────────────────────────────────────┐
│  Dashboard                                          [Today ▼]   │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐    │
│  │ Revenue    │ │ Orders     │ │ Avg Order  │ │ Customers  │    │
│  │ MVR 4,230  │ │ 47         │ │ MVR 90     │ │ 23         │    │
│  │ ▲ +12%     │ │ ▲ +5%      │ │ ▼ -3%      │ │ ▲ +8%      │    │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘    │
│                                                                  │
│  ┌─────────────────────────────┐ ┌──────────────────────────┐   │
│  │ Revenue Chart (7 days)      │ │ Top Selling Items        │   │
│  │ [Line chart]                │ │ 1. Chicken Burger  (42)  │   │
│  │                             │ │ 2. Fish & Chips    (38)  │   │
│  │                             │ │ 3. Iced Coffee     (35)  │   │
│  └─────────────────────────────┘ └──────────────────────────┘   │
│                                                                  │
│  ┌─────────────────────────────┐ ┌──────────────────────────┐   │
│  │ Low Stock Alerts (5)        │ │ Recent Orders            │   │
│  │ ⚠ Chicken Breast  (2 left) │ │ #0312-047  MVR 120  Paid │   │
│  │ ⚠ Lettuce         (1 left) │ │ #0312-046  MVR 85   Paid │   │
│  │ ⚠ Burger Buns     (5 left) │ │ #0312-045  MVR 210  Paid │   │
│  └─────────────────────────────┘ └──────────────────────────┘   │
│                                                                  │
│  ┌─────────────────────────────┐ ┌──────────────────────────┐   │
│  │ Staff On Duty               │ │ Upcoming Reservations    │   │
│  │ 🟢 Ahmed (since 08:00)     │ │ 12:30 - Table 3 (4 pax) │   │
│  │ 🟢 Fathimath (since 09:00) │ │ 13:00 - Table 5 (2 pax) │   │
│  │ ⚪ Hassan (off duty)        │ │ 19:00 - Table 1 (6 pax) │   │
│  └─────────────────────────────┘ └──────────────────────────┘   │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

**Data sources (all existing endpoints):**
- Revenue + orders: `/api/reports/sales-summary`
- Trend comparison: `/api/reports/sales-trend` (new from Task 3.3)
- Top items: `/api/reports/sales-breakdown?group_by=item`
- Low stock: `/api/inventory/low-stock`
- Recent orders: `/api/orders?limit=5`
- Staff on duty: `/api/admin/time-entries?status=clocked_in` (new from Task 3.1)
- Reservations: `/api/admin/reservations?date=today`

---

## IMPLEMENTATION RULES

1. **Do NOT refactor existing code** unless a task explicitly says to. Add new code alongside existing patterns.
2. **Follow existing conventions:**
   - Controllers return `JsonResponse` with consistent structure
   - Use Sanctum `auth:sanctum` middleware for protected routes
   - Use `$request->validate()` for input validation
   - Use `DB::transaction()` for multi-step mutations
   - Models use `$fillable` arrays, not `$guarded`
   - Service classes for complex business logic
   - Audit log all mutations via `AuditLogService`
3. **Database:** Use MySQL-compatible SQL. All new migrations must be reversible (include `down()` method).
4. **Testing:** Write Feature tests for all new API endpoints using Laravel's testing framework. Follow existing test patterns in `tests/`.
5. **Frontend:** Use existing Tailwind classes and component patterns from each app. No new CSS frameworks.
6. **Error handling:** Use Laravel's built-in exception handling. Return proper HTTP status codes (400, 401, 403, 404, 422, 500).
7. **Security:**
   - Validate ALL user input
   - Use parameterized queries (Eloquent handles this)
   - HMAC-sign all outgoing webhooks
   - Verify signatures on all incoming webhooks
   - Rate-limit public endpoints
   - Sanitize any user-provided URLs (webhook subscription URLs)
8. **Queue:** Use Laravel's queue system for async work (webhook dispatch, Xero sync, SMS). Configure in `.env` with `QUEUE_CONNECTION=database` as default.
9. **No breaking changes** to existing API contracts. All new features are additive.

---

## PRIORITY ORDER

| Priority | Phase | Effort | Business Impact |
|----------|-------|--------|-----------------|
| 🔴 P0 | Phase 1: Event System | 2-3 hours | Foundation for everything |
| 🔴 P0 | Phase 2: Webhook System | 4-6 hours | Enables all integrations |
| 🟠 P1 | Phase 3: Missing Features | 6-8 hours | Loyverse parity |
| 🟠 P1 | Phase 8: Admin Dashboard | 4-6 hours | Usability |
| 🟡 P2 | Phase 4: Xero Integration | 6-8 hours | Accounting automation |
| 🟡 P2 | Phase 6: Stripe Gateway | 4-6 hours | Payment redundancy |
| 🟢 P3 | Phase 7: Operational Polish | 4-6 hours | Quality of life |
| 🟢 P3 | Phase 5: Multi-Store | 2-3 hours | Future-proofing |

**Total estimated scope: ~35-45 hours of development work**

---

## WHAT SUCCESS LOOKS LIKE

After implementing all phases:

1. ✅ External tools can subscribe to business events via webhooks
2. ✅ Sales auto-sync to Xero — no manual bookkeeping
3. ✅ Stripe as backup payment gateway for international cards
4. ✅ Staff clock in/out with hours tracking
5. ✅ Tax summary report for GST filing
6. ✅ Sales trend comparison (vs previous period)
7. ✅ Barcode label printing for retail items
8. ✅ Customer notes for allergies/preferences
9. ✅ Partial purchase receiving for supplier shipments
10. ✅ Weight barcode scanning for items sold by weight
11. ✅ Customer-facing display screen
12. ✅ Expiry date alerts for perishable inventory
13. ✅ Robust offline mode with IndexedDB queue
14. ✅ Admin dashboard with at-a-glance business metrics
15. ✅ Multi-store database foundation (ready for future expansion)

The Bake & Grill system will have **complete Loyverse feature parity** plus all the advantages it already has (online ordering, delivery, SMS campaigns, gift cards, reviews, forecasting, etc.) — making it a strictly superior system at zero monthly cost.

# Bake & Grill — Loyverse Parity & Integration Enhancement Prompt

You are enhancing the **Bake & Grill** POS system — a Laravel 12 + React 18 monorepo for a Maldivian café. The system uses **Domain-Driven Design (DDD)** with event-driven architecture, state machines, DTOs, and repositories. This prompt closes feature gaps identified in a **Loyverse POS comparison** and adds critical integrations the system currently lacks.

---

## Project Structure

```
backend/                                  # Laravel 12 API
  app/
    Domains/                              # DDD bounded contexts (15 domains)
      Orders/
        Events/                           # OrderCreated, OrderPaid, OrderCompleted, OrderCancelled
        DTOs/                             # OrderCreatedData, OrderPaidData, OrderCompletedData, etc.
        Repositories/                     # OrderRepositoryInterface, EloquentOrderRepository
        Services/                         # OrderTotalsCalculator
        StateMachine/                     # OrderStateMachine
        Providers/                        # OrderServiceProvider
      Payments/
        Events/                           # PaymentConfirmed
        DTOs/                             # PaymentConfirmedData
        Gateway/                          # BmlConnectService
        Repositories/                     # PaymentRepositoryInterface, EloquentPaymentRepository
        Services/                         # PaymentService
        StateMachine/                     # PaymentStateMachine
        Providers/                        # PaymentServiceProvider
      Inventory/
        Listeners/                        # DeductInventoryListener (on OrderPaid)
        Repositories/                     # ItemRepositoryInterface, EloquentItemRepository
        Providers/                        # InventoryServiceProvider
      Loyalty/
        Listeners/                        # EarnPointsFromOrderListener, ConsumeLoyaltyHoldListener, ReleaseLoyaltyHoldListener
        Repositories/                     # LoyaltyAccount, LoyaltyHold, LoyaltyLedger, Customer repos
        Services/                         # LoyaltyLedgerService, PointsCalculator
        Providers/                        # LoyaltyServiceProvider
      Promotions/
        Listeners/                        # ConsumePromoRedemptionsListener, ReleasePromoReservationListener
        Repositories/                     # PromotionRepository, PromotionRedemptionRepository
        Services/                         # PromotionEvaluator
        Providers/                        # PromotionsServiceProvider
      Printing/
        Listeners/                        # DispatchKitchenPrintListener, DispatchReceiptPrintListener
        StateMachine/                     # PrintJobStateMachine
      KitchenDisplay/
        StateMachine/                     # KitchenTicketStateMachine
      Delivery/
        DTOs/                             # DeliveryDetails
        Services/                         # DeliveryFeeCalculator
      Notifications/
        DTOs/                             # SmsMessage
        Services/                         # SmsService, BulkSmsService
        Jobs/                             # SendSmsCampaignRecipientJob
      Reservations/
        Events/                           # ReservationCreated
        DTOs/                             # CreateReservationData, ReservationSlotData
        Listeners/                        # SendReservationConfirmationListener
        Repositories/                     # ReservationRepositoryInterface, EloquentReservationRepository
        Services/                         # ReservationService
        Providers/                        # ReservationServiceProvider
      Realtime/
        DTOs/                             # StreamEvent
        Services/                         # SseStreamService, OrderStreamProvider, KdsStreamProvider
      Shifts/
        StateMachine/                     # ShiftStateMachine
      Shared/
        Exceptions/                       # InvalidTransitionException
        Support/                          # StateMachine (abstract base)
        ValueObjects/                     # Money (immutable, integer laari)
    Http/
      Controllers/Api/                    # 39 API controllers
      Middleware/                          # EnsureActiveDevice, VerifyBmlSignature
      Requests/                           # 31 form request validation classes
    Models/                               # 57 Eloquent models
    Services/                             # 9 shared services
    Enums/                                # OrderStatus, OrderType, PaymentMethod, StockMovementType
    Policies/                             # 9 authorization policies
    Providers/
      Domains/DomainEventServiceProvider.php  # Central event→listener mapping
    Jobs/                                 # SendSmsPromotionRecipient, AutoCancelNoShowReservations
    Console/Commands/                     # ExpireLoyaltyHolds, ReconcileLoyaltyBalances
  config/
    bml.php                               # BML Connect payment gateway
    delivery.php                          # Zone-based delivery fees (Male, Hulhumale, etc.)
    opening_hours.php                     # Opening hours + special closures
    services.php                          # Dhiraagu SMS, print proxy, Slack
  database/migrations/                    # 86 migrations
  routes/api.php                          # All API routes (~512 lines, Sanctum auth)

apps/
  pos-web/                                # Staff POS terminal (React + offline queue)
  kds-web/                                # Kitchen Display System (React + SSE)
  online-order-web/                       # Customer ordering app (React + PWA)
  admin-dashboard/                        # Admin panel (React, 12 pages)

packages/shared/                          # Shared frontend packages
print-proxy/                              # Node.js ESC/POS thermal printer bridge
```

### Tech Stack
- **Backend:** PHP 8.2, Laravel 12, Sanctum 4, DomPDF
- **Frontend:** React 18, Vite, Tailwind CSS 4, React Router v6, TypeScript 5.3
- **Database:** MySQL/SQLite
- **Auth:** PIN-based (staff), OTP-based (customers), Sanctum tokens
- **Payments:** BML Connect (Bank of Maldives) — only gateway
- **SMS:** Dhiraagu API
- **Printing:** ESC/POS via Node.js print-proxy
- **Currency:** MVR (Maldivian Rufiyaa), Money value object stores integer laari
- **Testing:** PHPUnit 11, Vitest

### Existing Domain Events (already wired in `DomainEventServiceProvider`)

```php
// app/Providers/Domains/DomainEventServiceProvider.php
protected $listen = [
    OrderCreated::class => [DispatchKitchenPrintListener::class],
    OrderPaid::class => [
        DeductInventoryListener::class,
        DispatchReceiptPrintListener::class,
        ConsumePromoRedemptionsListener::class,
        ConsumeLoyaltyHoldListener::class,
    ],
    OrderCompleted::class => [EarnPointsFromOrderListener::class],
    OrderCancelled::class => [
        ReleasePromoReservationListener::class,
        ReleaseLoyaltyHoldListener::class,
    ],
    PaymentConfirmed::class => [/* fires OrderPaid when fully paid */],
    ReservationCreated::class => [SendReservationConfirmationListener::class],
];
```

### Event DTO Pattern (MUST follow for new events)

All events carry **readonly DTO classes** with only primitive IDs and scalars — never Eloquent models:

```php
// Example: app/Domains/Orders/DTOs/OrderCreatedData.php
readonly class OrderCreatedData {
    public function __construct(
        public int $orderId,
        public string $orderNumber,
        public string $orderType,
        public ?int $customerId,
        public float $total,
        public bool $printKitchen,
    ) {}

    public static function fromOrder(Order $order, bool $printKitchen = true): self { ... }
}

// Example: app/Domains/Orders/Events/OrderCreated.php
class OrderCreated {
    use Dispatchable, SerializesModels;
    public function __construct(public readonly OrderCreatedData $data) {}
}
```

### State Machine Pattern

```php
// Usage: OrderStateMachine::for($order)->transition('completed');
// Abstract base: app/Domains/Shared/Support/StateMachine.php
// Throws InvalidTransitionException on invalid transitions
```

### Existing Shared Services (in `app/Services/`)
- `OrderCreationService` — creates orders with items, modifiers, variants
- `InventoryDeductionService` — atomic, idempotent stock deduction on sale
- `StockManagementService` — availability status, low stock alerts via SMS
- `StockReservationService` — 3-minute cart holds
- `PrintJobService` / `PrintProxyService` — thermal receipt + kitchen printing
- `SmsService` — in `Domains/Notifications/Services/` (Dhiraagu gateway)
- `OpeningHoursService` — opening/closing time checks
- `AuditLogService` — audit trail for all mutations

### Existing Enums
- `OrderStatus`: pending, confirmed, preparing, ready, completed, cancelled, held
- `OrderType`: dine_in, takeaway, online_pickup
- `PaymentMethod`: cash, card, gift_card, wallet
- `StockMovementType`: purchase, adjustment, waste, recipe_usage, stock_count

---

## PHASE 1: EXTEND EVENT SYSTEM FOR WEBHOOKS

**Why:** The system already has a DDD event system with 6 events and 9 listeners. However, several business events that webhooks need are NOT yet dispatched (refunds, stock changes, shift events, customer creation). Add the missing events following the existing DTO pattern.

### Task 1.1: Add Missing Domain Events + DTOs

Create these in the appropriate domain directories, following the existing DTO-first pattern:

**`app/Domains/Orders/Events/OrderRefunded.php`** + DTO:
```php
// app/Domains/Orders/DTOs/OrderRefundedData.php
readonly class OrderRefundedData {
    public function __construct(
        public int $refundId,
        public int $orderId,
        public string $orderNumber,
        public float $amount,
        public string $reason,
    ) {}
    public static function fromRefund(Refund $refund): self { ... }
}
```

**`app/Domains/Inventory/Events/StockLevelChanged.php`** + DTO:
```php
// app/Domains/Inventory/DTOs/StockLevelChangedData.php
readonly class StockLevelChangedData {
    public function __construct(
        public int $itemId,
        public string $itemName,
        public float $oldQuantity,
        public float $newQuantity,
        public string $reason, // 'sale', 'adjustment', 'purchase', 'waste', 'stock_count'
    ) {}
}
```

**`app/Domains/Inventory/Events/LowStockReached.php`** + DTO:
```php
readonly class LowStockReachedData {
    public function __construct(
        public int $itemId,
        public string $itemName,
        public float $currentStock,
        public float $threshold,
    ) {}
}
```

**`app/Domains/Shifts/Events/ShiftOpened.php`** + **`ShiftClosed.php`** + DTOs:
```php
// app/Domains/Shifts/DTOs/ShiftOpenedData.php
readonly class ShiftOpenedData {
    public function __construct(
        public int $shiftId,
        public int $userId,
        public string $userName,
        public float $openingCash,
    ) {}
}

// app/Domains/Shifts/DTOs/ShiftClosedData.php
readonly class ShiftClosedData {
    public function __construct(
        public int $shiftId,
        public int $userId,
        public string $userName,
        public float $expectedCash,
        public float $actualCash,
        public float $variance,
        public int $orderCount,
        public float $totalRevenue,
    ) {}
}
```

**`app/Domains/Notifications/Events/CustomerCreated.php`** + DTO:
```php
readonly class CustomerCreatedData {
    public function __construct(
        public int $customerId,
        public string $phone,
        public ?string $name,
    ) {}
}
```

### Task 1.2: Dispatch New Events from Existing Code

Add `event()` dispatch calls at the appropriate points — do NOT refactor existing logic:

- **`RefundController::store()`** → dispatch `OrderRefunded` after refund is created
- **`InventoryDeductionService::deductForOrder()`** → dispatch `StockLevelChanged` for each deducted item
- **`InventoryController::adjust()`** → dispatch `StockLevelChanged` with reason 'adjustment'
- **`WasteLogController::store()`** → dispatch `StockLevelChanged` with reason 'waste'
- **`StockManagementService::triggerLowStockAlert()`** → dispatch `LowStockReached`
- **`ShiftController::open()`** → dispatch `ShiftOpened`
- **`ShiftController::close()`** → dispatch `ShiftClosed` with cash summary
- **`CustomerAuthController::verifyOtp()`** → dispatch `CustomerCreated` when a new customer is created

### Task 1.3: Register in DomainEventServiceProvider

Add the new events to `app/Providers/Domains/DomainEventServiceProvider.php`:

```php
// Add to existing $listen array:
OrderRefunded::class => [],           // webhook listener added in Phase 2
StockLevelChanged::class => [],       // webhook listener added in Phase 2
LowStockReached::class => [],         // webhook listener added in Phase 2
ShiftOpened::class => [],             // webhook listener added in Phase 2
ShiftClosed::class => [],             // webhook listener added in Phase 2
CustomerCreated::class => [],         // webhook listener added in Phase 2
```

---

## PHASE 2: GENERIC OUTGOING WEBHOOK SYSTEM

**Why:** Currently only BML payment webhooks (incoming) exist. A generic outgoing webhook system lets external tools (Zapier, Make, n8n, custom scripts) subscribe to business events — this is the #1 integration gap vs Loyverse.

### Task 2.1: Webhook Subscriptions

**New domain:** `app/Domains/Webhooks/`

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

**`app/Domains/Webhooks/Services/WebhookDispatchService.php`:**

```php
class WebhookDispatchService
{
    public function dispatch(string $event, array $payload): void
    {
        $subscriptions = WebhookSubscription::active()->forEvent($event)->get();

        foreach ($subscriptions as $sub) {
            DispatchWebhookJob::dispatch($sub, $event, $payload);
        }
    }
}
```

**`app/Domains/Webhooks/Jobs/DispatchWebhookJob.php`:**

```php
class DispatchWebhookJob implements ShouldQueue
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
            WebhookLog::create([
                'direction' => 'outgoing',
                'url' => $this->subscription->url,
                'event' => $this->event,
                'payload' => $this->payload,
                'response_code' => $response->status(),
                'response_body' => mb_substr($response->body(), 0, 2000),
            ]);
            throw new \RuntimeException("Webhook delivery failed: HTTP {$response->status()}");
        }

        $this->subscription->markSuccess();
    }
}
```

### Task 2.3: Webhook Dispatch Listener

**`app/Domains/Webhooks/Listeners/DispatchWebhookOnDomainEvent.php`:**

A single listener registered on ALL domain events. Maps each event class to a webhook event name and dispatches:

```php
class DispatchWebhookOnDomainEvent
{
    private const EVENT_MAP = [
        OrderCreated::class     => 'order.created',
        OrderPaid::class        => 'order.paid',
        OrderCompleted::class   => 'order.completed',
        OrderCancelled::class   => 'order.cancelled',
        OrderRefunded::class    => 'order.refunded',
        PaymentConfirmed::class => 'payment.confirmed',
        StockLevelChanged::class => 'stock.changed',
        LowStockReached::class  => 'stock.low',
        ShiftOpened::class      => 'shift.opened',
        ShiftClosed::class      => 'shift.closed',
        CustomerCreated::class  => 'customer.created',
        ReservationCreated::class => 'reservation.created',
    ];

    public function __construct(private WebhookDispatchService $webhooks) {}

    public function handle(object $event): void
    {
        $eventName = self::EVENT_MAP[get_class($event)] ?? null;
        if (!$eventName) return;

        // All domain events carry a public readonly DTO in ->data
        $payload = (array) $event->data;
        $this->webhooks->dispatch($eventName, $payload);
    }
}
```

Register this listener on every event in `DomainEventServiceProvider::$listen`.

### Task 2.4: Webhook Admin API

**Controller:** `app/Http/Controllers/Api/WebhookSubscriptionController.php`

```
GET    /api/admin/webhooks              → list all subscriptions
POST   /api/admin/webhooks              → create subscription (auto-generate secret via Str::random(64))
PATCH  /api/admin/webhooks/{id}         → update subscription
DELETE /api/admin/webhooks/{id}         → delete subscription
POST   /api/admin/webhooks/{id}/test    → send test payload to verify URL
POST   /api/admin/webhooks/{id}/enable  → re-enable after auto-disable
GET    /api/admin/webhooks/{id}/logs    → delivery logs for this subscription
```

### Task 2.5: Webhook Admin UI

In `apps/admin-dashboard/`, add a **Webhooks** page:
- Table: name, URL, events (badge chips), status, failure count, last triggered
- Create/edit modal: name, URL, event checkboxes, active toggle
- "Test" button sends sample payload and shows success/failure
- "Re-enable" button for auto-disabled subscriptions
- Expandable delivery log per subscription

### Supported Webhook Events (document in UI):

| Event | Trigger | Payload |
|-------|---------|---------|
| `order.created` | New order persisted | orderId, orderNumber, orderType, customerId, total |
| `order.paid` | Order fully paid | orderId, orderNumber, total |
| `order.completed` | Order bumped from KDS | orderId, orderNumber, completedAt |
| `order.cancelled` | Order cancelled | orderId, orderNumber, reason |
| `order.refunded` | Refund processed | refundId, orderId, orderNumber, amount, reason |
| `payment.confirmed` | BML payment confirmed | paymentId, orderId, amount, method |
| `stock.changed` | Stock adjusted (any reason) | itemId, itemName, oldQuantity, newQuantity, reason |
| `stock.low` | Stock drops below threshold | itemId, itemName, currentStock, threshold |
| `shift.opened` | Shift started | shiftId, userId, userName, openingCash |
| `shift.closed` | Shift ended | shiftId, userId, expectedCash, actualCash, variance, revenue |
| `customer.created` | New customer registered | customerId, phone, name |
| `reservation.created` | New reservation made | reservationId, customerName, date, time, partySize |

---

## PHASE 3: MISSING LOYVERSE FEATURES

These are features Loyverse has that Bake & Grill currently lacks.

### Task 3.1: Employee Clock-In / Clock-Out

**Why:** Loyverse charges $5/employee/month for this. Build it free.

**Migration:** `create_time_entries_table`

```php
Schema::create('time_entries', function (Blueprint $table) {
    $table->id();
    $table->foreignId('user_id')->constrained()->cascadeOnDelete();
    $table->timestamp('clock_in');
    $table->timestamp('clock_out')->nullable();
    $table->decimal('hours_worked', 6, 2)->nullable();     // calculated on clock-out
    $table->unsignedInteger('break_minutes')->default(0);  // manual break deduction
    $table->text('notes')->nullable();
    $table->timestamps();
    $table->index(['user_id', 'clock_in']);
});
```

**Controller:** `TimeClockController`

```
POST   /api/staff/clock-in             → clock in (reject if already clocked in)
POST   /api/staff/clock-out            → clock out + calculate hours
GET    /api/staff/clock-status         → current clock status for authenticated user
GET    /api/admin/time-entries         → list entries (filter: user_id, start_date, end_date)
GET    /api/admin/time-entries/summary → hours summary per employee per period
PATCH  /api/admin/time-entries/{id}    → admin correction (adjust times, add notes)
GET    /api/admin/time-entries/csv     → CSV export
```

**Logic:**
- `clock_in`: Check no open entry (clock_out IS NULL) exists for this user. Create new entry with clock_in = now().
- `clock_out`: Find open entry, set clock_out = now(), calculate `hours_worked = (clock_out - clock_in) / 3600 - break_minutes / 60`.
- `summary`: Group by user_id, sum hours_worked for date range. Include scheduled hours from `StaffSchedule` for comparison.

**POS UI (`apps/pos-web/`):**
- Add clock in/out button to staff header bar (visible after PIN login)
- Show "Clocked in since HH:MM" or "Not clocked in" indicator
- Green dot for clocked-in staff in the header

**Admin Dashboard (`apps/admin-dashboard/`):**
- New "Time Clock" page under Staff section
- Table with date range filter, per-employee grouping
- Scheduled vs actual hours comparison
- CSV export button

### Task 3.2: Tax Summary Report

**Why:** Tax is calculated per order (`tax_amount` column on `orders`, tax on `order_items`), but there's no aggregated tax report for GST filing.

**Add to `ReportsController`:**

```php
public function taxReport(Request $request): JsonResponse
{
    $request->validate([
        'start_date' => 'required|date',
        'end_date'   => 'required|date|after_or_equal:start_date',
        'group_by'   => 'in:day,week,month',
    ]);

    $start = Carbon::parse($request->start_date)->startOfDay();
    $end = Carbon::parse($request->end_date)->endOfDay();

    $dateFormat = match ($request->input('group_by', 'day')) {
        'day'   => '%Y-%m-%d',
        'week'  => '%x-W%v',
        'month' => '%Y-%m',
    };

    $taxByPeriod = Order::whereBetween('created_at', [$start, $end])
        ->whereNotIn('status', ['cancelled'])
        ->selectRaw("DATE_FORMAT(created_at, ?) as period, SUM(tax_amount) as total_tax, COUNT(*) as order_count, SUM(total) as total_revenue", [$dateFormat])
        ->groupBy('period')
        ->orderBy('period')
        ->get();

    $taxByCategory = OrderItem::join('orders', 'order_items.order_id', '=', 'orders.id')
        ->join('items', 'order_items.item_id', '=', 'items.id')
        ->join('categories', 'items.category_id', '=', 'categories.id')
        ->whereBetween('orders.created_at', [$start, $end])
        ->whereNotIn('orders.status', ['cancelled'])
        ->selectRaw('categories.name as category, SUM(order_items.tax) as tax_total')
        ->groupBy('categories.name')
        ->get();

    return response()->json([
        'period' => ['start' => $start->toDateString(), 'end' => $end->toDateString()],
        'total_tax_collected' => $taxByPeriod->sum('total_tax'),
        'net_tax_payable' => $taxByPeriod->sum('total_tax'),
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

**Admin Dashboard:** Add "Tax Report" tab to Reports page:
- Summary cards: total tax collected, net payable
- Line chart of tax by period
- Category breakdown table
- CSV export button

### Task 3.3: Sales Trend Comparison

**Why:** Loyverse shows growth/decline vs previous period. The existing `salesSummary` shows absolute numbers only.

**Add to `ReportsController`:**

```php
public function salesTrend(Request $request): JsonResponse
{
    $request->validate([
        'period' => 'required|in:day,week,month',
        'date'   => 'required|date',
    ]);

    $date = Carbon::parse($request->date);
    $period = $request->period;

    $current = $this->aggregateSales($date, $period);
    $previous = $this->aggregateSales($this->previousPeriodDate($date, $period), $period);

    return response()->json([
        'current' => $current,
        'previous' => $previous,
        'change' => [
            'revenue'         => $this->pctChange($previous['revenue'], $current['revenue']),
            'orders'          => $this->pctChange($previous['orders'], $current['orders']),
            'avg_order_value' => $this->pctChange($previous['avg_order_value'], $current['avg_order_value']),
            'customers'       => $this->pctChange($previous['customers'], $current['customers']),
        ],
    ]);
}

private function pctChange(float $old, float $new): ?float
{
    if ($old == 0) return $new > 0 ? 100.0 : null;
    return round((($new - $old) / $old) * 100, 1);
}
```

**Route:** `GET /api/reports/sales-trend`

**Admin Dashboard:** Add trend indicators (green ▲ / red ▼ with %) to sales dashboard metric cards.

### Task 3.4: Barcode Label Printing

**Why:** Loyverse prints barcode labels for inventory items. Useful for packaged goods.

**Install:** `composer require picqer/php-barcode-generator`

**Controller:** `BarcodeLabelController`

```
POST /api/admin/barcode-labels/generate   → returns PDF
```

**Request body:**
```json
{
  "items": [
    { "item_id": 1, "quantity": 5 },
    { "item_id": 2, "quantity": 10 }
  ],
  "label_size": "38x25",
  "include_price": true,
  "include_name": true
}
```

**Logic:**
- Use `barryvdh/laravel-dompdf` (already installed) to generate PDF
- Use `picqer/php-barcode-generator` for Code 128 barcode SVGs
- Each label: item name (optional), barcode image, price in MVR (optional)
- Layout labels in a grid matching the selected label sheet size
- Return PDF for download/print

### Task 3.5: Customer Notes Field

**Why:** Loyverse allows allergy/preference notes on customers. Currently missing.

**Migration:** `add_notes_to_customers_table`

```php
Schema::table('customers', function (Blueprint $table) {
    $table->text('notes')->nullable()->after('delivery_address');
});
```

**Updates:**
- `Customer` model — add `'notes'` to `$fillable`
- `CustomerController::update()` — accept `notes` field
- Admin customer list — show truncated notes, full in detail view
- POS — when a customer is attached to an order, show a notes banner if notes exist (allergy warnings)

### Task 3.6: Partial Purchase Receiving

**Why:** Loyverse Advanced Inventory ($25/mo) supports partial shipment receiving. Currently purchases go straight to "received".

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
POST /api/purchases/{id}/receive    → receive items (partial or full)
GET  /api/purchases/{id}/receivings → list all receivings for a purchase
```

**Logic:**
- Accept array of `{ purchase_item_id, quantity }` for each item being received
- Wrap in `DB::transaction()`
- Update `purchase_items.received_quantity += quantity` (validate doesn't exceed ordered quantity)
- Create `PurchaseReceiving` + `PurchaseReceivingItem` records
- Update inventory stock via `StockMovement` (type: purchase)
- Set purchase status: all items fully received → 'received', some → 'partial'
- Dispatch `StockLevelChanged` event for each received item

**Admin UI:**
- Purchase detail page shows ordered vs received columns
- "Receive Items" button opens modal with remaining quantities pre-filled
- Receiving history timeline on purchase detail

---

## PHASE 4: ACCOUNTING & FINANCIAL INTEGRATIONS

### Task 4.1: Xero Integration (OAuth 2.0)

**Why:** #1 integration request for small businesses. Auto-sync sales to Xero eliminates manual bookkeeping.

**Install:** `composer require xeroapi/xero-php-oauth2`

**New domain:** `app/Domains/Integrations/`

**Config:** `config/xero.php`

```php
return [
    'client_id'     => env('XERO_CLIENT_ID'),
    'client_secret' => env('XERO_CLIENT_SECRET'),
    'redirect_uri'  => env('XERO_REDIRECT_URI', env('APP_URL') . '/api/admin/integrations/xero/callback'),
    'scopes'        => 'openid profile email accounting.transactions accounting.contacts',
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
    $table->json('settings')->nullable();    // account mappings, sync preferences
    $table->boolean('active')->default(true);
    $table->foreignId('connected_by')->constrained('users');
    $table->timestamps();
});
```

**Service:** `app/Domains/Integrations/Services/XeroIntegrationService.php`

```php
class XeroIntegrationService
{
    // OAuth flow
    public function getAuthorizationUrl(): string;
    public function handleCallback(string $code): IntegrationConnection;
    public function refreshTokenIfNeeded(IntegrationConnection $conn): void;

    // Sync operations
    public function syncDailySales(Carbon $date): void;
    // Creates a single Xero invoice per day with line items grouped by category

    public function syncRefund(Refund $refund): void;
    // Creates a Xero credit note

    public function syncPurchase(Purchase $purchase): void;
    // Creates a Xero bill from supplier purchase

    // Helpers
    public function getXeroAccounts(): array;  // chart of accounts for mapping UI
    public function getTaxRates(): array;       // tax rates for mapping UI
}
```

**Controller:** `XeroIntegrationController`

```
GET    /api/admin/integrations/xero/connect     → redirect to Xero OAuth
GET    /api/admin/integrations/xero/callback     → handle OAuth callback
DELETE /api/admin/integrations/xero/disconnect   → revoke and delete connection
GET    /api/admin/integrations/xero/status       → connection status + last sync
POST   /api/admin/integrations/xero/sync         → manual sync trigger
GET    /api/admin/integrations/xero/accounts     → fetch Xero accounts for mapping
PATCH  /api/admin/integrations/xero/settings     → save account mappings
```

**Settings mapping (stored in `integration_connections.settings`):**
```json
{
    "sales_account": "200",
    "cash_account": "100",
    "card_account": "101",
    "bml_account": "102",
    "tax_rate": "GST on Income",
    "purchase_account": "300",
    "auto_sync": true
}
```

**Event listener:** Create `app/Domains/Integrations/Listeners/SyncSalesToXeroListener.php` — listens to `ShiftClosed`, queues a `SyncDailySalesToXeroJob` if Xero is connected with auto_sync enabled.

**Admin Dashboard:**
- Integrations page with Xero card
- "Connect to Xero" button → OAuth flow
- Account mapping dropdowns
- Last sync status + manual sync button

### Task 4.2: Integration Hub Page

**Admin Dashboard:** Create `/admin/integrations`:

```
┌──────────────────────────────────────────────────────────────┐
│  Integrations                                                 │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │  Xero        │  │  Webhooks    │  │  Payments    │        │
│  │  Connected   │  │  3 active    │  │  BML Connect │        │
│  │  [Settings]  │  │  [Manage]    │  │  [Settings]  │        │
│  └──────────────┘  └──────────────┘  └──────────────┘        │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐                          │
│  │  SMS         │  │  Printing    │                          │
│  │  Dhiraagu    │  │  Print Proxy │                          │
│  │  [Settings]  │  │  [Settings]  │                          │
│  └──────────────┘  └──────────────┘                          │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

---

## PHASE 5: MULTI-STORE FOUNDATION (OPTIONAL/STRETCH)

**Why:** Loyverse supports multiple locations for free. Laying the database foundation now avoids a painful refactor later.

### Task 5.1: Store Model + Schema

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

**Seed** a default store with values from existing config.

**Add nullable `store_id` foreign keys** (default = 1) to: `orders`, `shifts`, `inventory_items`, `devices`, `printers`, `restaurant_tables`.

**Create `store_user` pivot** for staff-to-store assignments.

**DO NOT** refactor queries. Just add columns and model. Multi-store filtering is a future task.

---

## PHASE 6: PAYMENT REDUNDANCY

### Task 6.1: Stripe Payment Gateway

**Why:** BML Connect is Maldives-only. Stripe enables international card payments (tourists).

**Install:** `composer require stripe/stripe-php`

**New domain files:** `app/Domains/Payments/Gateway/StripeConnectService.php` (follow BmlConnectService pattern)

**Config:** `config/stripe.php`

```php
return [
    'secret_key'      => env('STRIPE_SECRET_KEY'),
    'publishable_key' => env('STRIPE_PUBLISHABLE_KEY'),
    'webhook_secret'  => env('STRIPE_WEBHOOK_SECRET'),
    'currency'        => env('STRIPE_CURRENCY', 'usd'),
];
```

**Service:** `app/Domains/Payments/Gateway/StripeConnectService.php`

```php
class StripeConnectService
{
    public function createPaymentIntent(Order $order, string $currency = 'usd'): array;
    // Returns ['client_secret' => '...', 'payment_intent_id' => '...']

    public function handleWebhook(Request $request): void;
    // Verify signature, handle payment_intent.succeeded → dispatch PaymentConfirmed

    public function refund(Payment $payment, float $amount): array;
    // Create Stripe refund
}
```

**Controller:** `StripePaymentController`

```
POST /api/orders/{orderId}/pay/stripe    → create PaymentIntent
POST /api/payments/stripe/webhook        → handle Stripe webhooks (signature verified, no auth)
```

**Frontend (`apps/online-order-web/`):**
- Add `@stripe/stripe-js` and `@stripe/react-stripe-js` packages
- Add Stripe Elements (card input) as alternative to BML on checkout page
- Show gateway selector when both are enabled

**Add `PaymentMethod` enum value:** `stripe`

### Task 6.2: Payment Gateway Admin Settings

In admin Integrations page, add Payments section:
- Toggle BML on/off
- Toggle Stripe on/off (show publishable key input)
- Default gateway selector
- Test connection buttons

---

## PHASE 7: OPERATIONAL POLISH

### Task 7.1: Weight Barcode Support

**Update `ItemController::lookupByBarcode()`:**

```php
public function lookupByBarcode(string $barcode): JsonResponse
{
    // GS1 weight barcode: 13 digits starting with '2'
    // Format: 2XPPPPWWWWWC (P=product, W=weight in grams, C=check)
    if (strlen($barcode) === 13 && str_starts_with($barcode, '2')) {
        $productCode = substr($barcode, 2, 5);
        $weightGrams = (int) substr($barcode, 7, 5);
        $weightKg = $weightGrams / 1000;

        $item = Item::where('barcode', 'LIKE', "__" . $productCode . "%")->first();
        if ($item) {
            return response()->json([
                'item' => $item,
                'weight' => $weightKg,
                'calculated_price' => round($item->price * $weightKg, 2),
                'weight_barcode' => true,
            ]);
        }
    }

    // Standard lookup (existing logic)
    $item = Item::where('barcode', $barcode)->firstOrFail();
    return response()->json(['item' => $item, 'weight_barcode' => false]);
}
```

**POS UI:** When weight barcode detected, auto-set quantity and show calculated price.

### Task 7.2: Customer Display (Second Screen)

**Create `/customer-display` page** in `apps/pos-web/`:
- Connects to existing SSE stream `/api/stream/orders`
- Shows current order line items + running total as items are added
- Shows final total + payment status
- Idle state: branded welcome screen or daily specials rotation
- Full-screen optimized for secondary monitor/tablet
- No backend changes needed — purely frontend consuming existing SSE

### Task 7.3: Expiry Date Alerts

**Scheduled command:** `app/Console/Commands/CheckExpiringItems.php`

```php
class CheckExpiringItems extends Command
{
    protected $signature = 'inventory:check-expiry';

    public function handle(): void
    {
        $expiringSoon = InventoryItem::whereNotNull('expiry_date')
            ->whereBetween('expiry_date', [now(), now()->addDays(7)])
            ->where('current_stock', '>', 0)
            ->get();

        $expired = InventoryItem::whereNotNull('expiry_date')
            ->where('expiry_date', '<', now())
            ->where('current_stock', '>', 0)
            ->get();

        if ($expiringSoon->isNotEmpty() || $expired->isNotEmpty()) {
            // Send SMS alert to admin via SmsService
            // Log via AuditLogService
        }
    }
}
```

**Schedule:** `Schedule::command('inventory:check-expiry')->dailyAt('06:00');` in `routes/console.php`

**Admin Dashboard:** Show expiry warning badges on inventory page.

### Task 7.4: Offline Mode Robustness

**In `apps/pos-web/`** (which already has `offlineQueue.ts`):
- Upgrade to IndexedDB storage (add `idb` or `localforage` package)
- Detect network: `navigator.onLine` + periodic `/api/health` ping
- Offline mode:
  - Show offline banner at top
  - Queue orders locally with timestamps + device ID
  - Cash payments only (disable BML/Stripe buttons)
  - Auto-sync via `/api/orders/sync` when back online
- Online mode:
  - Show sync progress indicator
  - Handle conflicts (stock depleted while offline)
- Show `last_synced_at` timestamp in POS footer

---

## PHASE 8: ADMIN DASHBOARD HOME PAGE

**Why:** Admin dashboard needs an at-a-glance overview (like Loyverse's dashboard).

**Route:** `/admin/dashboard` (default landing page)

**Layout:**
```
┌──────────────────────────────────────────────────────────────────┐
│  Dashboard                                          [Today v]    │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐    │
│  │ Revenue    │ │ Orders     │ │ Avg Order  │ │ Customers  │    │
│  │ MVR 4,230  │ │ 47         │ │ MVR 90     │ │ 23         │    │
│  │ +12%       │ │ +5%        │ │ -3%        │ │ +8%        │    │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘    │
│                                                                  │
│  ┌───────────────────────────────┐ ┌────────────────────────┐    │
│  │ Revenue (7 days line chart)   │ │ Top Selling Items      │    │
│  │                               │ │ 1. Chicken Burger (42) │    │
│  │                               │ │ 2. Fish & Chips   (38) │    │
│  │                               │ │ 3. Iced Coffee    (35) │    │
│  └───────────────────────────────┘ └────────────────────────┘    │
│                                                                  │
│  ┌───────────────────────────────┐ ┌────────────────────────┐    │
│  │ Low Stock Alerts              │ │ Recent Orders          │    │
│  │ Chicken Breast  (2 left)      │ │ #047  MVR 120  Paid    │    │
│  │ Lettuce         (1 left)      │ │ #046  MVR 85   Paid    │    │
│  └───────────────────────────────┘ └────────────────────────┘    │
│                                                                  │
│  ┌───────────────────────────────┐ ┌────────────────────────┐    │
│  │ Staff On Duty                 │ │ Upcoming Reservations  │    │
│  │ Ahmed (since 08:00)           │ │ 12:30 Table 3 (4 pax)  │    │
│  │ Fathimath (since 09:00)       │ │ 13:00 Table 5 (2 pax)  │    │
│  └───────────────────────────────┘ └────────────────────────┘    │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

**Data sources:**
- Revenue + orders: `GET /api/reports/sales-summary`
- Trends: `GET /api/reports/sales-trend` (Phase 3)
- Top items: `GET /api/reports/sales-breakdown?group_by=item`
- Low stock: `GET /api/inventory/low-stock`
- Recent orders: `GET /api/orders?per_page=5`
- Staff on duty: `GET /api/admin/time-entries?status=clocked_in` (Phase 3)
- Reservations: `GET /api/admin/reservations?date=today`

Use a lightweight chart library (e.g. `recharts` — already common in React ecosystems).

---

## IMPLEMENTATION RULES

1. **Follow the existing DDD architecture:**
   - New events go in `app/Domains/{Domain}/Events/` with matching DTOs in `app/Domains/{Domain}/DTOs/`
   - New listeners go in `app/Domains/{Domain}/Listeners/`
   - New services go in `app/Domains/{Domain}/Services/`
   - New service providers go in `app/Domains/{Domain}/Providers/`
   - Register all event-listener mappings in `app/Providers/Domains/DomainEventServiceProvider.php`
   - All event DTOs must be `readonly` classes carrying only primitives — never Eloquent models
   - Use the existing `StateMachine` base class for any new state transitions

2. **Follow existing controller conventions:**
   - Controllers return `JsonResponse`
   - Use Sanctum `auth:sanctum` middleware for protected routes
   - Use Form Request classes for complex validation (in `app/Http/Requests/`)
   - Use `DB::transaction()` for multi-step mutations
   - Audit log all mutations via `AuditLogService`

3. **Follow existing model conventions:**
   - Models use `$fillable` arrays, not `$guarded`
   - Use `$casts` for type casting
   - Use query scopes (`scopeActive()`, etc.)

4. **Money:** Use the `Money` value object (`app/Domains/Shared/ValueObjects/Money.php`) for financial calculations. Store amounts as integer laari internally. The existing codebase uses floats in some places — match whatever pattern the surrounding code uses.

5. **Database:** MySQL-compatible SQL. All migrations must include `down()` method.

6. **Testing:** Write Feature tests for new API endpoints. Follow existing test patterns.

7. **Frontend:** React 18 + Tailwind CSS 4 + React Router v6. No new CSS frameworks. Match existing component patterns in each app.

8. **Security:** Validate all input. HMAC-sign outgoing webhooks. Verify incoming webhook signatures. Rate-limit public endpoints. Sanitize user-provided URLs.

9. **Queue:** Use Laravel queue for async work (webhook dispatch, Xero sync, SMS). `QUEUE_CONNECTION=database` default.

10. **No breaking changes** to existing API contracts. All new features are additive.

---

## PRIORITY ORDER

| Priority | Phase | Effort | Business Impact |
|----------|-------|--------|-----------------|
| P0 | Phase 1: Extend Event System | 2-3 hrs | Foundation for webhooks |
| P0 | Phase 2: Outgoing Webhook System | 4-6 hrs | Enables all integrations |
| P1 | Phase 3: Missing Loyverse Features | 6-8 hrs | Feature parity |
| P1 | Phase 8: Admin Dashboard Home | 4-6 hrs | Usability |
| P2 | Phase 4: Xero Integration | 6-8 hrs | Accounting automation |
| P2 | Phase 6: Stripe Gateway | 4-6 hrs | Payment redundancy |
| P3 | Phase 7: Operational Polish | 4-6 hrs | Quality of life |
| P3 | Phase 5: Multi-Store Foundation | 2-3 hrs | Future-proofing |

**Total: ~35-45 hours**

---

## WHAT SUCCESS LOOKS LIKE

After all phases:

1. External tools subscribe to 12 business events via HMAC-signed webhooks
2. Sales auto-sync to Xero — no manual bookkeeping
3. Stripe as backup payment gateway for international cards
4. Staff clock in/out with hours tracking and scheduled vs actual comparison
5. Tax summary report for GST filing with CSV export
6. Sales trend comparison with previous period (%, arrows)
7. Barcode label printing (PDF generation) for retail items
8. Customer notes for allergies/preferences shown at POS
9. Partial purchase receiving for supplier shipments
10. Weight barcode scanning for items sold by weight
11. Customer-facing display screen via existing SSE infrastructure
12. Expiry date alerts via scheduled command + SMS
13. Robust offline mode with IndexedDB queue
14. Admin dashboard with at-a-glance business metrics + charts
15. Multi-store database foundation ready for expansion

**Complete Loyverse parity + online ordering, delivery, SMS campaigns, gift cards, reviews, forecasting, LTV analytics — strictly superior at zero monthly cost.**

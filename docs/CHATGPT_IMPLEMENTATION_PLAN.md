# Bake & Grill — Full Backend Rebuild Plan (v3 — Patched)
## For ChatGPT / Cursor (Principal Laravel 12 Architect)

> **Patch applied Feb 2026:** Promo redemption deferred to OrderPaid. Loyalty hold/reservation mechanism added. Deterministic stacking + tax + rounding rules defined. Exclusion targets added to promotions. Auth middleware clarified. Audit hooks specified.

---

## MISSION

Deliver a **perfect, production-grade Modular Monolith** rebuild/refactor under `backend/app/Domains` with strict boundaries, idempotency, state machines, after-commit queued side effects, comprehensive tests, a clean BML payment gateway integration, a full **Promotions/Discount Engine**, and a **Loyalty Program** — **WITHOUT breaking any existing production endpoints**.

---

## NON-NEGOTIABLES

1. **DO NOT break any existing endpoints.** Preserve ALL route paths and request/response payload shapes.
2. One Laravel app + one DB (no microservices).
3. BML webhook/return URLs must be stable and NOT dependent on locale/session.
4. Routes only route. Controllers thin. Business logic lives in Domain Actions/Services.
5. Refactor/build in safe commits, but complete end-to-end (no half-done unstable states).
6. No secrets committed. `.env` gitignored. Only `.env.example` placeholders.
7. **DO NOT move Eloquent model classes out of `App\Models`** (polymorphic strings/morph maps risk). Domain folders may contain traits, scopes, value objects, DTOs — Eloquent models stay in `App\Models`.

---

## IMPORTANT REALITY

- Many PHP files may be minified/one-line. **Fix formatting with Laravel Pint BEFORE structural changes.**
- The backend already handles: staff PIN, customer OTP, device gating, orders + payment recording, KDS lifecycle, print-proxy, inventory/suppliers/purchasing, shifts/cash, reports/CSV, receipts (token view/resend/feedback), promotions/SMS, refunds, plus web routes.

---

## REPO STRUCTURE (current)

```
/backend
  app/
    Http/Controllers/
      Api/
        Auth/
          StaffAuthController.php
          CustomerAuthController.php
          DeviceController.php
        CashMovementController.php
        CategoryController.php
        CustomerController.php
        InventoryController.php
        ItemController.php
        KdsController.php
        OrderController.php
        PrintJobController.php
        PurchaseController.php
        ReceiptController.php
        RefundController.php
        ReportsController.php
        ShiftController.php
        SmsPromotionController.php
        SupplierController.php
        TableController.php
      CustomerPortalController.php
      HomeController.php
      ImageThumbController.php
      MenuAdminController.php
      PreOrderController.php
      ReceiptPageController.php
    Services/
      AuditLogService.php
      InventoryDeductionService.php
      OpeningHoursService.php
      OrderCreationService.php
      PrintJobService.php
      PrintProxyService.php
      SmsService.php
      StockManagementService.php
      StockReservationService.php
    Models/   ← KEEP ALL MODELS HERE, NEVER MOVE THEM
  routes/
    api.php
    web.php
  database/migrations/
  config/
  tests/
```

---

## CURRENT API ROUTES (DO NOT CHANGE PATHS OR PAYLOADS)

### Public routes
```
GET  /api/health
GET  /api/opening-hours/status
GET  /api/categories
GET  /api/categories/{id}
GET  /api/items
GET  /api/items/{id}
GET  /api/items/barcode/{barcode}
POST /api/items/stock-check               body: { item_ids: [1,2,3] }
GET  /api/receipts/{token}
POST /api/receipts/{token}/resend         throttle:5,10
POST /api/receipts/{token}/feedback       throttle:10,10
POST /api/customer/sms/opt-out
```

### Staff auth (no token)
```
POST /api/auth/staff/pin-login            throttle:10,1
POST /api/auth/customer/otp/request       throttle:5,10
POST /api/auth/customer/otp/verify        throttle:10,10
```

### Protected — auth:sanctum
```
POST   /api/auth/logout
GET    /api/auth/me
POST   /api/devices/register              middleware: can:device.manage, throttle:10,1
GET    /api/devices
PATCH  /api/devices/{id}/disable
PATCH  /api/devices/{id}/enable
POST   /api/orders                        middleware: device.active
POST   /api/orders/sync                   middleware: device.active
GET    /api/orders/{id}
POST   /api/orders/{id}/hold
POST   /api/orders/{id}/resume
POST   /api/orders/{id}/payments
GET    /api/kds/orders
POST   /api/kds/orders/{id}/start
POST   /api/kds/orders/{id}/bump
POST   /api/kds/orders/{id}/recall
GET    /api/print-jobs
POST   /api/print-jobs/{id}/retry
GET    /api/inventory
POST   /api/inventory
GET    /api/inventory/{id}
PATCH  /api/inventory/{id}
POST   /api/inventory/{id}/adjust
POST   /api/inventory/stock-count
GET    /api/inventory/low-stock
GET    /api/inventory/{id}/price-history
GET    /api/inventory/{id}/cheapest-supplier
GET    /api/suppliers
POST   /api/suppliers
GET    /api/suppliers/{id}
PATCH  /api/suppliers/{id}
DELETE /api/suppliers/{id}
GET    /api/purchases
POST   /api/purchases
GET    /api/purchases/{id}
PATCH  /api/purchases/{id}
POST   /api/purchases/{id}/receipts
POST   /api/purchases/import
GET    /api/shifts/current
POST   /api/shifts/open
POST   /api/shifts/{id}/close
POST   /api/shifts/{id}/cash-movements
GET    /api/reports/sales-summary
GET    /api/reports/sales-breakdown
GET    /api/reports/x-report
GET    /api/reports/z-report
GET    /api/reports/inventory-valuation
GET    /api/reports/sales-summary/csv
GET    /api/reports/sales-breakdown/csv
GET    /api/reports/x-report/csv
GET    /api/reports/z-report/csv
GET    /api/reports/inventory-valuation/csv
GET    /api/tables
POST   /api/tables
PATCH  /api/tables/{id}
POST   /api/tables/{id}/open              middleware: device.active
POST   /api/tables/{tableId}/orders/{orderId}/items  middleware: device.active
POST   /api/tables/{id}/close
POST   /api/tables/merge
POST   /api/tables/{id}/split
POST   /api/receipts/{orderId}/send
GET    /api/refunds
GET    /api/refunds/{id}
POST   /api/orders/{orderId}/refunds
GET    /api/sms/promotions
GET    /api/sms/promotions/{id}
POST   /api/sms/promotions/preview        throttle:10,5
POST   /api/sms/promotions/send           throttle:5,60
```

### Protected — customer prefix (auth:sanctum)
```
GET   /api/customer/me
GET   /api/customer/orders
POST  /api/customer/orders
PATCH /api/customer/profile
```

### Protected — menu management (auth:sanctum)
```
POST   /api/categories
PATCH  /api/categories/{id}
DELETE /api/categories/{id}
POST   /api/items
GET    /api/items/{id}/recipe
PATCH  /api/items/{id}
DELETE /api/items/{id}
PATCH  /api/items/{id}/toggle-availability
```

### Web routes (Blade views — DO NOT TOUCH)
```
GET  /thumb/{path}
GET  /dashboard
GET  /admin
GET  /
GET  /menu
GET  /contact
GET  /hours
GET  /privacy
GET  /customer/login
POST /customer/request-otp
POST /customer/verify-otp
POST /customer/logout
GET  /order-type
GET  /checkout
GET  /pre-order
POST /pre-order
GET  /pre-order/{id}/confirmation
GET  /receipts/{token}
GET  /receipts/{token}/pdf
POST /receipts/{token}/feedback
POST /receipts/{token}/resend
```

### NEW routes to ADD (BML — no collision with existing)
```
POST /api/payments/bml/webhook     ← BML calls this (no auth, verify signature)
GET  /payments/bml/return          ← customer lands here after BML page
GET  /api/system/health            ← internal health check (protected or IP-restricted)
```

### NEW routes to ADD (Promotions — additive, no collision)
```
# Public / customer — throttle:20,1
POST /api/promotions/validate
     auth: none (or auth:sanctum optional)
     body: { code, subtotal_laar, channel, item_ids[], category_ids[] }
     → discount preview; does NOT consume usage

# Staff + customer (auth:sanctum) — order must belong to requester
POST /api/orders/{id}/apply-promo
     auth: auth:sanctum
     body: { code }
     → draft-attaches promo to order (order_promotions pivot); does NOT create redemption row

DELETE /api/orders/{id}/promo/{promotionId}
     auth: auth:sanctum
     → removes draft promo from order

# Admin (staff) — auth:sanctum + can:admin.promotions
GET    /api/admin/promotions
PATCH  /api/admin/promotions/{id}
POST   /api/admin/promotions
GET    /api/admin/promotions/{id}
DELETE /api/admin/promotions/{id}
GET    /api/admin/promotions/{id}/redemptions
GET    /api/admin/reports/promotions              ← promo redemption report
```

### NEW routes to ADD (Loyalty — additive, correct auth)
```
# Customer — auth:sanctum (customer token)
GET    /api/loyalty/me                            ← points balance + tier + recent ledger
POST   /api/loyalty/hold-preview                  ← draft order → required points/discount preview
POST   /api/loyalty/hold                          ← create or refresh hold for an order
DELETE /api/loyalty/hold/{orderId}                ← manually release hold

# Admin (staff) — auth:sanctum + can:admin.loyalty
POST   /api/admin/loyalty/adjust                  ← manual points adjustment
GET    /api/admin/loyalty/ledger                  ← filterable ledger view
GET    /api/admin/loyalty/accounts                ← all accounts with balances
GET    /api/admin/loyalty/accounts/{customerId}   ← single customer ledger
GET    /api/admin/reports/loyalty                 ← loyalty earned/redeemed report
```

---

## EXISTING SERVICES (to be wrapped by Domain Actions)

```
app/Services/OrderCreationService.php       → Domains/Orders/Actions/CreateOrderAction
app/Services/PrintJobService.php            → Domains/Printing/Actions/
app/Services/PrintProxyService.php          → Domains/Printing/Services/PrintProxyClient
app/Services/SmsService.php                 → Domains/Notifications/Channels/SmsNotifier
app/Services/InventoryDeductionService.php  → Domains/Inventory/Services/
app/Services/StockManagementService.php     → Domains/Inventory/Services/
app/Services/StockReservationService.php    → Domains/Inventory/Services/
app/Services/AuditLogService.php            → Domains/Audit/Services/
app/Services/OpeningHoursService.php        → Domains/Shared/Support/
```

Keep old services as thin wrappers calling the new Domain Actions until contract tests confirm parity. Then delete.

---

## PHASE 0 — AUDIT & FREEZE API CONTRACT

### 0.1 Create `backend/ARCHITECTURE_AUDIT.md`
Write this BEFORE changing any behaviour. Include:
- Full route catalog (path, method, middleware/auth)
- Controller + service used per route
- Critical flows: order create/totals, payment recording, order completion, printing payload, receipt generation/resend, inventory deduction/reservation, KDS bump/recall, shifts/cash, reports, promotions, refunds
- Coupling hotspots and risks
- Representative request/response payload examples extracted from controller code

### 0.2 Contract tests — golden snapshots

Create `backend/tests/Contracts/`.

**`tests/Contracts/SnapshotHelper.php`:**
```php
<?php
namespace Tests\Contracts;

trait SnapshotHelper
{
    protected function assertMatchesSnapshot(string $key, array $actual): void
    {
        $path = base_path("tests/Contracts/snapshots/{$key}.json");
        $normalized = $this->normalize($actual);

        if (!file_exists($path)) {
            @mkdir(dirname($path), 0755, true);
            file_put_contents($path, json_encode($normalized, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
            $this->assertTrue(true, "Snapshot created: {$key}");
            return;
        }

        $expected = json_decode(file_get_contents($path), true);
        $this->assertEquals($expected, $normalized, "Snapshot mismatch: {$key}");
    }

    private function normalize(array $data): array
    {
        array_walk_recursive($data, function (&$value, $key) {
            $dynamic = [
                'id', 'created_at', 'updated_at', 'token', 'confirmed_at',
                'paid_at', 'failed_at', 'initiated_at', 'expires_at',
                'access_token', 'plain_token', 'signature', 'nonce',
            ];
            if (in_array($key, $dynamic, true)) {
                $value = '__NORMALIZED__';
            }
        });
        return $data;
    }
}
```

**Minimum 15–25 contract tests covering:**
- `GET /api/health`
- `GET /api/categories` (public menu)
- `GET /api/items`
- `POST /api/auth/staff/pin-login`
- `POST /api/orders` (POS order create)
- `GET /api/orders/{id}`
- `POST /api/orders/{id}/payments` (add payment)
- `GET /api/kds/orders`
- `POST /api/kds/orders/{id}/start`
- `POST /api/kds/orders/{id}/bump`
- `POST /api/kds/orders/{id}/recall`
- `GET /api/receipts/{token}` (public receipt view)
- `POST /api/receipts/{token}/resend`
- `POST /api/receipts/{token}/feedback`
- `GET /api/print-jobs`
- `POST /api/print-jobs/{id}/retry`
- `POST /api/inventory/{id}/adjust`
- `GET /api/shifts/current`
- `POST /api/shifts/open`
- `POST /api/shifts/{id}/close`
- `POST /api/devices/register`
- `GET /api/reports/sales-summary`
- `POST /api/items/stock-check`

Store snapshots in `tests/Contracts/snapshots/*.json`.
Contract tests **must pass before and after every phase.**

### 0.3 Formatting + CI baseline

Confirm `laravel/pint` is in `require-dev`. Add to `composer.json` scripts:
```json
"format":      ["./vendor/bin/pint"],
"format:test": ["./vendor/bin/pint --test"],
"test":        ["@php artisan config:clear --ansi", "@php artisan test"]
```

Run Pint across all backend PHP files. Commit **formatting only** as a separate commit.

**`backend/.github/workflows/ci.yml`** (or `.github/workflows/ci.yml` in repo root):
```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: backend

    steps:
      - uses: actions/checkout@v4

      - name: Setup PHP
        uses: shivammathur/setup-php@v2
        with:
          php-version: '8.4'
          extensions: mbstring, sqlite3, pdo_sqlite
          coverage: none

      - name: Install dependencies
        run: composer install --no-interaction --prefer-dist --optimize-autoloader

      - name: Copy .env
        run: cp .env.example .env && php artisan key:generate

      - name: Run tests
        run: php artisan test
        env:
          DB_CONNECTION: sqlite
          DB_DATABASE: ":memory:"

      - name: Check formatting
        run: ./vendor/bin/pint --test
```

---

## PHASE 1 — DOMAIN ARCHITECTURE SKELETON

### 1.1 Create `backend/app/Domains/` structure

```
app/Domains/
  Auth/
    Actions/
    Services/
    DTO/
    Contracts/
  Devices/
    Actions/
    Services/
    Policies/
  Customers/
    Actions/
    Services/
    DTO/
  Menu/
    Actions/
    Queries/
    DTO/
  Orders/
    Actions/
    Services/
      OrderStateMachine.php
    DTO/
    Events/
      OrderCreated.php
      OrderPaid.php
      OrderCompleted.php
    Listeners/
    Support/
  Tables/
    Actions/
    Services/
  Kitchen/
    Actions/
    Services/
      KitchenTicketStateMachine.php
  Payments/
    Actions/
      CreatePaymentForOrderAction.php
      InitiateBmlPaymentAction.php
      HandleBmlWebhookAction.php
      HandleBmlReturnAction.php
    Services/
      PaymentStateMachine.php
    Gateways/
      BmlGateway.php
      FakeGateway.php
    Contracts/
      PaymentGatewayInterface.php
    DTO/
      InitiatePaymentDTO.php
      VerifiedCallbackDTO.php
      GatewayStatusDTO.php
    Events/
      PaymentConfirmed.php
      PaymentFailed.php
    Listeners/
      ApplyPaymentToOrderListener.php
      MaybeMarkOrderPaidListener.php
      MaybeCompleteOrderListener.php
  Receipts/
    Actions/
      ShowReceiptAction.php
      GenerateReceiptPdfAction.php
      SendReceiptAction.php
      SubmitReceiptFeedbackAction.php
    Services/
      ReceiptDeliveryService.php
    DTO/
  Notifications/
    Contracts/
      NotifierInterface.php
    Channels/
      SmsNotifier.php
      EmailNotifier.php
    Services/
      NotificationDispatcher.php
    Templates/
  Printing/
    Actions/
      QueuePrintJobAction.php
      RetryPrintJobAction.php
    Services/
      PrintJobStateMachine.php
      PrintProxyClient.php
    Contracts/
      PrinterClientInterface.php
    DTO/
  Inventory/
    Actions/
    Services/
    DTO/
    Listeners/
      DeductInventoryOnOrderCompletedListener.php
  Suppliers/
    Actions/
    Services/
  Purchasing/
    Actions/
    Services/
  Shifts/
    Actions/
      OpenShiftAction.php
      CloseShiftAction.php
      RecordCashMovementAction.php
    Services/
      ShiftStateMachine.php
  Reports/
    Queries/
    Actions/
    DTO/
  Promotions/
    Actions/
      ValidatePromoCodeAction.php           ← preview only; never consumes usage
      ApplyPromoToOrderAction.php           ← draft-attach to order_promotions; no redemption row
      RemovePromoFromOrderAction.php        ← remove draft promo from order
      PreviewPromotionsAction.php           ← cart snapshot → list of eligible discounts
      ConsumePromoRedemptionsAction.php     ← called ONLY by listener on OrderPaid
      CreatePromotionAction.php
      UpdatePromotionAction.php
    Services/
      PromotionEvaluator.php
    DTO/
      CartSnapshot.php
      DiscountsInput.php
      DiscountAllocation.php
      PromoValidationResult.php
    Policies/
      PromotionPolicy.php
    Queries/
      ActivePromotionsQuery.php
    Support/
      Rules/
        MinOrderAmountRule.php
        ChannelRule.php
        UsageLimitRule.php
        ValidityWindowRule.php
        TargetScopeRule.php
        ExclusionRule.php                   ← excludes items/categories/modifiers
    Events/
      PromoCodeRedeemed.php
    Listeners/
      ConsumePromoRedemptionsListener.php   ← ShouldQueue, afterCommit, idempotent
  Loyalty/
    Actions/
      GetLoyaltyAccountAction.php
      HoldPreviewAction.php                 ← draft order → points needed + discount
      CreateOrRefreshHoldAction.php         ← creates/refreshes loyalty_holds row
      ReleaseHoldAction.php                 ← releases hold (cancel/timeout)
      ConsumeHoldOnOrderPaidAction.php      ← consumes hold + writes ledger redeem entry
      EarnPointsAction.php                  ← writes ledger earn entry
      AdjustPointsAction.php                ← admin manual adjust + audit log
    Services/
      LoyaltyLedgerService.php
      LoyaltyHoldService.php                ← hold lifecycle management
      LoyaltyTierService.php
      PointsCalculator.php
    DTO/
      EarnPointsData.php
      HoldPreviewDTO.php
      LoyaltyAccountDTO.php
      LoyaltyHoldDTO.php
    Queries/
      LoyaltyLedgerQuery.php
    Events/
      PointsEarned.php
      PointsRedeemed.php
      LoyaltyHoldConsumed.php
    Listeners/
      EarnPointsFromOrderListener.php       ← ShouldQueue, afterCommit, idempotent
      ConsumeLoyaltyHoldListener.php        ← ShouldQueue, afterCommit, idempotent
    Support/
  Refunds/
    Actions/
    Services/
  Audit/
    Actions/
    Services/
  Shared/
    Enums/
      OrderStatus.php
      PaymentStatus.php
      PrintJobStatus.php
      ShiftStatus.php
      KitchenTicketStatus.php
      DiscountType.php           ← percentage / fixed_amount / free_item
      PromotionChannel.php       ← pos / online / both
      LoyaltyLedgerType.php      ← earn / redeem / adjust / expire
      LoyaltyHoldStatus.php      ← active / consumed / released / expired
      PromotionTargetType.php    ← item / category / modifier
    ValueObjects/
      Money.php                  ← immutable; integer laari + currency; all arithmetic here
                                    floor() for discounts, round() for tax, never float
    Support/
      RoundingMode.php           ← FLOOR / ROUND / CEIL (configured per context)
    DTO/
```

**Rules:**
- Eloquent models stay in `App\Models`. Domain `Models/` folders do NOT exist — only traits/scopes/value objects.
- Domains interact with each other only via **Contracts** or **Events** — never direct class import across domain boundaries.
- Controllers remain thin: validate input → call one Domain Action → return response.

### 1.2 Providers & event wiring

**`app/Providers/DomainsServiceProvider.php`** — registers bindings:
```php
<?php
namespace App\Providers;

use Illuminate\Support\ServiceProvider;

class DomainsServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->bind(
            \App\Domains\Payments\Contracts\PaymentGatewayInterface::class,
            app()->environment('testing')
                ? \App\Domains\Payments\Gateways\FakeGateway::class
                : \App\Domains\Payments\Gateways\BmlGateway::class,
        );

        // NotifierInterface binds to SmsNotifier for SMS channel
        // Do NOT bind NotifierInterface to NotificationDispatcher.
        // Dispatcher is not a notifier — inject it explicitly where needed.
        $this->app->bind(
            \App\Domains\Notifications\Contracts\NotifierInterface::class,
            \App\Domains\Notifications\Channels\SmsNotifier::class,
        );
    }
}
```

**`app/Providers/DomainsEventServiceProvider.php`** — centralised `$listen` array (no scattered `Event::listen` calls):
```php
<?php
namespace App\Providers;

use Illuminate\Foundation\Support\Providers\EventServiceProvider as ServiceProvider;

class DomainsEventServiceProvider extends ServiceProvider
{
    protected $listen = [
        \App\Domains\Payments\Events\PaymentConfirmed::class => [
            \App\Domains\Payments\Listeners\ApplyPaymentToOrderListener::class,
            \App\Domains\Payments\Listeners\MaybeMarkOrderPaidListener::class,
            \App\Domains\Payments\Listeners\MaybeCompleteOrderListener::class,
        ],
        \App\Domains\Orders\Events\OrderCompleted::class => [
            \App\Domains\Inventory\Listeners\DeductInventoryOnOrderCompletedListener::class,
            \App\Domains\Printing\Listeners\QueueReceiptPrintListener::class,
            \App\Domains\Receipts\Listeners\GenerateReceiptFromOrderListener::class,
        ],
        \App\Domains\Orders\Events\OrderCreated::class => [],
        // FIX 2: ALL promo/loyalty side-effects listen on OrderPaid ONLY.
        // OrderCompleted is a status transition (kitchen/POS flow); OrderPaid means money confirmed.
        // Earning points and consuming discounts require confirmed payment — use OrderPaid, not OrderCompleted.
        \App\Domains\Orders\Events\OrderPaid::class => [
            // Promotions: consume draft promos (create redemption rows) — idempotent
            \App\Domains\Promotions\Listeners\ConsumePromoRedemptionsListener::class,
            // Loyalty: consume hold → write redeem ledger entry — idempotent
            \App\Domains\Loyalty\Listeners\ConsumeLoyaltyHoldListener::class,
            // Loyalty: earn points for this order — idempotent
            \App\Domains\Loyalty\Listeners\EarnPointsFromOrderListener::class,
        ],
        \App\Domains\Promotions\Events\PromoCodeRedeemed::class => [],
        \App\Domains\Loyalty\Events\PointsEarned::class => [],
        \App\Domains\Loyalty\Events\PointsRedeemed::class => [],
        \App\Domains\Loyalty\Events\LoyaltyHoldConsumed::class => [],
    ];
}
```

Register both in `bootstrap/providers.php`:
```php
App\Providers\DomainsServiceProvider::class,
App\Providers\DomainsEventServiceProvider::class,
```

---

## PHASE 2 — ENGINEERING GUARANTEES (MANDATORY)

### 2.1 State machines

Each state machine is the **only** place statuses change. Pattern:

```php
<?php
// Domains/Orders/Services/OrderStateMachine.php
namespace App\Domains\Orders\Services;

use App\Models\Order;
use RuntimeException;

class OrderStateMachine
{
    private const TRANSITIONS = [
        'pending'   => ['open', 'cancelled'],
        'open'      => ['held', 'completed', 'cancelled'],
        'held'      => ['open', 'cancelled'],
        'completed' => [],
        'cancelled' => [],
    ];

    public function can(string $from, string $to): bool
    {
        return in_array($to, self::TRANSITIONS[$from] ?? [], true);
    }

    public function transition(Order $order, string $to): void
    {
        if (! $this->can($order->status, $to)) {
            throw new RuntimeException("Invalid order transition: {$order->status} → {$to}");
        }
        $order->update(['status' => $to]);
    }
}
```

**All 5 state machines:**

| Class | Valid transitions |
|---|---|
| `OrderStateMachine` | pending→open, open→held/completed/cancelled, held→open/cancelled |
| `PaymentStateMachine` | created→initiated→pending→confirmed, initiated/pending→failed/expired/cancelled |
| `PrintJobStateMachine` | queued→sending→sent/failed, failed→queued (retry) |
| `ShiftStateMachine` | open→closed |
| `KitchenTicketStateMachine` | pending→started→bumped, bumped→recalled→pending |

### 2.2 Idempotency — DB enforced, not just "if checks"

**IMPORTANT:** Before adding unique constraints, run a deduplication check:
```php
// Artisan command: app:check-duplicate-data
// Run before applying unique constraints to detect + resolve existing duplicates.
```

Unique constraints to add via new migrations (do NOT modify existing migration files):

```php
// receipts: one receipt per order
Schema::table('receipts', fn($t) => $t->unique('order_id'));

// print_jobs: idempotency key
Schema::table('print_jobs', function (Blueprint $t) {
    $t->string('idempotency_key')->nullable()->after('id');
    $t->unique('idempotency_key');
});

// inventory_deductions (new table or add to stock_movements)
Schema::table('stock_movements', function (Blueprint $t) {
    $t->string('idempotency_key')->nullable()->after('id');
    $t->unique('idempotency_key');
});

// webhook_logs (new table)
Schema::create('webhook_logs', function (Blueprint $t) {
    $t->id();
    $t->string('gateway');
    $t->string('external_reference')->nullable();
    $t->string('event_type')->nullable();
    $t->boolean('signature_valid')->default(false);
    $t->string('payload_sha256')->nullable();        // sha256 of raw body — NOT the full payload
    $t->string('headers_hash')->nullable();
    $t->json('payload_json')->nullable();            // redacted/safe version only
    $t->timestamp('received_at');
    $t->timestamp('processed_at')->nullable();
    $t->string('processing_result')->nullable();
    $t->timestamps();

    $t->unique(['gateway', 'external_reference', 'event_type'], 'webhook_logs_idempotency');
    $t->index('external_reference');
});
```

### 2.3 After-commit queued side effects

All side-effect listeners **must** implement `ShouldQueue` and set `$afterCommit = true`:
```php
class DeductInventoryOnOrderCompletedListener implements ShouldQueue
{
    public bool $afterCommit = true;

    public function handle(OrderCompleted $event): void
    {
        DB::transaction(function () use ($event) {
            $order = Order::lockForUpdate()->findOrFail($event->orderId);
            // idempotency check before acting
            if (StockMovement::where('idempotency_key', "order-{$event->orderId}-deduct")->exists()) {
                return;
            }
            // ... deduct inventory
        });
    }
}
```

No controller may call printing + receipts + inventory directly. These happen only via listeners.

### 2.4 Observability

Structured logging for: gateway callbacks, print failures, inventory failures.

**System health endpoint** (add to `routes/api.php`):
```php
Route::get('/system/health', function () {
    $checks = [];
    try {
        DB::connection()->getPdo();
        $checks['database'] = 'ok';
    } catch (\Throwable $e) {
        $checks['database'] = 'error';
    }
    $checks['queue'] = config('queue.default');
    $printUrl = config('services.print_proxy.url');
    if ($printUrl) {
        try {
            $r = Http::timeout(3)->get($printUrl . '/health');
            $checks['print_proxy'] = $r->successful() ? 'ok' : 'degraded';
        } catch (\Throwable) {
            $checks['print_proxy'] = 'unreachable';
        }
    } else {
        $checks['print_proxy'] = 'not_configured';
    }
    $allOk = !in_array('error', $checks, true);
    return response()->json([
        'status'    => $allOk ? 'ok' : 'degraded',
        'checks'    => $checks,
        'timestamp' => now()->toIso8601String(),
    ], $allOk ? 200 : 503);
})->middleware('throttle:60,1');
```

---

## PHASE 3 — ROUTES & CONTROLLERS (COMPAT LAYER)

1. Keep ALL route paths identical — no exceptions.
2. Replace route closures with named controllers but preserve exact behaviour.
3. Thin all controllers: validate → call one Domain Action → return response.
4. No SMS, printing, inventory, payment logic inside controllers.
5. Keep existing controllers as wrappers if needed during transition — delete only after contract tests confirm parity.

---

## PHASE 4 — SIDE EFFECTS FIRST (Notifications → Receipts → Printing)

### 4.1 Notifications domain

- `NotifierInterface` — single method `send(string $to, string $message): void`
- `SmsNotifier` implements `NotifierInterface` — wraps existing `SmsService`
- `EmailNotifier` implements `NotifierInterface`
- `NotificationDispatcher` — routing/templating service; injected explicitly where needed
- `ReceiptDeliveryService` — orchestrates email + SMS receipt delivery

**Critical:** Do NOT bind `NotifierInterface` to `NotificationDispatcher`. Dispatcher is not a notifier. Bind `NotifierInterface` to `SmsNotifier` (or tag both channels). Inject `NotificationDispatcher` directly.

### 4.2 Receipts domain

Actions:
- `ShowReceiptAction` — token → receipt → view model
- `GenerateReceiptPdfAction` — DOMPDF, correct headers
- `SendReceiptAction` — cooldown check, rate limit, logging, uses `ReceiptDeliveryService`
- `SubmitReceiptFeedbackAction`

Replace duplicated receipt-sending logic in both `Api/ReceiptController` and `ReceiptPageController` with `SendReceiptAction → ReceiptDeliveryService`.

### 4.3 Printing domain

- `PrinterClientInterface`
- `PrintProxyClient` — preserves current payload format **EXACTLY** (golden test it)

Actions:
- `QueuePrintJobAction` — creates job, sends to proxy, uses idempotency key
- `RetryPrintJobAction` — safe retry, checks state machine allows retry

---

## PHASE 5 — ORDERS AS THE SPINE (EVENT-DRIVEN)

### 5.1 Orders

- `CreateOrderAction` replaces `OrderCreationService` (keep old service as thin wrapper until contract tests pass)
- `OrderTotalsCalculator` — single source of truth for totals. Must accept an optional `DiscountsInput` DTO and produce a fully stable, deterministic breakdown.
- `OrderStateMachine` — enforces all transitions

**`DiscountsInput` DTO:**
```php
// Domains/Orders/DTO/DiscountsInput.php
readonly class DiscountsInput {
    public function __construct(
        /** @var DiscountAllocation[] — from order_promotions pivot (draft-attached promos) */
        public array $appliedPromotions = [],
        /** @var DiscountAllocation[] — staff manual discount (POS only) */
        public array $appliedManualDiscounts = [],
        /** @var int|null — from active loyalty_hold; laari value already validated */
        public ?int  $loyaltyDiscountLaar = null,
    ) {}
}

// Domains/Orders/DTO/DiscountAllocation.php
readonly class DiscountAllocation {
    public function __construct(
        public string  $source,           // 'promo_code' | 'manual'
        public ?string $code,
        public int     $promotionId,
        public int     $amountLaar,       // computed discount in laari (integer)
        public string  $type,             // 'percentage' | 'fixed_amount' | 'free_item'
        public array   $targetItemIds = [],
        public array   $excludedItemIds = [],
    ) {}
}
```

**`TotalsBreakdown` output DTO:**
```php
readonly class TotalsBreakdown {
    public function __construct(
        public int $subtotalLaar,              // sum of line items before any discount
        public int $itemPromoDiscountLaar,     // item-level promo discounts
        public int $orderPromoDiscountLaar,    // order-level promo discounts
        public int $loyaltyDiscountLaar,       // from loyalty hold
        public int $manualDiscountLaar,        // staff override
        public int $totalDiscountLaar,         // sum of all discounts
        public int $discountedSubtotalLaar,    // subtotal after all discounts (never < 0)
        public int $taxLaar,                   // tax computed on discountedSubtotal
        public int $grandTotalLaar,            // discountedSubtotal + taxLaar
        public string $currency,
    ) {}
}
```

**Deterministic order-of-operations (ALWAYS apply in this sequence):**
```
Step 1 — Item-level promo discounts  (scoped to specific items/categories; floor rounding)
Step 2 — Order-level promo discounts (applied to remaining subtotal; floor rounding)
Step 3 — Loyalty discount            (from active hold; floor rounding; capped at max %)
Step 4 — Manual staff discount       (POS override; floor rounding)
Step 5 — Guard: discountedSubtotal   = max(0, subtotal − totalDiscounts)
Step 6 — Tax                         = round(discountedSubtotal × taxRate / 10000) [round half-up]
Step 7 — Grand total                 = discountedSubtotal + tax
```

**Rounding rules (document in README):**
- Discount amounts: `floor()` — customer never gets more than stated
- Tax: `round()` (standard half-up, to nearest laari)
- Grand total: always integer laari — no float in DB or API
- Use the `Money` value object for all arithmetic; never raw `float`

**Tax configuration:**
```php
// config/taxes.php
'rate_basis_points' => env('TAX_RATE_BP', 0),   // 0 = no tax; 1600 = 16% GST
'inclusive'         => env('TAX_INCLUSIVE', false), // if true, tax already in prices
```

### 5.2 Events (dispatch ONLY after DB commit)

```php
// OrderCreated — after order row + items inserted
// OrderPaid — after sum(confirmed payments) >= order_total
// OrderCompleted — after status → completed
```

### 5.3 Listeners (queued, afterCommit, idempotent)

```
OrderCompleted → DeductInventoryOnOrderCompletedListener
             → QueueReceiptPrintListener
             → GenerateReceiptFromOrderListener
```

**No controller may call printing + receipts + inventory directly.**

---

## PHASE 6 — INVENTORY (LEDGER CORRECTNESS)

- Wrap all existing inventory logic into Domain Actions/Services
- Deduction happens ONLY via `DeductInventoryOnOrderCompletedListener`
- Stock check/reservation/deduction must be fully consistent with existing API endpoint behaviour
- Idempotency enforced with `idempotency_key` unique constraint on `stock_movements`

---

## PHASE 7 — PAYMENTS DOMAIN + BML GATEWAY

### 7.1 Payment models (in `App\Models`)

**`App\Models\Payment`** — keep generic:
```php
protected $fillable = [
    'order_id', 'amount', 'currency', 'status', 'gateway',
    'gateway_reference', 'merchant_reference', 'local_id',
    'amount_laar', 'metadata', 'confirmed_at', 'failed_at',
    'payment_url', 'bml_transaction_id',
];

protected function casts(): array
{
    return [
        'amount'       => 'decimal:2',
        'metadata'     => 'array',       // BML-specific details go here
        'confirmed_at' => 'datetime',
        'failed_at'    => 'datetime',
    ];
}
```

Store BML-specific details in `metadata` JSON, not many dedicated columns.

**`App\Models\WebhookLog`** — as described in Phase 2.2.

**`App\Models\PaymentAttempt`**:
```php
protected $fillable = ['payment_id', 'status', 'error', 'initiated_at'];
```

### 7.2 Webhook security

Add `VerifyBmlSignature` middleware (preferred approach):
```php
// app/Http/Middleware/VerifyBmlSignature.php
public function handle(Request $request, Closure $next): Response
{
    $secret = config('bml.webhook_secret');
    if ($secret) {
        $rawBody  = $request->getContent();               // MUST use raw body
        $expected = hash_hmac('sha256', $rawBody, $secret);
        $received = $request->header(config('bml.webhook_signature_header', 'X-BML-Signature'), '');
        if (! hash_equals($expected, $received)) {
            Log::warning('BML webhook: invalid signature', ['ip' => $request->ip()]);
            return response('Forbidden', 403);
        }
    }
    return $next($request);
}
```

Log: `sha256(raw_body)`, `headers_hash`, `signature_valid`, `external_reference`.
**Do NOT log full raw payload unredacted. Do NOT log secrets.**

### 7.3 Gateway contract

```php
<?php
// app/Domains/Payments/Contracts/PaymentGatewayInterface.php
namespace App\Domains\Payments\Contracts;

use App\Domains\Payments\DTO\InitiatePaymentDTO;
use App\Domains\Payments\DTO\VerifiedCallbackDTO;
use App\Domains\Payments\DTO\GatewayStatusDTO;
use App\Models\Payment;
use Illuminate\Http\Request;

interface PaymentGatewayInterface
{
    public function initiate(Payment $payment, array $context = []): InitiatePaymentDTO;
    public function verifyWebhook(Request $request): VerifiedCallbackDTO;
    public function queryStatus(Payment $payment): ?GatewayStatusDTO;
}
```

### 7.4 BML Gateway — REAL IMPLEMENTATION

**Port EXACTLY from the Akuru reference files included in this zip** (`akuru-bml-reference/`). That code is battle-tested in production.

**Key behaviours that MUST be preserved:**

**Amount in laari (integer × 100):**
```php
$amountLaar = (int) round((float) $payment->amount * 100);
// Use $payment->amount_laar if already set, otherwise convert
```

**localId — alphanumeric only, max 50 chars:**
```php
$localId = preg_replace('/[^A-Za-z0-9]/', '', $payment->merchant_reference);
$localId = substr($localId, 0, 50);
```

**Return URL — append raw ref (with hyphens) for lookup:**
```php
$returnUrl = config('bml.return_url') . '?ref=' . urlencode($payment->merchant_reference);
```

**`paymentPortalExperience` block — required by BML Connect v2:**
```php
$payload['paymentPortalExperience'] = [
    'externalWebsiteTermsAccepted' => true,
    'externalWebsiteTermsUrl'      => config('bml.payment_portal_experience.external_website_terms_url')
                                       ?: rtrim(config('app.url'), '/') . '/privacy',
];
```

**Auth header detection (supports UAT JWT and production basic):**
```php
private function authHeaders(string $apiKey, string $appId): array
{
    $mode = config('bml.auth_mode', 'auto');
    $headerValue = match ($mode) {
        'raw'          => $apiKey,
        'bearer_jwt'   => 'Bearer ' . $apiKey,
        'bearer_basic' => 'Bearer ' . base64_encode($apiKey . ':' . $appId),
        default        => str_starts_with(trim($apiKey), 'eyJ')
                            ? 'Bearer ' . $apiKey
                            : 'Bearer ' . base64_encode($apiKey . ':' . $appId),
    };
    return ['Authorization' => $headerValue];
}
```

**Webhook signature — MUST use raw body:**
```php
$rawBody  = $request->getContent();  // before any JSON decode
$expected = hash_hmac('sha256', $rawBody, config('bml.webhook_secret'));
$valid    = hash_equals($expected, $request->header('X-BML-Signature', ''));
```

**Payment URL extraction from BML response:**
```php
$keys = ['url', 'shortUrl', 'paymentUrl', 'redirectUrl', 'payment_url'];
foreach ($keys as $key) {
    if (!empty($data[$key])) return $data[$key];
}
// also check nested under $data['data']
```

**Amount/currency mismatch — mark suspicious, do NOT confirm:**
```php
if ($webhookAmount !== $expectedAmount || $webhookCurrency !== $expectedCurrency) {
    $payment->update(['status' => 'suspicious', 'metadata->mismatch' => true]);
    Log::error('BML webhook: amount/currency mismatch', [...]);
    return; // do not confirm
}
```

**Return URL NEVER confirms payment.** Only webhook confirms.

### 7.5 PaymentStateMachine

```
created → initiated → pending → confirmed
initiated/pending → failed / expired / cancelled
```

**Split payment support:**
- Multiple `Payment` records per order
- Order becomes paid when `sum(confirmed payments) >= order_total`
- Define rounding rule: use integer laari comparison to avoid float issues
- `MaybeMarkOrderPaidListener` checks this condition after every `PaymentConfirmed`

### 7.6 Payment Actions

**`HandleBmlWebhookAction`** — exact steps:
1. Log raw webhook to `WebhookLog` (store `sha256(raw_body)`, `headers_hash`, `signature_valid`)
2. Verify signature via `VerifyBmlSignature` middleware (done before action runs) OR inside action
3. Check `WebhookLog` for duplicate via unique constraint — skip if already processed
4. In `DB::transaction()` with `lockForUpdate()`:
   a. Find `Payment` by `merchant_reference` or `local_id`
   b. If not found → log warning, return 200 (BML may retry; avoid 4xx)
   c. If already in final status → return (idempotent)
   d. Validate amount + currency match
   e. Call `PaymentStateMachine::transition()`
   f. Dispatch `PaymentConfirmed` or `PaymentFailed` via `DB::afterCommit()`
5. Mark `WebhookLog.processed_at`
6. **Always return HTTP 200** (never 4xx/5xx to BML — it will retry)

**`HandleBmlReturnAction`** — exact steps:
1. Read `?ref=` from query string
2. Find `Payment` by `merchant_reference` or `local_id`
3. **DO NOT confirm payment here**
4. Optionally call `BmlGateway::queryStatus()` to show accurate status to user
5. Return Blade view: "Payment processing..." with polling JS to check status endpoint

**`InitiateBmlPaymentAction`** — exact steps:
1. Validate order is in payable state
2. Create `Payment` record (status=`created`)
3. Call `PaymentStateMachine::transition(payment, 'initiated')`
4. Call `BmlGateway::initiate(payment, context)`
5. Update Payment with `redirect_url`, `bml_transaction_id`
6. Return redirect URL

### 7.7 Events & Listeners

```php
// PaymentConfirmed — dispatch after commit
class PaymentConfirmed {
    public function __construct(
        public readonly int $paymentId,
        public readonly int $orderId,
        public readonly int $amountLaar,   // integer to avoid float comparison
        public readonly string $currency,
    ) {}
}

// Listener chain:
PaymentConfirmed
  → ApplyPaymentToOrderListener          (record payment against order)
  → MaybeMarkOrderPaidListener           (sum confirmed laari >= order_total laari → OrderPaid)
  → MaybeCompleteOrderListener           (if auto-complete logic → OrderCompleted)

OrderCompleted
  → DeductInventoryOnOrderCompletedListener
  → QueueReceiptPrintListener
  → GenerateReceiptFromOrderListener
```

### 7.8 New routes

```php
// routes/api.php
Route::post('/payments/bml/webhook', App\Http\Controllers\Api\BmlWebhookController::class)
    ->middleware(['throttle:120,1', App\Http\Middleware\VerifyBmlSignature::class])
    ->withoutMiddleware([\Illuminate\Foundation\Http\Middleware\VerifyCsrfToken::class]);

// routes/web.php
Route::get('/payments/bml/return', App\Http\Controllers\BmlReturnController::class)
    ->name('payments.bml.return');
```

### 7.9 `config/bml.php`
```php
<?php
return [
    'base_url'    => env('BML_BASE_URL', 'https://api.uat.merchants.bankofmaldives.com.mv/public'),
    'app_id'      => env('BML_APP_ID', env('BML_CLIENT_ID')),
    'api_key'     => env('BML_API_KEY', env('BML_CLIENT_SECRET')),
    'merchant_id' => env('BML_MERCHANT_ID'),
    'auth_mode'   => env('BML_AUTH_MODE', 'auto'),
    'timeout'     => (int) env('BML_TIMEOUT', 30),
    'payment_expiry_minutes' => (int) env('PAYMENT_EXPIRY_MINUTES', 30),
    'webhook_secret'           => env('BML_WEBHOOK_SECRET', env('BML_CALLBACK_SECRET')),
    'webhook_url'              => env('BML_WEBHOOK_URL'),
    'return_url'               => env('BML_RETURN_URL'),
    'provider'                 => env('BML_PROVIDER'),
    'default_currency'         => env('BML_DEFAULT_CURRENCY', 'MVR'),
    'environment'              => env('BML_ENVIRONMENT', 'sandbox'),
    'webhook_signature_header' => env('BML_WEBHOOK_SIGNATURE_HEADER', 'X-BML-Signature'),
    'webhook_hmac_algo'        => env('BML_WEBHOOK_HMAC_ALGO', 'sha256'),
    'webhook_ip_allowlist'     => array_filter(
        array_map('trim', explode(',', env('BML_WEBHOOK_IP_ALLOWLIST', '')))
    ),
    'paths' => [
        'create_transaction' => '/v2/transactions',
        'get_transaction'    => '/v2/transactions/{reference}',
    ],
    'payment_portal_experience' => [
        'external_website_terms_accepted' => env('BML_EXTERNAL_TERMS_ACCEPTED', true),
        'external_website_terms_url'      => env('BML_EXTERNAL_TERMS_URL'),
        'skip_provider_selection'         => env('BML_SKIP_PROVIDER_SELECTION', false),
    ],
];
```

### 7.10 `.env.example` additions
```env
# BML Payment Gateway
BML_BASE_URL=https://api.uat.merchants.bankofmaldives.com.mv/public
BML_APP_ID=
BML_API_KEY=
BML_MERCHANT_ID=
BML_WEBHOOK_SECRET=
BML_WEBHOOK_URL=https://yourdomain.mv/api/payments/bml/webhook
BML_RETURN_URL=https://yourdomain.mv/payments/bml/return
BML_DEFAULT_CURRENCY=MVR
BML_AUTH_MODE=auto
BML_ENVIRONMENT=sandbox
BML_EXTERNAL_TERMS_URL=https://yourdomain.mv/privacy
```

---

## PHASE 7A — PROMOTIONS / DISCOUNT ENGINE (PATCHED v3)

> **Key workflow change from v2:** "Apply promo" is now a DRAFT operation (attaches to `order_promotions`). Redemption rows are created ONLY on `OrderPaid` via a queued listener. Canceled/abandoned orders do NOT consume usage limits.

### 7A.1 Database migrations

```php
// Migration 1: promotions
Schema::create('promotions', function (Blueprint $table) {
    $table->id();
    $table->string('name');
    $table->string('code')->unique();             // ALWAYS stored UPPER-TRIMMED (DB-level uniqueness)
    $table->string('type');                       // percentage | fixed_amount | free_item
    $table->unsignedInteger('value');             // laari for fixed; basis points for %; 0 for free_item
    $table->string('currency')->default('MVR');
    $table->boolean('active')->default(true);
    $table->timestamp('starts_at')->nullable();
    $table->timestamp('ends_at')->nullable();
    $table->unsignedInteger('min_order_amount_laar')->default(0);
    $table->unsignedInteger('max_redemptions')->default(0);            // 0 = unlimited
    $table->unsignedInteger('max_redemptions_per_customer')->default(0);
    $table->string('channel')->default('both');                        // pos | online | both
    $table->boolean('stackable')->default(false);
    $table->unsignedSmallInteger('priority')->default(0);
    $table->json('excluded_item_ids')->nullable();      // fast exclusion list
    $table->json('excluded_category_ids')->nullable();  // fast exclusion list
    $table->boolean('exclude_modifiers')->default(false);
    $table->unsignedInteger('redemptions_count')->default(0);  // FIX 1: cached counter; incremented atomically
    $table->json('metadata')->nullable();
    $table->timestamps();
    $table->softDeletes();

    $table->index('code');
    $table->index(['active', 'starts_at', 'ends_at']);
});

// Migration 2: promotion_targets (inclusion scope — items/categories)
Schema::create('promotion_targets', function (Blueprint $table) {
    $table->id();
    $table->foreignId('promotion_id')->constrained()->cascadeOnDelete();
    $table->string('target_type');              // item | category
    $table->unsignedBigInteger('target_id');
    $table->timestamps();

    $table->unique(['promotion_id', 'target_type', 'target_id']);
    $table->index(['promotion_id', 'target_type']);
});

// Migration 3: order_promotions (DRAFT pivot — does NOT consume usage)
Schema::create('order_promotions', function (Blueprint $table) {
    $table->id();
    $table->foreignId('order_id')->constrained()->cascadeOnDelete();
    $table->foreignId('promotion_id')->constrained();
    $table->unsignedInteger('preview_discount_laar');  // computed at apply time
    $table->json('applied_snapshot');                  // snapshot of promotion at apply time
    $table->timestamps();

    $table->unique(['order_id', 'promotion_id']);
    $table->index('order_id');
});

// Migration 4: promotion_redemptions (FINAL — created on OrderPaid only)
Schema::create('promotion_redemptions', function (Blueprint $table) {
    $table->id();
    $table->foreignId('promotion_id')->constrained();
    $table->foreignId('order_id')->constrained();
    $table->foreignId('customer_id')->nullable()->constrained('customers');
    $table->unsignedInteger('final_discount_amount_laar');
    $table->json('snapshot');                          // snapshot of promotion at redemption time
    $table->string('idempotency_key')->unique();       // "{promotion_id}-{order_id}"
    $table->timestamp('redeemed_at');
    $table->timestamps();

    $table->index(['promotion_id', 'order_id']);
    $table->index(['promotion_id', 'customer_id']);    // for per-customer limit checks
});
```

**Eloquent models** (all in `App\Models`):
- `App\Models\Promotion` — `scopeActive()`, `scopeForChannel()`, `targets()`, `orderPromotions()`, `redemptions()`; `creating` hook normalises code
- `App\Models\PromotionTarget`
- `App\Models\OrderPromotion` — the draft pivot
- `App\Models\PromotionRedemption` — the final consumed record

**Code normalisation — DB-level + model-level:**
```php
// In App\Models\Promotion — booted()
static::creating(function (Promotion $p) {
    $p->code = strtoupper(trim($p->code));
});
static::updating(function (Promotion $p) {
    if ($p->isDirty('code')) {
        $p->code = strtoupper(trim($p->code));
    }
});

// On all lookups:
Promotion::where('code', strtoupper(trim($input)))->first();
```
The `code` column has a DB-level `unique` constraint — duplicate codes are rejected at the database even if application code has a bug.

### 7A.2 PromotionEvaluator

`Domains/Promotions/Services/PromotionEvaluator.php`:

```php
class PromotionEvaluator
{
    /**
     * Validate a single promo code for a cart snapshot.
     * NEVER touches usage counters — preview only.
     */
    public function validateCode(
        string $code,
        CartSnapshot $cart,
        string $channel,
        ?int $customerId = null,
    ): PromoValidationResult;

    /**
     * Evaluate all eligible active promotions for a cart.
     * Returns DiscountAllocation[] sorted by priority, respecting stackable rules.
     * NEVER touches usage counters.
     *
     * @return DiscountAllocation[]
     */
    public function evaluate(CartSnapshot $cart, string $channel, ?int $customerId = null): array;
}
```

**`CartSnapshot` DTO:**
```php
readonly class CartSnapshot {
    public function __construct(
        public int     $subtotalLaar,
        public string  $channel,           // pos | online
        public array   $itemIds,           // item IDs in cart
        public array   $categoryIds,       // category IDs of items in cart
        public array   $modifierIds,       // modifier IDs (for exclude_modifiers check)
        public ?int    $customerId,
    ) {}
}
```

**Rule pipeline** (each rule returns bool; all must pass):
- `ValidityWindowRule` — `starts_at <= now <= ends_at`
- `ChannelRule` — `promotion.channel ∈ {channel, 'both'}`
- `MinOrderAmountRule` — `subtotalLaar >= promotion.min_order_amount_laar`
- `UsageLimitRule` — `redemptions_count < max_redemptions` AND `per_customer_count < max_per_customer` (checks `promotion_redemptions` NOT `order_promotions`)
- `TargetScopeRule` — if `promotion_targets` exist, at least one cart item/category matches
- `ExclusionRule` — removes excluded items/categories from eligible subtotal for calculation

**Stacking logic:**
1. Collect all promotions passing all rules, sorted by `priority DESC`
2. Apply highest-priority promotion first
3. If it is `stackable = false` → stop (only one non-stackable per order)
4. If it is `stackable = true` → continue applying remaining stackable ones
5. Non-stackable promotions are mutually exclusive

**Discount calculation (integer laari, `Money` value object):**
```
percentage:   floor(eligibleSubtotalLaar × value / 10000)   -- value in basis points
fixed_amount: min(value, eligibleSubtotalLaar)
free_item:    item.price_laar (applied as line-item adjustment; 0 on order total)
```

**Exclusion logic:**
```php
// Before computing discount, subtract excluded items from eligible subtotal:
$eligibleSubtotalLaar = $cart->subtotalLaar
    - sum(items where item_id in excluded_item_ids)
    - sum(items where category_id in excluded_category_ids)
    - (if exclude_modifiers) sum(modifiers on those items);
// Discount applies only to $eligibleSubtotalLaar
```

### 7A.3 Workflow — DRAFT → PAID → CONSUMED

```
User clicks "Apply Promo"
  → ApplyPromoToOrderAction
      1. Normalise code (strtoupper + trim)
      2. Run PromotionEvaluator::validateCode() — no usage consumed
      3. Compute preview_discount_laar
      4. Upsert order_promotions row (unique order_id + promotion_id)
      5. Return updated order totals (TotalsBreakdown)
      ❌ Does NOT create promotion_redemptions row
      ❌ Does NOT increment usage counters

Order is PAID (OrderPaid event fires, afterCommit)
  → ConsumePromoRedemptionsListener (ShouldQueue, afterCommit)
      1. Load order_promotions for this order
      2. For each order_promotion:
         a. Re-validate promo is still valid at payment time
         b. Compute final_discount_amount_laar (may differ from preview if order changed)
         c. DB::transaction + lockForUpdate on promotion row
         d. firstOrCreate on promotion_redemptions with idempotency_key="{promo_id}-{order_id}"
         e. If created: increment usage counters (via DB increment, not load-update)
         f. If already exists: no-op (idempotent)
      ✅ Creates promotion_redemptions row
      ✅ Increments usage counters

Order is CANCELLED / ABANDONED
  → order_promotions rows remain (harmless, order is dead)
  → No promotion_redemptions rows (usage never consumed)
  ✅ Usage limits are NOT consumed
```

### 7A.4 Actions

**`ApplyPromoToOrderAction`:**
```php
public function execute(int $orderId, string $code, string $channel): TotalsBreakdown
{
    $order = Order::findOrFail($orderId);
    // Guard: order must be open (not completed/cancelled)
    $promotion = Promotion::where('code', strtoupper(trim($code)))->firstOrFail();
    $cart = CartSnapshot::fromOrder($order);
    $result = $this->evaluator->validateCode($code, $cart, $channel, $order->customer_id);

    if (! $result->valid) {
        throw new PromoValidationException($result->error);
    }

    // Upsert draft pivot
    OrderPromotion::updateOrCreate(
        ['order_id' => $orderId, 'promotion_id' => $promotion->id],
        ['preview_discount_laar' => $result->discountLaar, 'applied_snapshot' => $promotion->toArray()]
    );

    return $this->calculator->calculate($order, $this->buildDiscountsInput($order));
}
```

**`RemovePromoFromOrderAction`:**
```php
public function execute(int $orderId, int $promotionId): TotalsBreakdown
{
    OrderPromotion::where(['order_id' => $orderId, 'promotion_id' => $promotionId])->delete();
    return $this->calculator->calculate(Order::findOrFail($orderId), $this->buildDiscountsInput(...));
}
```

**`ConsumePromoRedemptionsAction`** (called only by listener):
```php
public function execute(int $orderId): void
{
    $order = Order::with('orderPromotions.promotion')->lockForUpdate()->findOrFail($orderId);

    foreach ($order->orderPromotions as $op) {
        $idempotencyKey = "{$op->promotion_id}-{$orderId}";

        DB::transaction(function () use ($op, $order, $idempotencyKey) {
            [$record, $created] = [
                PromotionRedemption::firstOrCreate(
                    ['idempotency_key' => $idempotencyKey],
                    [
                        'promotion_id'               => $op->promotion_id,
                        'order_id'                   => $order->id,
                        'customer_id'                => $order->customer_id,
                        'final_discount_amount_laar' => $op->preview_discount_laar,
                        'snapshot'                   => $op->applied_snapshot,
                        'redeemed_at'                => now(),
                    ]
                ),
                /* wasRecentlyCreated */
            ];
            // Only increment if newly created
            if ($record->wasRecentlyCreated) {
                // Atomic increment — never load-then-save; avoids race condition
                Promotion::where('id', $op->promotion_id)->increment('redemptions_count');
            }
        });
    }
}
```

### 7A.5 API endpoints and auth

```php
// routes/api.php

// Public — throttle:20,1 (no auth required)
Route::post('/promotions/validate', PromoValidateController::class)
    ->middleware('throttle:20,1');

// Customer + Staff (auth:sanctum) — order must belong to token holder or staff
Route::middleware('auth:sanctum')->group(function () {
    Route::post('/orders/{id}/apply-promo', ApplyPromoController::class);
    Route::delete('/orders/{id}/promo/{promotionId}', RemovePromoController::class);
});

// Admin (staff) — auth:sanctum + can:admin.promotions
Route::middleware(['auth:sanctum', 'can:admin.promotions'])->prefix('admin')->group(function () {
    Route::apiResource('promotions', AdminPromotionController::class);
    Route::get('promotions/{id}/redemptions', [AdminPromotionController::class, 'redemptions']);
    Route::get('reports/promotions', AdminPromoReportController::class);
});
```

**`POST /api/promotions/validate`** response shape:
```json
{
  "valid": true,
  "code": "SUMMER10",
  "discount_amount_laar": 1500,
  "discount_amount_mvr": "15.00",
  "discount_type": "percentage",
  "description": "10% off your order",
  "excluded_items_note": "Drinks excluded",
  "error": null
}
```

**`POST /api/orders/{id}/apply-promo`** response shape:
```json
{
  "order_id": 123,
  "promo_applied": true,
  "promotion": { "id": 5, "code": "SUMMER10", "name": "Summer Discount", "type": "percentage" },
  "totals": {
    "subtotal_laar": 15000,
    "promo_discount_laar": 1500,
    "loyalty_discount_laar": 0,
    "manual_discount_laar": 0,
    "tax_laar": 0,
    "grand_total_laar": 13500
  }
}
```

**Important:** The existing `POST /api/orders` payload is unchanged. `promo_code` is an **optional** additive field. Old clients that don't send it get no discount. New clients send it and get discount evaluated inline via `ApplyPromoToOrderAction`.

### 7A.6 Reports + audit hooks

- Audit log entry on: promo `created`, `updated`, `disabled` (actor = staff user id)
- `GET /api/admin/reports/promotions` response shape:
```json
{
  "period": "2026-01",
  "promotions": [
    {
      "id": 5, "code": "SUMMER10", "name": "Summer Discount",
      "redemption_count": 42,
      "total_discount_given_laar": 63000,
      "total_discount_given_mvr": "630.00"
    }
  ]
}
```

---

## PHASE 7B — LOYALTY PROGRAM (PATCHED v3 — HOLD/RESERVATION REQUIRED)

> **Key change from v2:** Loyalty redemption now uses a HOLD mechanism to prevent fraud and double-spend. Points are never deducted at preview/apply time — only when the order is actually paid.

### 7B.1 Database migrations

```php
// Migration 1: loyalty_accounts
Schema::create('loyalty_accounts', function (Blueprint $table) {
    $table->id();
    $table->foreignId('customer_id')->unique()->constrained('customers');
    $table->unsignedInteger('points_balance')->default(0);   // cached; source of truth is ledger
    $table->unsignedInteger('points_held')->default(0);      // sum of active holds (informational)
    $table->string('tier')->default('bronze');
    $table->timestamp('tier_evaluated_at')->nullable();
    $table->timestamps();
});

// Migration 2: loyalty_ledger
Schema::create('loyalty_ledger', function (Blueprint $table) {
    $table->id();
    $table->foreignId('customer_id')->constrained('customers');
    $table->foreignId('order_id')->nullable()->constrained('orders');
    $table->string('type');                    // earn | redeem | adjust | expire
    $table->integer('points');                 // positive = earn; negative = redeem/expire
    $table->string('idempotency_key')->unique();
    $table->json('meta')->nullable();
    $table->timestamp('created_at');           // no updated_at — ledger is append-only

    $table->index(['customer_id', 'type']);
    $table->index('order_id');
});

// Migration 3: loyalty_holds (NEW — prevents double-spend)
Schema::create('loyalty_holds', function (Blueprint $table) {
    $table->id();
    $table->string('idempotency_key')->unique();        // "hold-{customer_id}-{order_id}"
    $table->foreignId('customer_id')->constrained('customers');
    $table->foreignId('order_id')->constrained('orders');
    $table->unsignedInteger('points');                  // points reserved
    $table->string('status')->default('active');        // active | consumed | released | expired
    $table->timestamp('expires_at');                    // now + 30 min; refreshed on re-apply
    $table->timestamp('consumed_at')->nullable();
    $table->timestamp('released_at')->nullable();
    $table->timestamps();

    $table->unique('order_id');                         // one hold per order
    $table->index(['customer_id', 'status']);
    $table->index('expires_at');                        // for expiry sweeper
});

// Migration 4: loyalty_rules (single-row config)
Schema::create('loyalty_rules', function (Blueprint $table) {
    $table->id();
    $table->unsignedInteger('earn_rate_points_per_100_laar')->default(1);
    $table->unsignedInteger('redeem_rate_laar_per_point')->default(100);
    $table->unsignedInteger('min_redeem_points')->default(100);
    $table->unsignedInteger('max_redeem_points_per_order')->default(1000);
    $table->unsignedInteger('max_redeem_percent_of_total')->default(20);
    $table->boolean('earn_on_discounted_total')->default(true);
    $table->boolean('earn_only_on_paid')->default(true);
    $table->unsignedSmallInteger('hold_ttl_minutes')->default(30);
    $table->timestamps();
});

// Migration 5: loyalty_tiers
Schema::create('loyalty_tiers', function (Blueprint $table) {
    $table->id();
    $table->string('name')->unique();           // bronze | silver | gold
    $table->unsignedInteger('threshold');       // minimum lifetime points
    $table->unsignedSmallInteger('earn_multiplier_bp')->default(100);  // 100 = 1×
    $table->timestamps();
});
```

**Eloquent models** (all in `App\Models`):
- `App\Models\LoyaltyAccount` — `customer()`, `ledger()`, `holds()`, `recalculateBalance()`, `availablePoints()` (balance − active holds)
- `App\Models\LoyaltyLedger` — append-only; no `updated_at`
- `App\Models\LoyaltyHold` — `scopeActive()`, `scopeExpired()`
- `App\Models\LoyaltyRule` — `LoyaltyRule::current()` static helper
- `App\Models\LoyaltyTier`

### 7B.2 Loyalty Hold Workflow

```
Customer requests "use 200 points on order #123"
  → CreateOrRefreshHoldAction
      1. Load LoyaltyAccount with lockForUpdate
      2. Check availablePoints (balance − existing active holds) >= 200
      3. Upsert loyalty_holds (unique on order_id):
         - If no hold → INSERT (idempotency_key = "hold-{customerId}-{orderId}")
         - If hold exists (status=active) → UPDATE points + expires_at (refresh)
         - If hold consumed/released → error (order already paid or hold released)
      4. Update loyalty_accounts.points_held (increment/decrement)
      5. Return HoldDTO with discount_amount_laar preview
      ❌ Does NOT write loyalty_ledger
      ❌ Does NOT decrement points_balance

Order is PAID (OrderPaid event fires, afterCommit)
  → ConsumeLoyaltyHoldListener (ShouldQueue, afterCommit, idempotent)
      1. Find loyalty_holds where order_id = X AND status IN (active, expired)
         ← FIX 3: also check expired holds, NOT only active ones (see below)
      2. If no hold found at all → skip (customer did not apply loyalty redemption)
      3. DB::transaction with lockForUpdate:
         a. Verify hold not already consumed (idempotent guard)
         b. If hold status = expired:
            → Honour the redemption anyway — customer completed payment trusting the discount applied.
            → Log a warning: 'loyalty hold expired before payment confirmed; honouring redemption'
            → Verify customer still has sufficient balance (points_balance >= hold.points)
            → If insufficient: log error, skip redemption, flag order for admin review
               (do NOT fail the payment — money already received)
         c. Mark hold status = consumed, consumed_at = now()
         d. Write loyalty_ledger entry: type=redeem, points=-N, idempotency_key="redeem-order-{orderId}"
         e. DB::decrement loyalty_accounts.points_balance by N
         f. DB::decrement loyalty_accounts.points_held by N (only if was still active/held)
      ✅ Ledger entry created exactly once

Order is CANCELLED / Customer removes hold
  → ReleaseHoldAction
      1. Find loyalty_holds where order_id = X AND status = active
      2. Mark status = released, released_at = now()
      3. DB::decrement loyalty_accounts.points_held
      ❌ No ledger entry

Hold EXPIRES (scheduled command: app:expire-loyalty-holds, run every 5 minutes)
  → Finds holds where expires_at < now AND status = active
  → Marks them expired, decrements points_held
```

### 7B.3 PointsCalculator

`Domains/Loyalty/Services/PointsCalculator.php`:
```php
class PointsCalculator
{
    /** Points to earn for a paid amount. Uses tier multiplier if tiers enabled. floor() always. */
    public function pointsToEarn(int $paidAmountLaar, ?string $tier = null): int
    {
        $rules = LoyaltyRule::current();
        $raw = intdiv($paidAmountLaar * $rules->earn_rate_points_per_100_laar, 100);
        if (config('loyalty.tiers_enabled')) {
            $multiplierBp = LoyaltyTier::where('name', $tier)->value('earn_multiplier_bp') ?? 100;
            $raw = (int) floor($raw * $multiplierBp / 100);
        }
        return max(0, $raw);
    }

    /** Laari discount for N points. floor() always. */
    public function laariForPoints(int $points): int
    {
        $rules = LoyaltyRule::current();
        return (int) floor($points * $rules->redeem_rate_laar_per_point);
    }

    /**
     * Validate a redemption request. Returns null if valid, error string if not.
     * All caps enforcement and policy checks here.
     */
    public function validateRedemption(
        int $pointsRequested,
        int $orderTotalLaar,
        int $availablePoints,   // balance − active holds (excluding this order's own hold)
    ): ?string
    {
        $rules = LoyaltyRule::current();
        if ($pointsRequested < $rules->min_redeem_points) {
            return "Minimum redemption is {$rules->min_redeem_points} points.";
        }
        if ($pointsRequested > $rules->max_redeem_points_per_order) {
            return "Maximum redemption per order is {$rules->max_redeem_points_per_order} points.";
        }
        if ($pointsRequested > $availablePoints) {
            return "Insufficient points balance.";
        }
        $discountLaar = $this->laariForPoints($pointsRequested);
        $maxDiscountLaar = (int) floor($orderTotalLaar * $rules->max_redeem_percent_of_total / 100);
        if ($discountLaar > $maxDiscountLaar) {
            return "Cannot redeem more than {$rules->max_redeem_percent_of_total}% of order total.";
        }
        return null;
    }
}
```

### 7B.4 EarnPointsFromOrderListener

> **FIX 2 note:** This listener fires on `OrderPaid` only — payment is confirmed. Do NOT add an order status check (e.g. checking for `completed`). `OrderCompleted` is a separate kitchen/POS flow event and must NOT be used as the earn trigger. The single source of truth for "money received" is `OrderPaid`.

```php
class EarnPointsFromOrderListener implements ShouldQueue
{
    public bool $afterCommit = true;

    public function handle(OrderPaid $event): void
    {
        DB::transaction(function () use ($event) {
            $order = Order::lockForUpdate()->findOrFail($event->orderId);
            if (! $order->customer_id) return;   // anonymous order — no loyalty account

            $idempotencyKey = "earn-order-{$order->id}";
            if (LoyaltyLedger::where('idempotency_key', $idempotencyKey)->exists()) return; // idempotent

            $rules = LoyaltyRule::current();
            $account = LoyaltyAccount::firstOrCreate(['customer_id' => $order->customer_id]);
            $earnOn = $rules->earn_on_discounted_total ? $order->grand_total_laar : $order->subtotal_laar;

            $points = app(PointsCalculator::class)->pointsToEarn($earnOn, $account->tier);
            if ($points <= 0) return;

            app(LoyaltyLedgerService::class)->append(
                customerId:     $order->customer_id,
                type:           LoyaltyLedgerType::Earn->value,
                points:         $points,
                idempotencyKey: $idempotencyKey,
                orderId:        $order->id,
                meta:           ['earned_on_laar' => $earnOn],
            );
        });
    }
}
```

### 7B.5 API endpoints and auth

```php
// routes/api.php

// Customer loyalty (auth:sanctum customer token)
Route::middleware('auth:sanctum')->prefix('loyalty')->group(function () {
    Route::get('/me', [LoyaltyController::class, 'me']);
    Route::post('/hold-preview', [LoyaltyController::class, 'holdPreview']);
    Route::post('/hold', [LoyaltyController::class, 'createOrRefreshHold']);
    Route::delete('/hold/{orderId}', [LoyaltyController::class, 'releaseHold']);
});

// Admin loyalty (auth:sanctum + can:admin.loyalty)
Route::middleware(['auth:sanctum', 'can:admin.loyalty'])->prefix('admin/loyalty')->group(function () {
    Route::post('/adjust', [AdminLoyaltyController::class, 'adjust']);
    Route::get('/ledger', [AdminLoyaltyController::class, 'ledger']);
    Route::get('/accounts', [AdminLoyaltyController::class, 'accounts']);
    Route::get('/accounts/{customerId}', [AdminLoyaltyController::class, 'customerAccount']);
    Route::get('/reports/loyalty', AdminLoyaltyReportController::class);
});
```

**`GET /api/loyalty/me`** response:
```json
{
  "points_balance": 350,
  "points_available": 150,
  "points_held": 200,
  "tier": "silver",
  "tier_threshold_next": 1000,
  "points_to_next_tier": 650,
  "redeem_value_mvr": "1.50",
  "recent_transactions": [
    { "type": "earn", "points": 50, "description": "Order #1234", "created_at": "..." },
    { "type": "redeem", "points": -100, "description": "Redeemed on Order #1230", "created_at": "..." }
  ]
}
```

**`POST /api/loyalty/hold`** request/response:
```json
// Request
{ "order_id": 123, "points": 200 }

// Response
{
  "hold_created": true,
  "points_held": 200,
  "discount_amount_laar": 2000,
  "discount_amount_mvr": "20.00",
  "expires_at": "2026-02-25T04:00:00Z",
  "remaining_available_points": 150
}
```

**`POST /api/loyalty/hold-preview`** request/response:
```json
// Request
{ "points_to_redeem": 200, "order_total_laar": 15000 }

// Response
{
  "valid": true,
  "points_to_redeem": 200,
  "discount_amount_laar": 2000,
  "discount_amount_mvr": "20.00",
  "remaining_balance_after": 150,
  "error": null
}
```

### 7B.6 Artisan commands

```
app:expire-loyalty-holds       ← mark expired holds; run every 5 min via scheduler
app:reconcile-loyalty-balances ← recalculate balances from ledger (admin use only)
```

### 7B.7 Config + env placeholders

`config/loyalty.php`:
```php
<?php
return [
    'enabled'              => env('LOYALTY_ENABLED', true),
    'earn_rate'            => env('LOYALTY_EARN_RATE', 1),
    'redeem_rate'          => env('LOYALTY_REDEEM_RATE', 100),
    'min_redeem_points'    => env('LOYALTY_MIN_REDEEM', 100),
    'max_redeem_points'    => env('LOYALTY_MAX_REDEEM', 1000),
    'max_redeem_percent'   => env('LOYALTY_MAX_REDEEM_PERCENT', 20),
    'hold_ttl_minutes'     => env('LOYALTY_HOLD_TTL', 30),
    'tiers_enabled'        => env('LOYALTY_TIERS_ENABLED', false),
];
```

`.env.example` additions:
```env
# Loyalty Program
LOYALTY_ENABLED=true
LOYALTY_EARN_RATE=1
LOYALTY_REDEEM_RATE=100
LOYALTY_MIN_REDEEM=100
LOYALTY_MAX_REDEEM=1000
LOYALTY_MAX_REDEEM_PERCENT=20
LOYALTY_HOLD_TTL=30
LOYALTY_TIERS_ENABLED=false

# Promotions
PROMO_CODE_CASE_INSENSITIVE=true

# Taxes
TAX_RATE_BP=0
TAX_INCLUSIVE=false
```

---

## PHASE 7C — DISCOUNT STACKING + TAX + ROUNDING (DETERMINISTIC)

> This phase ensures `OrderTotalsCalculator` is a pure, fully unit-tested function with no side effects and no ambiguity.

### 7C.1 Order of operations (ALWAYS applied in this exact sequence)

```
Input: line items with prices, applied promotions (from order_promotions), loyalty hold, manual discount

1. ITEM-LEVEL PROMO DISCOUNTS
   For each item-scoped promotion (has promotion_targets):
     eligibleLaar = sum(item.price × qty) for items IN targets AND NOT IN exclusions
     discount = floor(eligibleLaar × value / 10000)   [percentage]
              = min(value, eligibleLaar)               [fixed_amount]
   Apply discount to the matching line items only.
   Running subtotal decreases.

2. ORDER-LEVEL PROMO DISCOUNTS
   For each order-scoped promotion (no promotion_targets):
     discount = floor(remainingSubtotalLaar × value / 10000)   [percentage]
              = min(value, remainingSubtotalLaar)               [fixed_amount]
   Apply to running subtotal.
   Non-stackable: only highest-priority applies; stackable: all apply.

3. LOYALTY DISCOUNT
   From active loyalty_hold.points → laariForPoints(points)
   Cap: min(loyaltyDiscountLaar, floor(remainingSubtotalLaar × maxRedeemPercent / 100))
   Apply to running subtotal.

4. MANUAL STAFF DISCOUNT
   Applied to running subtotal (POS only).
   Cap: cannot exceed remainingSubtotalLaar.

5. GUARD — discountedSubtotalLaar = max(0, subtotalLaar − allDiscounts)

6. TAX
   if TAX_INCLUSIVE: tax is already in price; extract = round(discountedSubtotalLaar × rate / (10000 + rate))
   if !TAX_INCLUSIVE: tax = round(discountedSubtotalLaar × rate / 10000)
   Rounding: standard half-up to nearest laari.

7. GRAND TOTAL
   grandTotalLaar = discountedSubtotalLaar + taxLaar  (if !TAX_INCLUSIVE)
   grandTotalLaar = discountedSubtotalLaar             (if TAX_INCLUSIVE)
```

### 7C.2 Money value object

```php
// Domains/Shared/ValueObjects/Money.php
final readonly class Money
{
    public function __construct(
        public int    $amountLaar,   // always integer, always laari
        public string $currency,     // ISO 4217, e.g. 'MVR'
    ) {}

    public function add(Money $other): self { ... }
    public function subtract(Money $other): self { ... }

    /** Percentage discount: floor(amount × basisPoints / 10000) */
    public function percentageDiscount(int $basisPoints): self { ... }

    /** Tax inclusive extraction: round(amount × rate / (10000 + rate)) */
    public function extractTax(int $rateBp): self { ... }

    /** Tax exclusive addition: round(amount × rate / 10000) */
    public function addTax(int $rateBp): self { ... }

    public function toMvr(): string { return number_format($this->amountLaar / 100, 2); }
    public function isZero(): bool { return $this->amountLaar === 0; }
    public function isNegative(): bool { return $this->amountLaar < 0; }
}
```

All arithmetic in `Money`. **No raw floats anywhere in discount/tax calculations.**

### 7C.3 `TotalsBreakdown` as the canonical API response

Every endpoint that returns order totals MUST use `TotalsBreakdown`:
```json
{
  "subtotal_laar": 15000,
  "subtotal_mvr": "150.00",
  "item_promo_discount_laar": 0,
  "order_promo_discount_laar": 1500,
  "loyalty_discount_laar": 2000,
  "manual_discount_laar": 0,
  "total_discount_laar": 3500,
  "discounted_subtotal_laar": 11500,
  "tax_laar": 0,
  "grand_total_laar": 11500,
  "grand_total_mvr": "115.00",
  "currency": "MVR",
  "applied_promotions": [
    { "code": "SUMMER10", "discount_laar": 1500 }
  ],
  "loyalty_points_held": 200
}
```

---

## PHASE 7D — SECURITY / AUTH / GOVERNANCE

### 7D.1 Auth middleware per route group

| Route group | Middleware |
|---|---|
| `GET /api/promotions/validate` | none (public) / throttle:20,1 |
| `POST /api/orders/{id}/apply-promo` | `auth:sanctum` |
| `DELETE /api/orders/{id}/promo/{id}` | `auth:sanctum` |
| `GET /api/loyalty/me` | `auth:sanctum` (customer token only) |
| `POST /api/loyalty/hold*` | `auth:sanctum` (customer token only) |
| `DELETE /api/loyalty/hold/{orderId}` | `auth:sanctum` (customer token only) |
| `/api/admin/promotions/*` | `auth:sanctum` + `can:admin.promotions` |
| `/api/admin/loyalty/*` | `auth:sanctum` + `can:admin.loyalty` |
| `/api/admin/reports/*` | `auth:sanctum` + `can:admin.reports` |

**Important:** Customer tokens must NOT be able to call admin endpoints. Staff tokens must NOT be able to call `/api/loyalty/me` (customer balance view). Enforce this with policy checks in controllers.

### 7D.2 Audit hooks

All audit entries go through `AuditLogService` (existing service, route to `Domains/Audit/Services/`).

| Action | Actor | Logged fields |
|---|---|---|
| Promotion created | staff | promotion_id, code, name, staff_id |
| Promotion updated | staff | promotion_id, changed_fields, staff_id |
| Promotion disabled/deleted | staff | promotion_id, staff_id |
| Promo redeemed | system (listener) | promotion_id, order_id, customer_id, discount_laar |
| Loyalty points adjusted | staff | customer_id, points, reason, staff_id |
| Loyalty hold created | customer | customer_id, order_id, points |
| Loyalty hold consumed | system (listener) | customer_id, order_id, points |
| Loyalty hold released/expired | system | customer_id, order_id, reason |

---

## PHASE 8 — COMPLETE TEST SUITE

### 8.1 Contract tests pass throughout all phases (non-negotiable)

### 8.2 Feature tests (add after implementation)

**Payments:**
1. Webhook idempotency — same webhook twice → payment status changes once
2. Split payment — two partial payments → `OrderPaid` fires only after sum >= total
3. Order completion idempotency — `OrderCompleted` listeners do not duplicate effects
4. Receipt resend cooldown — cannot resend more than once per 5 minutes
5. Print retry no-duplicate — retrying does not create second finalized print record
6. Return URL safety — GET `/payments/bml/return` never changes payment status
7. Amount mismatch — webhook with wrong amount marks payment `suspicious`, does not confirm

**Promotions (v3 patched workflow):**
8. **Apply promo does NOT create redemption row** — `order_promotions` row created; `promotion_redemptions` NOT created
9. **Redemption created ONLY after OrderPaid** — `ConsumePromoRedemptionsListener` fires, creates row
10. **Idempotency: OrderPaid fired twice** — only one `promotion_redemptions` row, usage count incremented once
11. **Cancelled order does NOT consume usage** — cancel order after apply-promo → no redemption row, limit unchanged
12. **Exclusion rules affect totals** — drinks excluded from 10% promo → discount only on non-drink items
13. **Code case-insensitive** — `" summer10 "`, `"SUMMER10"`, `"Summer10"` all resolve to same promotion
14. **Validate expired code** — `valid: false`, error `"Code expired"`
15. **Validate usage limit reached** — global limit enforced at validation time
16. **Validate per-customer limit** — customer-specific limit enforced
17. **Validate min order amount** — cart below minimum → `valid: false`
18. **Validate channel restriction** — online-only code on POS → `valid: false`
19. **Non-stackable stacking** — second promo attempt when first is non-stackable → only first applied
20. **PromotionEvaluator percentage floor** — 10% of 15001 laari = 1500 (floor, not 1500.1)
21. **PromotionEvaluator fixed amount cap** — fixed discount never exceeds subtotal

**Loyalty (v3 patched workflow):**
22. **Hold created** — `POST /api/loyalty/hold` creates `loyalty_holds` row, no ledger entry
23. **Hold refreshed** — second `POST /api/loyalty/hold` for same order updates `expires_at`, does NOT create duplicate
24. **Hold expires** — `app:expire-loyalty-holds` marks expired hold; points_held decremented
25. **OrderPaid consumes hold** — `ConsumeLoyaltyHoldListener` creates ledger redeem entry, decrements balance
26. **ConsumeLoyaltyHoldListener idempotent** — fired twice → one ledger entry, balance decremented once
27. **Cancel releases hold** — `DELETE /api/loyalty/hold/{orderId}` marks hold released, no ledger entry
27a. **FIX 3 — expired hold honoured on payment** — hold expires, customer pays anyway → redemption still applied, warning logged, balance checked
27b. **FIX 3 — expired hold + insufficient balance** — hold expired AND balance now too low → redemption skipped, order flagged for admin review, payment NOT failed
28. **Earn points idempotent** — `EarnPointsFromOrderListener` fired twice → one earn ledger entry
29. **No points for anonymous orders** — no `customer_id` → no ledger entry
30. **Points not earned on partial payment** — partial payment only → `OrderPaid` not fired → no earn entry
31. **Redeem below minimum** — `validateRedemption` returns error
32. **Redeem exceeds available** — `availablePoints` accounts for existing holds; error if insufficient
33. **Manual adjustment audit** — admin adjust creates ledger entry + audit log entry

**Totals Calculator (v3 deterministic stacking):**
34. **Correct stacking order** — item promo → order promo → loyalty → manual; each step uses reduced subtotal
35. **Tax after all discounts** — tax computed on discountedSubtotal, not original subtotal
36. **Tax-inclusive extraction** — correct extraction formula
37. **Grand total never negative** — guard at step 5 always clamps to 0
38. **Golden output test** — `OrderTotalsCalculator` with all discount types + tax → exact laari values match fixture

### 8.3 Unit tests

**Core:**
- All 5 state machine transition tables (valid + invalid)
- `Money` value object — add, subtract, percentageDiscount, addTax, extractTax; floor vs round
- BML signature verification (valid + tampered body)
- `FakeGateway` returns expected DTOs

**Promotions:**
- `PromotionEvaluator::validateCode` — each rule in isolation
- `ExclusionRule` — excluded items correctly removed from eligible subtotal
- `PromotionEvaluator::evaluate` — priority + stacking combinations
- `PromotionEvaluator` percentage — floor(15001 × 1000 / 10000) = 1500

**Loyalty:**
- `PointsCalculator::pointsToEarn` — various amounts, floor rounding, tier multiplier
- `PointsCalculator::laariForPoints` — conversion, floor
- `PointsCalculator::validateRedemption` — all edge cases (min, max, percent cap, balance)
- `LoyaltyHoldService` — create, refresh, consume, release, expire lifecycle
- `LoyaltyLedgerService::recalculateBalance` — matches cached balance

### 8.4 Contract tests for new endpoints (do NOT alter existing snapshots)

New snapshot files only (add alongside existing ones):
```
tests/Contracts/snapshots/promotions.validate.valid.json
tests/Contracts/snapshots/promotions.validate.expired.json
tests/Contracts/snapshots/promotions.apply-to-order.json
tests/Contracts/snapshots/promotions.remove-from-order.json
tests/Contracts/snapshots/admin.promotions.index.json
tests/Contracts/snapshots/admin.promotions.show.json
tests/Contracts/snapshots/loyalty.me.json
tests/Contracts/snapshots/loyalty.hold-preview.json
tests/Contracts/snapshots/loyalty.hold.create.json
tests/Contracts/snapshots/admin.loyalty.adjust.json
tests/Contracts/snapshots/admin.reports.promotions.json
tests/Contracts/snapshots/admin.reports.loyalty.json
```

---

## PHASE 9 — CLEANUP & DOCS (ONLY AFTER PARITY)

Only after ALL contract tests pass:

1. Remove orphan files and legacy dead code safely
2. Delete old flat `app/Services/*` after wrapping Actions confirmed by tests
3. Write `backend/README.md`:
   - Domain map diagram
   - Critical flows (order → payment → completion → receipt → print → inventory)
   - How to run locally (Docker + `.env` setup)
   - How to run tests (`composer test`)
   - How to format (`composer format`)
   - Environment variables list (no secrets, just what each var does)
   - BML setup checklist
4. Update `backend/ARCHITECTURE_AUDIT.md` to reflect final architecture

---

## FakeGateway (for testing)

```php
<?php
namespace App\Domains\Payments\Gateways;

use App\Domains\Payments\Contracts\PaymentGatewayInterface;
use App\Domains\Payments\DTO\{InitiatePaymentDTO, VerifiedCallbackDTO, GatewayStatusDTO};
use App\Models\Payment;
use Illuminate\Http\Request;

class FakeGateway implements PaymentGatewayInterface
{
    public function initiate(Payment $payment, array $context = []): InitiatePaymentDTO
    {
        return new InitiatePaymentDTO(
            redirectUrl: 'https://fake-bml.test/pay/' . $payment->merchant_reference,
            externalReference: 'FAKE-' . $payment->merchant_reference,
        );
    }

    public function verifyWebhook(Request $request): VerifiedCallbackDTO
    {
        $payload = $request->all();
        return new VerifiedCallbackDTO(
            verified: true,
            merchantReference: $payload['localId'] ?? null,
            providerReference: $payload['id'] ?? null,
            status: $payload['state'] ?? 'completed',
            rawPayload: $payload,
            isConfirmed: true,
        );
    }

    public function queryStatus(Payment $payment): ?GatewayStatusDTO
    {
        return new GatewayStatusDTO(
            status: 'confirmed',
            isConfirmed: true,
            providerReference: 'FAKE-REF',
            rawData: [],
        );
    }
}
```

---

## WHAT NOT TO DO

- Do NOT move Eloquent models out of `App\Models`
- Do NOT change any existing API endpoint paths
- Do NOT change any existing request/response JSON shapes
- Do NOT confirm BML payments on the return URL — webhook only
- Do NOT commit real BML credentials — `.env` only
- Do NOT log full raw webhook payloads unredacted
- Do NOT log secrets under any circumstances
- Do NOT bind `NotifierInterface` to `NotificationDispatcher`
- Do NOT add unique constraints without first running deduplication check
- Do NOT create microservices — one app, one DB
- Do NOT use `round()` for discount or points calculations — always `floor()`
- Do NOT use `round()` for tax — use standard half-up `round()`; document this explicitly
- Do NOT deduct loyalty points at order creation — only after `OrderPaid`
- Do NOT create `promotion_redemptions` at apply-promo time — only after `OrderPaid` via listener
- Do NOT skip the promo `idempotency_key` — race conditions will cause double discounts
- Do NOT decrement loyalty `points_balance` when creating a hold — only on hold consumed
- Do NOT use raw float anywhere in Money calculations — always integer laari via `Money` value object
- Do NOT alter existing contract test snapshots — only add new ones
- Do NOT allow customer tokens to access `/api/admin/*` routes
- Do NOT allow staff tokens to call `/api/loyalty/me` (customer-only endpoint)
- Do NOT use `OrderCompleted` as the trigger for earning/consuming loyalty or promos — use `OrderPaid`
- Do NOT skip expired holds in `ConsumeLoyaltyHoldListener` — honour them if balance allows; never fail a confirmed payment over a discount
- Do NOT forget `redemptions_count` column on `promotions` table — the migration must include it or the atomic increment will fail

---

## EXECUTION ORDER SUMMARY

```
Phase 0:  ARCHITECTURE_AUDIT.md → contract tests → Pint → CI
Phase 1:  Domains skeleton → DomainsServiceProvider → DomainsEventServiceProvider
Phase 2:  State machines → idempotency migrations (with dedup check) → after-commit listeners
Phase 3:  Thin controllers → replace closures with controllers
Phase 4:  Notifications → Receipts → Printing domains
Phase 5:  Orders domain → OrderTotalsCalculator (DiscountsInput + TotalsBreakdown) → events → listeners
Phase 6:  Inventory domain → ledger alignment
Phase 7:  Payments domain → BML gateway → webhook security → split payments
Phase 7A: Promotions domain → PromotionEvaluator + rules + exclusions → draft workflow (order_promotions)
          → ConsumePromoRedemptionsListener (OrderPaid only) → admin API → audit hooks
Phase 7B: Loyalty domain → holds mechanism → LoyaltyLedgerService + PointsCalculator
          → ConsumeLoyaltyHoldListener + EarnPointsFromOrderListener → customer + admin API
Phase 7C: Stacking + tax + rounding → Money value object → deterministic TotalsCalculator
Phase 7D: Security/auth middleware per route → audit hooks wired
Phase 8:  Full test suite (contract + feature + unit) — 38+ tests
Phase 9:  Cleanup → README → final ARCHITECTURE_AUDIT update
          → add Artisan commands: app:expire-loyalty-holds, app:reconcile-loyalty-balances
```

Contract tests must pass at the end of every phase. Proceed automatically through all phases without asking unless truly blocked by missing BML signing details.

---

## FINAL DELIVERABLES

1. `backend/ARCHITECTURE_AUDIT.md` — endpoint catalog + workflow descriptions
2. `backend/README.md` — domain map, flows, env vars, BML setup, Promo/Loyalty business rules, rounding docs
3. `.github/workflows/ci.yml` — passing CI
4. `backend/app/Domains/` — full modular structure (19 domains including Promotions + Loyalty)
5. `backend/tests/Contracts/` — 25+ snapshot tests, all passing (existing snapshots unchanged)
6. `backend/config/bml.php`, `config/loyalty.php`, `config/taxes.php`
7. `backend/.env.example` — updated with BML + Loyalty + Promo + Tax placeholders
8. `backend/app/Http/Middleware/VerifyBmlSignature.php`
9. **New migrations:** `promotions`, `promotion_targets`, `order_promotions`, `promotion_redemptions`, `loyalty_accounts`, `loyalty_ledger`, `loyalty_holds`, `loyalty_rules`, `loyalty_tiers`, `webhook_logs`
10. **New Eloquent models:** `Promotion`, `PromotionTarget`, `OrderPromotion`, `PromotionRedemption`, `LoyaltyAccount`, `LoyaltyLedger`, `LoyaltyHold`, `LoyaltyRule`, `LoyaltyTier`
11. **New payment routes:** `POST /api/payments/bml/webhook`, `GET /payments/bml/return`
12. **New promo routes:** `POST /api/promotions/validate`, `POST /api/orders/{id}/apply-promo`, `DELETE /api/orders/{id}/promo/{id}`, admin CRUD + report
13. **New loyalty routes:** `GET /api/loyalty/me`, `POST /api/loyalty/hold-preview`, `POST /api/loyalty/hold`, `DELETE /api/loyalty/hold/{orderId}`, admin endpoints + report
14. `GET /api/system/health` endpoint
15. **Artisan commands:** `app:expire-loyalty-holds`, `app:reconcile-loyalty-balances`
16. `Domains/Shared/ValueObjects/Money.php` — immutable, integer laari, floor/round methods
17. All existing endpoints still return identical responses (contract tests prove this)
18. `composer format` and `composer test` both pass
19. GitHub Actions CI passes

---

## BML REFERENCE CODE (in `akuru-bml-reference/` folder of this zip)

These 9 files are the real working BML implementation from another Laravel project. **Port them — do not reinvent:**

| File | What it is |
|---|---|
| `BmlPaymentProvider.php` | Main gateway: initiate, verifyCallback, queryStatus, authHeaders |
| `BmlConnectService.php` | Lower-level HTTP client, webhook parsing, status mapping |
| `BmlWebhookController.php` | Idempotent webhook handler (always returns 200) |
| `PaymentService.php` | Service with `lockForUpdate` idempotency pattern |
| `PaymentProviderInterface.php` | The contract to implement |
| `PaymentInitiationResult.php` | DTO for initiation result |
| `PaymentVerificationResult.php` | DTO for webhook verification result |
| `bml.config.php` | Full config with all env keys |
| `Payment.model.php` | Model with `local_id`, `amount_laar`, `bml_transaction_id`, `findByBmlReference()` |

---
*Generated from Bake & Grill codebase audit + Akuru BML implementation — Feb 2026*

# Bake & Grill — Model-Based Architecture Refactor Prompt

You are refactoring a full-stack monorepo (Laravel 12 backend + 4 React/Vite frontends) into a clean, model-based architecture where changing one module does NOT affect others.

## Project Structure

```
Bakeandgrill/
├── backend/                    # Laravel 12 + PHP 8.5 API
│   ├── app/
│   │   ├── Domains/           # DDD domains (Orders, Payments, Printing, Inventory, Loyalty, Promotions, Delivery, KitchenDisplay, Notifications, Realtime)
│   │   ├── Http/Controllers/Api/
│   │   ├── Models/            # 44 Eloquent models
│   │   ├── Services/          # Shared services
│   │   └── Providers/Domains/ # DomainEventServiceProvider
│   └── routes/api.php
├── apps/
│   ├── pos-web/               # Point of Sale (React)
│   ├── online-order-web/      # Customer ordering (React)
│   ├── kds-web/               # Kitchen Display System (React)
│   └── admin-dashboard/       # Admin panel (React)
├── packages/shared/           # Shared types (minimal)
└── print-proxy/               # Node.js print server
```

## Problems to Fix

### 1. Backend: Introduce Repository Pattern

**Problem:** Domain services query Eloquent models directly, so changing a DB schema ripples through multiple services.

**Fix:** For each major domain, create a repository interface and implementation:

```
app/Domains/{Domain}/Repositories/{Model}RepositoryInterface.php   # Contract
app/Domains/{Domain}/Repositories/Eloquent{Model}Repository.php    # Implementation
```

**Rules:**
- Domain services MUST depend on repository interfaces, never on Eloquent models directly.
- Bind interfaces to implementations in each domain's service provider.
- Controllers should NOT query models — they call services, services call repositories.
- Start with the core domains: Orders, Payments, Inventory, Loyalty, Promotions.

**Example:**

```php
// app/Domains/Orders/Repositories/OrderRepositoryInterface.php
namespace App\Domains\Orders\Repositories;

use App\Domains\Orders\DTOs\CreateOrderData;
use App\Models\Order;
use Illuminate\Support\Collection;

interface OrderRepositoryInterface
{
    public function findById(int $id): ?Order;
    public function findByOrderNumber(string $orderNumber): ?Order;
    public function create(CreateOrderData $data): Order;
    public function updateStatus(int $id, string $status): Order;
    public function getActiveOrders(): Collection;
}

// app/Domains/Orders/Repositories/EloquentOrderRepository.php
namespace App\Domains\Orders\Repositories;

use App\Models\Order;
// ... implements OrderRepositoryInterface using Eloquent
```

### 2. Backend: Add DTOs for Cross-Domain Communication

**Problem:** Domains pass raw Eloquent models to each other, creating tight coupling.

**Fix:** Create DTOs (Data Transfer Objects) for data that crosses domain boundaries:

```
app/Domains/{Domain}/DTOs/{Name}Data.php
```

**Rules:**
- Events MUST carry DTOs or primitive IDs, never full Eloquent models.
- When Domain A triggers an event consumed by Domain B, the event payload should be a DTO or just the entity ID (so Domain B fetches its own data via its own repository).
- Use PHP readonly classes for DTOs.

**Example:**

```php
// app/Domains/Orders/DTOs/OrderCreatedData.php
namespace App\Domains\Orders\DTOs;

readonly class OrderCreatedData
{
    public function __construct(
        public int $orderId,
        public string $orderNumber,
        public string $orderType,
        public ?int $customerId,
        public float $totalAmount,
    ) {}

    public static function fromOrder(Order $order): self
    {
        return new self(
            orderId: $order->id,
            orderNumber: $order->order_number,
            orderType: $order->order_type,
            customerId: $order->customer_id,
            totalAmount: $order->total,
        );
    }
}
```

### 3. Backend: Isolate Event Listeners with Error Handling

**Problem:** In `DomainEventServiceProvider.php`, if one listener fails (e.g., printing), it can block other listeners (e.g., inventory deduction, loyalty points).

**Fix:**
- Wrap each listener's `handle()` method in a try-catch that logs errors but does NOT propagate exceptions to other listeners.
- Consider making non-critical listeners (printing, notifications, loyalty) queued so they run asynchronously and don't block the order flow.
- Critical listeners (inventory deduction, promo consumption) can remain synchronous but should still have error isolation.

**Example:**

```php
// app/Domains/Printing/Listeners/DispatchKitchenPrintListener.php
public function handle(OrderCreated $event): void
{
    try {
        // existing print logic
    } catch (\Throwable $e) {
        Log::error('Kitchen print dispatch failed', [
            'order_id' => $event->orderId,
            'error' => $e->getMessage(),
        ]);
        // Do NOT re-throw — other listeners must still run
    }
}
```

For non-critical listeners, implement `ShouldQueue`:

```php
class DispatchKitchenPrintListener implements ShouldQueue
{
    public int $tries = 3;
    public int $backoff = 5;
    // ...
}
```

### 4. Backend: Create Domain Service Providers

**Problem:** All domain bindings are scattered or centralized in one place.

**Fix:** Each domain gets its own service provider that registers its repositories and services:

```
app/Domains/Orders/Providers/OrderServiceProvider.php
app/Domains/Payments/Providers/PaymentServiceProvider.php
app/Domains/Inventory/Providers/InventoryServiceProvider.php
// etc.
```

Register each in `config/app.php` under `providers`.

**Example:**

```php
// app/Domains/Orders/Providers/OrderServiceProvider.php
namespace App\Domains\Orders\Providers;

use Illuminate\Support\ServiceProvider;
use App\Domains\Orders\Repositories\OrderRepositoryInterface;
use App\Domains\Orders\Repositories\EloquentOrderRepository;

class OrderServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->bind(OrderRepositoryInterface::class, EloquentOrderRepository::class);
    }
}
```

### 5. Frontend: Break Up Monolithic Components

**Problem:** `apps/pos-web/src/App.tsx` is ~59KB (one massive file). `apps/online-order-web/src/pages/CheckoutPage.tsx` is 680+ lines mixing UI, business logic, and API calls.

**Fix:** For each frontend app, decompose large files into:

```
src/
├── components/        # Pure UI components (presentational)
│   ├── Cart/
│   ├── Menu/
│   ├── Order/
│   └── Payment/
├── hooks/             # Custom hooks (business logic)
│   ├── useCart.ts
│   ├── useOrder.ts
│   ├── usePayment.ts
│   └── useLoyalty.ts
├── services/          # API calls (data layer)
│   ├── orderService.ts
│   ├── paymentService.ts
│   └── menuService.ts
├── types/             # TypeScript interfaces
├── context/           # React context providers
├── pages/             # Page-level components (compose hooks + components)
└── App.tsx            # Routing and layout only
```

**Rules:**
- **Components** receive data via props — no direct API calls inside.
- **Hooks** contain business logic and call services.
- **Services** are thin wrappers around `api.ts` grouped by domain.
- **Pages** compose hooks and components together.
- `App.tsx` should ONLY handle routing, layout, and top-level providers.

**Priority:** Start with `pos-web/App.tsx` since it's the largest file. Break it into at least:
- `pages/OrderPage.tsx`
- `pages/PaymentPage.tsx`
- `pages/ReportsPage.tsx`
- `pages/InventoryPage.tsx`
- `hooks/useOrderCreation.ts`
- `hooks/usePaymentFlow.ts`
- `components/OrderCart/`
- `components/MenuGrid/`
- `components/PaymentModal/`

### 6. Frontend: Expand Shared Package

**Problem:** Each app duplicates API types and has its own `types.ts` with slightly different definitions for the same backend entities.

**Fix:** Move all shared TypeScript types into `packages/shared/`:

```
packages/shared/
├── src/
│   ├── types/
│   │   ├── order.ts        # Order, OrderItem, OrderStatus
│   │   ├── product.ts      # MenuItem, Category, Modifier
│   │   ├── customer.ts     # Customer, LoyaltyAccount
│   │   ├── payment.ts      # Payment, PaymentMethod
│   │   └── index.ts        # Re-exports
│   ├── api/
│   │   ├── client.ts       # Base axios/fetch client with interceptors
│   │   ├── endpoints.ts    # API endpoint constants
│   │   └── index.ts
│   └── index.ts
├── package.json
└── tsconfig.json
```

**Rules:**
- All apps import types from `@bakeandgrill/shared` (workspace dependency).
- When a backend API response shape changes, update ONE type definition, not four.
- Each app can extend shared types if it has app-specific fields.
- The shared API client should handle auth token injection, error handling, and base URL configuration.

## Execution Order

Do this in phases. Each phase should result in a working, testable state:

**Phase 1 — Backend Repositories + DTOs (no frontend changes)**
1. Create repository interfaces and Eloquent implementations for: Order, Payment, Customer, MenuItem, Inventory.
2. Create DTOs for cross-domain event payloads.
3. Refactor domain services to use repository interfaces instead of direct Eloquent calls.
4. Create per-domain service providers and register them.
5. Update event classes to carry DTOs instead of full models.
6. Verify all existing API endpoints still work (run tests, hit endpoints).

**Phase 2 — Backend Event Isolation**
1. Add try-catch error isolation to all event listeners.
2. Make non-critical listeners (Printing, Notifications, Loyalty earning) implement `ShouldQueue`.
3. Keep critical listeners (Inventory deduction, Promo consumption) synchronous but error-isolated.
4. Test that a printing failure does NOT block order creation.

**Phase 3 — Frontend Shared Package**
1. Audit all `types.ts` files across the 4 apps and unify into `packages/shared/src/types/`.
2. Create the shared API client in `packages/shared/src/api/`.
3. Update each app to import from `@bakeandgrill/shared`.
4. Remove duplicated type definitions from individual apps.

**Phase 4 — Frontend Component Decomposition**
1. Break `pos-web/App.tsx` into pages, hooks, components, and services.
2. Break `online-order-web/CheckoutPage.tsx` into composable pieces.
3. Apply the same pattern to `kds-web` and `admin-dashboard` if they have large files.
4. Ensure each app still works after decomposition.

## Constraints

- Do NOT change any API endpoint URLs or response shapes — this is an internal refactor.
- Do NOT change database schema or migrations.
- Do NOT rename database columns or tables.
- Preserve all existing functionality — this is a refactor, not a feature change.
- Keep backward compatibility: if any external service depends on current behavior, don't break it.
- Run existing tests after each phase to verify nothing is broken.
- Use PHP 8.5 features (readonly classes, enums, named arguments) where appropriate.
- Use TypeScript strict mode in all frontend code.

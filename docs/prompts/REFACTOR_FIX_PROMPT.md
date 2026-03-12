# Bake & Grill — Refactor Completion Fix Prompt

You are fixing 3 remaining gaps in a model-based architecture refactor. The repository pattern infrastructure is already in place — interfaces, Eloquent implementations, and service providers all exist. But 2 backend services bypass their repositories, and 1 frontend app uses raw `fetch` instead of the shared API client.

## Project Context

- **Backend:** Laravel 12 + PHP 8.5, DDD with `app/Domains/{Domain}/` structure
- **Frontend:** React/Vite monorepo with `packages/shared/` providing `createApiClient()` and unified types
- **Pattern:** Services must depend on repository interfaces (DI), never import Eloquent models directly

---

## Fix 1: `LoyaltyLedgerService` — Wire to Repositories

**File:** `backend/app/Domains/Loyalty/Services/LoyaltyLedgerService.php`

**Problem:** This service directly uses `LoyaltyAccount::firstOrCreate()`, `LoyaltyAccount::where()`, `LoyaltyHold::where()`, `LoyaltyHold::updateOrCreate()`, `LoyaltyLedger::firstOrCreate()`, `LoyaltyLedger::create()`, and `DB::table('loyalty_accounts')` raw queries. It completely ignores the existing `CustomerRepositoryInterface`.

**Fix:**

1. **Expand the repository interface.** Add a new `LoyaltyAccountRepositoryInterface` in `app/Domains/Loyalty/Repositories/` with methods that cover every Eloquent operation the service currently does:

```php
// app/Domains/Loyalty/Repositories/LoyaltyAccountRepositoryInterface.php
namespace App\Domains\Loyalty\Repositories;

use App\Models\LoyaltyAccount;
use App\Models\LoyaltyHold;
use App\Models\LoyaltyLedger;

interface LoyaltyAccountRepositoryInterface
{
    public function getOrCreateAccount(int $customerId): LoyaltyAccount;
    public function lockAccount(int $customerId): ?LoyaltyAccount;
    public function incrementPointsHeld(int $customerId, int $points): void;
    public function updateBalance(int $customerId, int $balance, ?int $addLifetime = null): void;
    public function decrementPointsHeld(int $customerId, int $points): void;
}
```

2. **Add a `LoyaltyHoldRepositoryInterface`:**

```php
// app/Domains/Loyalty/Repositories/LoyaltyHoldRepositoryInterface.php
namespace App\Domains\Loyalty\Repositories;

use App\Models\LoyaltyHold;

interface LoyaltyHoldRepositoryInterface
{
    public function findActiveByOrderId(int $orderId): ?LoyaltyHold;
    public function upsertForOrder(int $orderId, array $attributes): LoyaltyHold;
    public function markConsumed(LoyaltyHold $hold): void;
    public function markReleased(LoyaltyHold $hold): void;
}
```

3. **Add a `LoyaltyLedgerRepositoryInterface`:**

```php
// app/Domains/Loyalty/Repositories/LoyaltyLedgerRepositoryInterface.php
namespace App\Domains\Loyalty\Repositories;

use App\Models\LoyaltyLedger;

interface LoyaltyLedgerRepositoryInterface
{
    public function existsByIdempotencyKey(string $key): bool;
    public function createEntry(array $attributes): LoyaltyLedger;
    public function firstOrCreateByIdempotencyKey(string $key, array $attributes): LoyaltyLedger;
}
```

4. **Create Eloquent implementations** for each interface in the same directory, moving the raw Eloquent/DB calls from the service into these implementations.

5. **Refactor `LoyaltyLedgerService`:**
   - Remove all `use App\Models\LoyaltyAccount`, `use App\Models\LoyaltyHold`, `use App\Models\LoyaltyLedger` imports
   - Remove `use Illuminate\Support\Facades\DB` (move raw DB queries into repository implementations)
   - Inject `LoyaltyAccountRepositoryInterface`, `LoyaltyHoldRepositoryInterface`, `LoyaltyLedgerRepositoryInterface` via constructor
   - Replace all direct model calls with repository method calls
   - Keep `DB::transaction()` wrappers in the service (transaction boundaries are service-level concerns)

6. **Register bindings** in `app/Domains/Loyalty/Providers/LoyaltyServiceProvider.php`:

```php
public function register(): void
{
    $this->app->bind(CustomerRepositoryInterface::class, EloquentCustomerRepository::class);
    $this->app->bind(LoyaltyAccountRepositoryInterface::class, EloquentLoyaltyAccountRepository::class);
    $this->app->bind(LoyaltyHoldRepositoryInterface::class, EloquentLoyaltyHoldRepository::class);
    $this->app->bind(LoyaltyLedgerRepositoryInterface::class, EloquentLoyaltyLedgerRepository::class);
}
```

**Verify:** After refactoring, `LoyaltyLedgerService` should have ZERO direct Eloquent model imports. All database access goes through injected repositories.

---

## Fix 2: `PromotionEvaluator` — Wire to Repository

**File:** `backend/app/Domains/Promotions/Services/PromotionEvaluator.php`

**Problem:** This service directly calls `Promotion::where('code', ...)->with(['targets'])->first()` and `PromotionRedemption::where(...)`. It ignores the existing `PromotionRepositoryInterface` which already has `findByCodeWithRelations()`.

**Existing repository interface** (`app/Domains/Promotions/Repositories/PromotionRepositoryInterface.php`):
```php
interface PromotionRepositoryInterface
{
    public function findByCode(string $code): ?Promotion;
    public function findByCodeWithRelations(string $code, array $relations): ?Promotion;
    public function findById(int $id): ?Promotion;
    public function incrementRedemptionsCount(int $promotionId): void;
}
```

**Fix:**

1. **Add a `PromotionRedemptionRepositoryInterface`:**

```php
// app/Domains/Promotions/Repositories/PromotionRedemptionRepositoryInterface.php
namespace App\Domains\Promotions\Repositories;

interface PromotionRedemptionRepositoryInterface
{
    public function countByPromotionAndCustomer(int $promotionId, int $customerId): int;
}
```

2. **Create `EloquentPromotionRedemptionRepository`** implementing it.

3. **Refactor `PromotionEvaluator`:**
   - Remove `use App\Models\Promotion` and `use App\Models\PromotionRedemption`
   - Add constructor with DI:
     ```php
     public function __construct(
         private PromotionRepositoryInterface $promotionRepo,
         private PromotionRedemptionRepositoryInterface $redemptionRepo,
     ) {}
     ```
   - Replace `Promotion::where('code', $normalizedCode)->with(['targets'])->first()` with `$this->promotionRepo->findByCodeWithRelations($normalizedCode, ['targets'])`
   - Replace `PromotionRedemption::where(...)->count()` with `$this->redemptionRepo->countByPromotionAndCustomer($promotion->id, $customerId)`

4. **Register bindings** in `app/Domains/Promotions/Providers/PromotionsServiceProvider.php`:

```php
public function register(): void
{
    $this->app->bind(PromotionRepositoryInterface::class, EloquentPromotionRepository::class);
    $this->app->bind(PromotionRedemptionRepositoryInterface::class, EloquentPromotionRedemptionRepository::class);
}
```

**Verify:** After refactoring, `PromotionEvaluator` should have ZERO direct Eloquent model imports. It only depends on repository interfaces.

---

## Fix 3: `pos-web/api.ts` — Migrate to Shared API Client

**File:** `apps/pos-web/src/api.ts` (490 lines)

**Problem:** This file uses raw `fetch()` calls with manual `handleResponse()`, manual `Authorization` header injection, and manual base URL construction. The other 3 apps (`online-order-web`, `admin-dashboard`, `kds-web`) already use `createApiClient()` from `@shared/api`.

**Existing shared client** (`packages/shared/src/api/client.ts`):
```ts
createApiClient({ baseUrl, getToken? }) → { request(path, opts?) }
```
- Automatically injects `Authorization: Bearer` header if `getToken` returns a value
- Automatically sets `Content-Type: application/json`
- Handles non-ok responses by throwing
- Handles 204 No Content

**Fix:**

1. **Replace the top of `api.ts`:**

```ts
import { createApiClient } from '@shared/api';
import type { Category, MenuItem as Item, RestaurantTable, StaffLoginResponse } from '@shared/types';

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  (import.meta.env.PROD ? '/api' : 'http://localhost:8000/api');

// POS uses a token stored in component state, passed per-call.
// Create a client WITHOUT getToken — we'll pass auth headers manually for authed calls,
// OR store token in a module-level variable and use getToken.
let _token: string | null = null;
export function setAuthToken(t: string | null) { _token = t; }

const { request } = createApiClient({
  baseUrl: API_BASE_URL,
  getToken: () => _token,
});
```

2. **Delete** the `handleResponse()` function.

3. **Refactor each exported function** to use `request()` instead of raw `fetch()`. Remove manual header construction. Examples:

```ts
// Before:
export async function fetchCategories(): Promise<Category[]> {
  const response = await fetch(`${apiBaseUrl}/categories`, {
    headers: { "Content-Type": "application/json" },
  });
  const data = await handleResponse<{ categories: Category[] }>(response);
  return data.categories ?? [];
}

// After:
export async function fetchCategories(): Promise<Category[]> {
  const data = await request<{ categories: Category[] }>('/categories');
  return data.categories ?? [];
}

// Before (authed):
export async function createOrder(token: string, payload: { ... }): Promise<...> {
  const response = await fetch(`${apiBaseUrl}/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}

// After (token handled by client via setAuthToken):
export async function createOrder(payload: { ... }): Promise<...> {
  return request('/orders', { method: 'POST', body: JSON.stringify(payload) });
}
```

4. **Update callers.** Because authed functions currently take `token` as the first parameter, you have two options:
   - **Option A (recommended):** Call `setAuthToken(token)` once after login in `App.tsx`, then remove `token` param from all api functions. Update all call sites in hooks (`useOrderCreation.ts`, `useOps.ts`, `useCart.ts`) to drop the token argument.
   - **Option B (minimal change):** Keep `token` param but ignore it — still use the module-level `_token`. This avoids touching callers but leaves dead params.

   **Go with Option A** — it matches how the other apps work.

5. **Remove the local `SalesSummary` type** — add it to `packages/shared/src/types/order.ts` or a new `reports.ts` file in the shared types, since admin-dashboard may need it too.

6. **Call `setAuthToken()`** in `App.tsx` after successful login and clear it on logout:
```ts
import { setAuthToken } from './api';

// After login:
setAuthToken(data.token);

// On logout:
setAuthToken(null);
```

**Verify:** After refactoring, `api.ts` should have NO raw `fetch()` calls, NO `handleResponse()` function, and should import `createApiClient` from `@shared/api`. All 4 apps now use the same shared HTTP client.

---

## Constraints

- Do NOT change any API endpoint URLs or response shapes.
- Do NOT change database schema.
- Preserve all existing functionality — this is a refactor, not a feature change.
- Keep `DB::transaction()` in services (transaction boundaries are service concerns, not repository concerns).
- Use PHP 8.5 readonly classes for new interfaces/implementations where appropriate.
- Run existing tests after each fix to verify nothing breaks.

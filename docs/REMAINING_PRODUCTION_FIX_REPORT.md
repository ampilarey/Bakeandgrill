# Bake & Grill — Remaining Production Fix Report

Generated: 2026-04-09

---

## 1. Confirmed Remaining Issues

All issues below were verified by reading actual code before any change was made.

### Issue 1 — `delivery-web` missing from `build-all.sh`
- **Severity:** Medium
- **Affected files:** `scripts/build-all.sh`
- **Verified:** `build-all.sh` listed only four targets (`order`, `admin`, `kds`, `pos`). `delivery-web` (`apps/delivery-web`) was built by CI but had no local build+publish script entry. Its Vite `base` is `/driver/` (not `/delivery/`), so the destination path also required special handling. Manual calls to `build-all.sh` would never update `backend/public/driver/`.

### Issue 2 — Promotion apply/remove: no staff permission check
- **Severity:** High
- **Affected files:** `backend/routes/api.php`, `backend/app/Http/Controllers/Api/PromotionController.php`
- **Verified:** `POST /orders/{orderId}/apply-promo` and `DELETE /orders/{orderId}/promo/{id}` were under plain `auth:sanctum`. Any authenticated staff user regardless of role or permission could apply or remove discounts. The `promotions.discounts` permission slug existed in the seeder but was never enforced on these routes. The `PermissionSeeder::STAFF_GRANTED` also did not include `promotions.view` or `promotions.discounts`, meaning even owner-granted staff had no default path to use this.

### Issue 3 — `removeFromOrder` race condition (no `lockForUpdate`)
- **Severity:** Medium
- **Affected files:** `backend/app/Http/Controllers/Api/PromotionController.php`
- **Verified:** `applyToOrder` re-locks the order row via `Order::lockForUpdate()->findOrFail()` inside its `DB::transaction`. `removeFromOrder` did not — it loaded the order before the transaction and never re-locked. A concurrent payment could set the order to `paid` between the pre-check and the `update`, producing a stale promo discount row without an offsetting recalculation.

### Issue 4 — `CustomerDisplayController` wrong column names (silent nulls)
- **Severity:** High
- **Affected files:** `backend/app/Http/Controllers/Api/CustomerDisplayController.php`
- **Verified:** The controller selected columns `tax`, `discount`, `tip` from the `orders` table. The actual migration columns are `tax_amount`, `discount_amount`, `tip_amount`. Eloquent silently returns `null` for non-existent selected columns. Every customer display screen showed `null` for tax, discount, and tip in the order summary.

### Issue 5 — `StaffAuthTest` sent wrong request payload
- **Severity:** Medium (test correctness)
- **Affected files:** `backend/tests/Feature/StaffAuthTest.php`
- **Verified:** `StaffAuthController::pinLogin` was previously refactored to require a `username` (email) field. The existing test sent only `pin` and `device_identifier`, which would produce a 422 validation error, not the asserted 200. The test had no coverage for the negative cases (wrong PIN, unknown email, missing username, inactive user).

### Issue 6 — `OrderController::addPayments` closure missing `$printReceipt` in `use` list
- **Severity:** High (runtime crash on payment)
- **Affected files:** `backend/app/Http/Controllers/Api/OrderController.php`
- **Verified:** `$printReceipt` was defined at the method level then referenced inside `DB::afterCommit()` which is nested inside `DB::transaction(function () use ($id, $validated, $request)`. The outer closure did not include `$printReceipt` in its `use` list, so the inner `afterCommit` closure captured an undefined variable. This caused a PHP `RuntimeException: Undefined variable $printReceipt` whenever a full cash payment was posted.

### Issue 7 — Migration `2026_03_22_100000_remove_guest_fields_from_orders_table` not SQLite-compatible
- **Severity:** Medium (blocks all CI tests)
- **Affected files:** `backend/database/migrations/2026_03_22_100000_remove_guest_fields_from_orders_table.php`
- **Verified:** The `up()` method used MySQL-specific `UPDATE ... JOIN ... SET` syntax, which SQLite does not support. Additionally, `dropColumn(['guest_token', ...])` failed on SQLite because the `orders_guest_token_unique` index was not dropped first. Both errors caused the entire test migration to abort, blocking every feature test.

---

## 2. Fixes Applied

### Fix 1 — `scripts/build-all.sh`

Added `delivery-web` as a fifth build target, mapping it to `backend/public/driver/` (not `backend/public/delivery/`) because `apps/delivery-web/vite.config.ts` sets `base: '/driver/'`. Introduced a separate `APP_PUBLIC` associative array to decouple the target short-name from the destination directory name. The default `TARGETS` array now includes `"delivery"`.

**API behavior changed:** None. Script only.

### Fix 2 — `backend/routes/api.php`

Reverted to a single `auth:sanctum` group for apply/remove routes (duplicate route registrations for the same URI silently overwrite each other in Laravel). The authorization matrix is now enforced inside the controller (see Fix 3). Added a comment documenting the expected matrix.

**API behavior changed:** Staff without `promotions.discounts` now receive `403`; previously any authenticated staff could apply discounts.

### Fix 3 — `backend/app/Http/Controllers/Api/PromotionController.php`

**`applyToOrder`:** Added an `else` branch for staff actors that calls `$user->hasPermission('promotions.discounts')` and returns 403 if the permission is absent. The customer IDOR guard is preserved unchanged in the `if ($isCustomerActor)` branch.

**`removeFromOrder`:** Mirrors the permission check added to `applyToOrder`. Additionally restructured the transaction to:
- Load `$order = Order::lockForUpdate()->findOrFail($orderId)` inside `DB::transaction`.
- Re-check terminal status under the lock, returning a `$removed = false` early exit.
- Return `409 Conflict` if `$removed` is false at the end of the method.
- Cast `$order->customer_id` to `int` in the customer IDOR comparison.

**API behavior changed:** `removeFromOrder` now returns `409` when a concurrent transition makes the order unmodifiable (previously it would silently update a terminal order's promo records). Pre-check terminal orders return `422` as before.

### Fix 4 — `backend/app/Http/Controllers/Api/CustomerDisplayController.php`

Changed `->select(...)` to use `tax_amount`, `discount_amount`, `tip_amount`. Updated response map to read `$order->tax_amount`, `$order->discount_amount`, `$order->tip_amount`. The response JSON keys remain `tax`, `discount`, `tip` for backward compatibility with display screens.

**API behavior changed:** These three fields now return actual numeric values instead of `null`.

### Fix 5 — `backend/tests/Feature/StaffAuthTest.php`

Rewrote the test file. The single passing test is now `test_staff_can_login_with_username_and_pin` (adds `username` to the payload). Added four new negative tests: missing username, wrong PIN, unknown email, inactive user.

**API behavior changed:** None. Test-only.

### Fix 6 — `backend/app/Http/Controllers/Api/OrderController.php`

Added `$printReceipt` to the `use` list of the `DB::transaction` closure so it is accessible inside the nested `DB::afterCommit` closure. Without this fix, every successful cash payment threw `RuntimeException: Undefined variable $printReceipt`.

**API behavior changed:** Cash payments now correctly fire `OrderPaid` without crashing.

### Fix 7 — `backend/database/migrations/2026_03_22_100000_remove_guest_fields_from_orders_table.php`

Replaced the MySQL-only `UPDATE ... JOIN ... SET` with an ANSI-compatible correlated subquery (`UPDATE orders SET customer_id = (SELECT id FROM customers WHERE ...) WHERE ...`). Added `$table->dropUnique('orders_guest_token_unique')` before `dropColumn` so the unique index is removed first (required by SQLite). Both MySQL and SQLite now run this migration successfully.

**API behavior changed:** None. Migration only; production MySQL already ran this migration.

### Fix 8 — `backend/database/seeders/PermissionSeeder.php`

Added `promotions.view` and `promotions.discounts` to `STAFF_GRANTED` so front-line cashiers can apply promos at the POS without requiring a manual permission grant per user.

**API behavior changed:** After re-seeding permissions, staff-role users gain `promotions.discounts` by default.

---

## 3. Authorization Hardening

### Promotion apply/remove matrix (enforced in `PromotionController`)

| Actor | Condition | Result |
|---|---|---|
| Unauthenticated | No bearer token | `401` (from `auth:sanctum`) |
| Customer token | Own order | `200` |
| Customer token | Other customer's order | `403` |
| Staff token | Has `promotions.discounts` | `200` |
| Staff token | Missing `promotions.discounts` | `403` |
| Staff token | Terminal order | `422` (pre-check) or `409` (concurrent) |

**Mechanism:**
- Route stays under `auth:sanctum`.
- `applyToOrder` and `removeFromOrder` detect token type via `$user->tokenCan('customer')`.
- Customer branch: IDOR check (`order->customer_id === user->id`).
- Staff branch: `$user->hasPermission('promotions.discounts')`.
- `hasPermission()` is defined in `HasPermissions` trait; owner role bypasses all checks.

---

## 4. Pricing / Promo Integrity Fixes

### `removeFromOrder` race condition

Before: order was loaded outside the transaction, status was pre-checked, then `DB::transaction` ran the `UPDATE` without re-acquiring the lock.

After:
```php
$removed = false;
DB::transaction(function () use ($orderId, $promotionId, &$removed): void {
    $order = Order::lockForUpdate()->findOrFail($orderId);
    if (in_array($order->status, ['paid', 'completed', 'cancelled'], true)) {
        return; // $removed stays false
    }
    // ... release OrderPromotion, recalculate ...
    $removed = true;
});
if (!$removed) {
    return response()->json(['message' => 'Order is no longer modifiable.'], 409);
}
```

`OrderTotalsCalculator::recalculateAndPersist()` is called in both `applyToOrder` and `removeFromOrder` inside the locked transaction, so totals are always consistent with the `promo_discount_laar` value set immediately before.

---

## 5. Deployment / CI / Asset Delivery Fixes

### Current deploy flow

```
Developer machine:
  scripts/build-all.sh [order|admin|kds|pos|delivery]
  → builds each app into apps/<name>/dist/
  → copies to backend/public/{order|admin|kds|pos|driver}/
  → developer commits and pushes

CI (on push to main):
  1. secret-scan
  2. lint (PHP Pint)
  3. test (PHPUnit — SQLite in-memory)
  4. frontend (tsc + vite build for all 5 apps — validates correctness, artifacts not saved)
  5. deploy (SSH → git pull → composer install → artisan migrate/cache/queue:restart)

Production server:
  git pull picks up committed backend/public/ build artifacts
  No Node.js or npm required on the server
```

### What changed

`scripts/build-all.sh` now includes `delivery` as a valid target with `backend/public/driver/` as the destination. Running `./scripts/build-all.sh` without arguments now builds and publishes all five apps.

### Frontend asset strategy

The "build locally, commit artifacts" strategy is intentional and correct for this server (no Node.js installed). The risk — stale assets if `build-all.sh` is not run before pushing — remains. To mitigate: the CI `frontend` job catches TypeScript errors and build failures before deploy. If assets are stale, the only visible symptom is the old UI version serving; no data corruption can result.

---

## 6. Tests Added or Updated

### `backend/tests/Feature/StaffAuthTest.php` (rewritten)
- `test_staff_can_login_with_username_and_pin` — Proves the full new contract works.
- `test_login_without_username_returns_422` — Proves missing field is rejected.
- `test_login_with_wrong_pin_returns_422` — Proves wrong PIN is rejected.
- `test_login_with_unknown_email_returns_422` — Proves unknown email is rejected.
- `test_inactive_user_cannot_login` — Proves inactive accounts cannot authenticate.

### `backend/tests/Feature/PromotionTest.php` (extended)
- `test_staff_with_discounts_permission_can_apply_promo` — Permission positive case.
- `test_staff_without_discounts_permission_cannot_apply_promo` — Permission negative case.
- `test_customer_can_apply_promo_to_own_order` — Customer IDOR positive case.
- `test_customer_cannot_apply_promo_to_another_customers_order` — Customer IDOR negative case.
- `test_unauthenticated_cannot_apply_promo` — Unauthenticated gets 401.
- `test_staff_without_permission_cannot_remove_promo` — Remove permission negative case.
- `test_remove_promo_on_terminal_order_is_rejected` — Terminal state returns 422 or 409.
- `test_apply_and_remove_promo_restores_original_totals` — Proves recalculation symmetry.
- Fixed `test_max_uses_limit_enforced` — Was silently not setting `redemptions_count` (not in `$fillable`); now uses `DB::table()->update()` directly.
- Fixed `test_promo_redemption_count_increments_on_payment` — Added explicit assertions on the payment response so the underlying crash (`Undefined variable $printReceipt`) is visible.

### `backend/tests/Feature/CustomerDisplayTest.php` (new, 10 tests)
- `test_display_endpoint_returns_200_for_active_order`
- `test_display_endpoint_returns_correct_order_number`
- `test_display_endpoint_returns_non_null_numeric_totals` — Directly proves the column fix: asserts `tax`, `discount`, `tip` are not null and match the seeded values.
- `test_display_endpoint_includes_line_items`
- `test_display_endpoint_returns_404_for_unknown_order_number`
- `test_display_endpoint_hides_completed_orders`
- `test_display_endpoint_hides_cancelled_orders`
- `test_display_endpoint_hides_paid_orders`
- `test_display_endpoint_shows_pending_orders`
- `test_display_endpoint_shows_ready_orders`

---

## 7. Docs / QA Alignment Fixes

### Health endpoints

Confirmed three health routes exist and are correctly named:
- `GET /api/health` — public, minimal `{"status":"ok"}`
- `GET /api/system/health` — public alias, same handler
- `GET /api/admin/system/health` — protected, `auth:sanctum` + `permission:website.manage`

`docs/SECURITY_AUDIT_AND_IMPLEMENTATION_GUIDE.md` mentions `GET /api/health` and `GET /api/system/health` — both are present and correct. `HealthEndpointTest` tests all three. No changes needed.

### StaffAuthTest contract

The existing test sent `pin` + `device_identifier` without `username`, which was the old pre-refactor contract. Fixed to match the current `StaffAuthController::pinLogin` validation.

### Pre-existing failing tests (not caused by this task)

| Test | Root cause |
|---|---|
| `LoyaltyTest` (4 tests) | MySQL `GREATEST()` function not available in SQLite |
| `DeliveryOrderTest` (3 tests) | Validation mismatch on order creation payload |
| `PartialPaymentTest` (2 tests) | BML payment gateway returns 403 in test environment |
| `PublicApiSecurityTest` (1 test) | Route or fixture mismatch |
| `OrderContractTest` (5 tests) | Snapshot hardcodes `BG-20260315-*` date; now `BG-20260409-*` |

These were failing before this task. Not changed.

---

## 8. Remaining Risks

### `order_number` enumeration on `GET /api/display/{orderNumber}`

The endpoint is accessible without authentication, keyed by a sequential human-readable `order_number` (`BG-YYYYMMDD-XXXX`). An attacker can enumerate active orders by iterating the counter. Mitigations already in place: status filter (only `pending`, `open`, `preparing`, `ready`), throttle (`60/min`). **Recommendation for future:** Migrate the display lookup to `tracking_token` (already exists, random 32 chars), keeping a signed query-param or short-lived URL that the POS generates. Not changed in this patch set because it would require a coordinated frontend change on all POS display screens.

### `GREATEST()` in LoyaltyTest

`LoyaltyLedgerService` uses MySQL's `GREATEST()` in a raw DB update. This works in production but breaks the SQLite CI tests. Not in scope for this patch set.

### `OrderContractTest` date-sensitive snapshots

Snapshots contain hardcoded `order_number` values including the generation date. They will fail on any day other than when they were generated. Run `UPDATE_SNAPSHOTS=true php artisan test --testsuite=Contract` to regenerate. Not in scope.

---

## 9. Manual Verification Checklist

### After deploying to production

1. **CustomerDisplayController column fix**
   - On a POS device, ring up an order with tax and tip.
   - Open `GET /api/display/{order_number}` (or the display screen URL).
   - Confirm `tax`, `discount`, and `tip` fields are non-null and non-zero where applicable.

2. **Promotion authorization — staff without permission**
   - Log in to the admin dashboard as a staff-role user (not owner/manager).
   - Ensure `promotions.discounts` is NOT granted to that user.
   - Attempt to apply a promo code from the POS or admin panel.
   - Confirm `403` response.

3. **Promotion authorization — staff with permission**
   - Grant `promotions.discounts` to a staff user via `Settings → Roles & Permissions`.
   - Apply a promo code to an order.
   - Confirm discount is applied and totals recalculate correctly.

4. **Promotion remove — totals consistency**
   - Apply a promo to an order.
   - Remove the promo.
   - Confirm the order total matches the original pre-promo total.
   - Confirm `promo_discount_laar = 0` on the order record.

5. **Cash payment no longer crashes**
   - Create an order, add items, collect full cash payment.
   - Confirm the payment response is `200` with `order.status = paid`.
   - Confirm `ConsumePromoRedemptionsListener` fired (check `promotion_redemptions` table if a promo was applied).

6. **Delivery-web assets**
   - Navigate to `/driver/` in a browser.
   - Confirm the delivery driver app loads.
   - After the next release, run `./scripts/build-all.sh delivery` locally, commit `backend/public/driver/`, and push to confirm the new delivery build deploys via `git pull`.

7. **Staff login — username required**
   - On the admin login screen, attempt to log in with only a PIN (leave email blank).
   - Confirm the button is disabled or a validation error appears.
   - Log in with a valid email + PIN.
   - Confirm successful authentication.

8. **Health endpoints**
   - `GET /api/health` → `{"status":"ok"}` with no extra fields.
   - `GET /api/system/health` → same.
   - `GET /api/admin/system/health` without auth → `401`.
   - `GET /api/admin/system/health` with owner token → `200` with `{"status":...}`.

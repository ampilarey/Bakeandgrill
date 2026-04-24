<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Customer;
use App\Models\Device;
use App\Models\Item;
use App\Models\Order;
use App\Models\Permission;
use App\Models\Promotion;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PromotionTest extends TestCase
{
    use RefreshDatabase;

    private User $staff;

    private Device $device;

    private Item $item;

    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();

        $role = Role::create(['name' => 'Cashier', 'slug' => 'cashier', 'description' => '', 'is_active' => true]);
        $this->staff = User::create([
            'name' => 'Staff', 'email' => 'staff@test.com',
            'password' => Hash::make('password'), 'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'), 'is_active' => true,
        ]);
        $this->device = Device::create(['name' => 'POS', 'identifier' => 'T-001', 'type' => 'pos', 'is_active' => true]);
        $this->withHeader('X-Device-Identifier', $this->device->identifier);
        $category = Category::create(['name' => 'Food', 'slug' => 'food', 'is_active' => true]);
        $this->item = Item::create([
            'category_id' => $category->id, 'name' => 'Burger', 'base_price' => 25.00,
            'sku' => 'B001', 'barcode' => 'B001', 'is_active' => true, 'is_available' => true,
        ]);
        $this->customer = Customer::create([
            'name' => 'Test Customer', 'phone' => '+9607001234',
            'loyalty_points' => 0, 'tier' => 'bronze', 'is_active' => true,
        ]);

        // Ensure the test staff user has promotions.discounts so existing tests pass.
        // New auth-matrix tests test the no-permission case with a separate user.
        Permission::updateOrCreate(
            ['slug' => 'promotions.discounts'],
            ['name' => 'Apply Discounts', 'group' => 'Promotions'],
        );
        $this->staff->grantPermission('promotions.discounts');
    }

    private function createPromo(array $attrs = []): Promotion
    {
        return Promotion::create(array_merge([
            'name' => 'Test Promo',
            'code' => 'SAVE10',
            'type' => 'percentage',
            'discount_value' => 1000, // 10%
            'is_active' => true,
            'stackable' => false,
        ], $attrs));
    }

    private function createOrder(): Order
    {
        Sanctum::actingAs($this->staff, ['staff']);

        $response = $this->postJson('/api/orders', [
            'type' => 'takeaway',
            'device_identifier' => $this->device->identifier,
            'print' => false,
            'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
        ]);

        return Order::find($response->json('order.id'));
    }

    public function test_promo_code_is_normalized_to_uppercase(): void
    {
        $promo = Promotion::create([
            'name' => 'Test', 'code' => '  save20  ',
            'type' => 'fixed', 'discount_value' => 200, 'is_active' => true,
        ]);
        $this->assertEquals('SAVE20', $promo->fresh()->code);
    }

    public function test_validate_promo_returns_valid(): void
    {
        $this->createPromo();
        $order = $this->createOrder();

        $response = $this->postJson('/api/promotions/validate', [
            'code' => 'save10',
            'order_id' => $order->id,
        ]);

        $response->assertOk()
            ->assertJsonPath('valid', true);
    }

    public function test_validate_promo_case_insensitive(): void
    {
        $this->createPromo(['code' => 'SUMMER50']);

        $response = $this->postJson('/api/promotions/validate', ['code' => 'summer50']);
        $response->assertOk()->assertJsonPath('valid', true);
    }

    public function test_expired_promo_is_invalid(): void
    {
        $this->createPromo(['expires_at' => now()->subDay()]);

        $response = $this->postJson('/api/promotions/validate', ['code' => 'SAVE10']);
        $response->assertOk()->assertJsonPath('valid', false);
    }

    public function test_inactive_promo_is_invalid(): void
    {
        $this->createPromo(['is_active' => false]);

        $response = $this->postJson('/api/promotions/validate', ['code' => 'SAVE10']);
        $response->assertOk()->assertJsonPath('valid', false);
    }

    public function test_promo_not_applied_to_order_until_paid(): void
    {
        $promo = $this->createPromo();
        $order = $this->createOrder();

        Sanctum::actingAs($this->staff, ['staff']);

        $this->postJson("/api/orders/{$order->id}/apply-promo", ['code' => 'SAVE10'])
            ->assertOk();

        $this->assertEquals(0, $promo->fresh()->redemptions_count);
    }

    public function test_promo_redemption_count_increments_on_payment(): void
    {
        $promo = $this->createPromo();
        $order = $this->createOrder();

        Sanctum::actingAs($this->staff, ['staff']);
        $this->postJson("/api/orders/{$order->id}/apply-promo", ['code' => 'SAVE10'])
            ->assertOk();

        $freshOrder = $order->fresh();

        // Pay the order — use the post-discount total so the payment fully covers it.
        // Cast to float so SQLite string "22.50" isn't treated as 0 by JSON encoding.
        $payableAmount = max((float) $freshOrder->total, (float) $freshOrder->subtotal, 0.01);
        $payResponse = $this->postJson("/api/orders/{$order->id}/payments", [
            'payments' => [['method' => 'cash', 'amount' => $payableAmount]],
            'print_receipt' => false,
        ]);
        $payResponse->assertOk();

        // ConsumePromoRedemptionsListener runs synchronously on OrderPaid.
        $this->assertEquals(1, $promo->fresh()->redemptions_count);
    }

    public function test_max_uses_limit_enforced(): void
    {
        $promo = $this->createPromo(['max_uses' => 1]);

        // redemptions_count is not in $fillable; use DB directly to set it.
        \Illuminate\Support\Facades\DB::table('promotions')
            ->where('id', $promo->id)
            ->update(['redemptions_count' => 1]);

        $order = $this->createOrder();

        Sanctum::actingAs($this->staff, ['staff']);
        $response = $this->postJson("/api/orders/{$order->id}/apply-promo", ['code' => 'SAVE10']);

        $response->assertStatus(422);
    }

    // ─── Authorization matrix ────────────────────────────────────────────────

    public function test_staff_with_discounts_permission_can_apply_promo(): void
    {
        $this->createPromo();
        $order = $this->createOrder();

        // Grant promotions.discounts so staff can apply
        $this->staff->grantPermission('promotions.discounts');

        Sanctum::actingAs($this->staff, ['staff']);
        $this->postJson("/api/orders/{$order->id}/apply-promo", ['code' => 'SAVE10'])
            ->assertOk();
    }

    public function test_staff_without_discounts_permission_cannot_apply_promo(): void
    {
        $this->createPromo();
        $order = $this->createOrder();

        // Ensure the permission is explicitly revoked on this staff user
        $this->staff->revokePermission('promotions.discounts');

        Sanctum::actingAs($this->staff, ['staff']);
        $this->postJson("/api/orders/{$order->id}/apply-promo", ['code' => 'SAVE10'])
            ->assertStatus(403);
    }

    public function test_customer_can_apply_promo_to_own_order(): void
    {
        $this->createPromo();

        // Create an order owned by this customer
        $this->staff->grantPermission('promotions.discounts');
        Sanctum::actingAs($this->staff, ['staff']);
        $response = $this->postJson('/api/orders', [
            'type' => 'takeaway',
            'device_identifier' => $this->device->identifier,
            'customer_id' => $this->customer->id,
            'print' => false,
            'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
        ]);
        $order = Order::find($response->json('order.id'));

        Sanctum::actingAs($this->customer, ['customer']);
        $this->postJson("/api/orders/{$order->id}/apply-promo", ['code' => 'SAVE10'])
            ->assertOk();
    }

    public function test_customer_cannot_apply_promo_to_another_customers_order(): void
    {
        $this->createPromo();
        $order = $this->createOrder(); // not owned by $this->customer

        Sanctum::actingAs($this->customer, ['customer']);
        $this->postJson("/api/orders/{$order->id}/apply-promo", ['code' => 'SAVE10'])
            ->assertStatus(403);
    }

    public function test_unauthenticated_cannot_apply_promo(): void
    {
        // Create the order first (which sets Sanctum fake auth), then reset auth
        // so the actual promo call is made with no bearer token.
        $order = $this->createOrder();

        // Clear Sanctum's in-memory acting-as state so the next request is unauthenticated.
        $this->app['auth']->forgetGuards();

        $this->postJson("/api/orders/{$order->id}/apply-promo", ['code' => 'SAVE10'])
            ->assertStatus(401);
    }

    public function test_staff_without_permission_cannot_remove_promo(): void
    {
        $promo = $this->createPromo();
        $order = $this->createOrder();

        // Apply first with a staff user who has permission
        $this->staff->grantPermission('promotions.discounts');
        Sanctum::actingAs($this->staff, ['staff']);
        $this->postJson("/api/orders/{$order->id}/apply-promo", ['code' => 'SAVE10'])->assertOk();

        // Now create a staff user without the permission and try to remove
        $restrictedRole = Role::create(['name' => 'Basic', 'slug' => 'basic', 'description' => '', 'is_active' => true]);
        $restricted = User::create([
            'name' => 'Restricted', 'email' => 'restricted@test.com',
            'password' => Hash::make('password'), 'role_id' => $restrictedRole->id,
            'pin_hash' => Hash::make('5678'), 'is_active' => true,
        ]);
        $restricted->revokePermission('promotions.discounts');

        Sanctum::actingAs($restricted, ['staff']);
        $this->deleteJson("/api/orders/{$order->id}/promo/{$promo->id}")
            ->assertStatus(403);
    }

    public function test_remove_promo_on_terminal_order_is_rejected(): void
    {
        $promo = $this->createPromo();
        $order = $this->createOrder();

        Sanctum::actingAs($this->staff, ['staff']);
        $this->postJson("/api/orders/{$order->id}/apply-promo", ['code' => 'SAVE10'])->assertOk();

        // Force order into terminal state
        $order->update(['status' => 'paid']);

        // 422 = pre-check caught the terminal state (order is visibly paid before the lock).
        // 409 = order transitioned concurrently (only possible with truly concurrent requests).
        // Both are correct; the pre-check 422 is the expected path in unit tests.
        $response = $this->deleteJson("/api/orders/{$order->id}/promo/{$promo->id}");
        $this->assertContains($response->status(), [409, 422]);
    }

    public function test_apply_and_remove_promo_restores_original_totals(): void
    {
        $this->createPromo(['type' => 'fixed', 'discount_value' => 500]); // MVR 5 off

        $this->staff->grantPermission('promotions.discounts');
        Sanctum::actingAs($this->staff, ['staff']);
        $response = $this->postJson('/api/orders', [
            'type' => 'takeaway',
            'device_identifier' => $this->device->identifier,
            'print' => false,
            'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
        ]);
        $order = Order::find($response->json('order.id'));
        $originalTotal = (float) $order->total;

        // Apply promo — total should decrease
        $this->postJson("/api/orders/{$order->id}/apply-promo", ['code' => 'SAVE10'])->assertOk();
        $afterApply = (float) $order->fresh()->total;
        $this->assertLessThan($originalTotal, $afterApply, 'Total should decrease after promo applied');

        // Remove promo — total should restore
        $promo = Promotion::first();
        $this->deleteJson("/api/orders/{$order->id}/promo/{$promo->id}")->assertOk();
        $afterRemove = (float) $order->fresh()->total;
        $this->assertEqualsWithDelta($originalTotal, $afterRemove, 0.01, 'Total should restore after promo removed');

        // Promo discount field should be zeroed out
        $this->assertEquals(0, (int) $order->fresh()->promo_discount_laar);
    }
}

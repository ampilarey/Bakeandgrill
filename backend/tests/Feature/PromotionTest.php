<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Customer;
use App\Models\Device;
use App\Models\Item;
use App\Models\Order;
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
        $category = Category::create(['name' => 'Food', 'slug' => 'food', 'is_active' => true]);
        $this->item = Item::create([
            'category_id' => $category->id, 'name' => 'Burger', 'base_price' => 25.00,
            'sku' => 'B001', 'barcode' => 'B001', 'is_active' => true, 'is_available' => true,
        ]);
        $this->customer = Customer::create([
            'name' => 'Test Customer', 'phone' => '+9607001234',
            'loyalty_points' => 0, 'tier' => 'bronze', 'is_active' => true,
        ]);
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
        $this->postJson("/api/orders/{$order->id}/apply-promo", ['code' => 'SAVE10']);

        // Pay the order
        $this->postJson("/api/orders/{$order->id}/payments", [
            'payments' => [['method' => 'cash', 'amount' => $order->fresh()->total]],
            'print_receipt' => false,
        ]);

        // Queue is sync in tests, so listener runs immediately
        $this->assertEquals(1, $promo->fresh()->redemptions_count);
    }

    public function test_max_uses_limit_enforced(): void
    {
        $promo = $this->createPromo(['max_uses' => 1]);

        // Manually set redemption count to 1 (already at limit)
        $promo->update(['redemptions_count' => 1]);

        $order = $this->createOrder();

        Sanctum::actingAs($this->staff, ['staff']);
        $response = $this->postJson("/api/orders/{$order->id}/apply-promo", ['code' => 'SAVE10']);

        $response->assertStatus(422);
    }
}

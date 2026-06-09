<?php

declare(strict_types=1);

namespace Tests\Feature\Auth;

use App\Models\Category;
use App\Models\Customer;
use App\Models\Item;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Customer Sanctum tokens must not reach staff/POS/KDS/admin routes.
 */
class CustomerTokenStaffRoutesTest extends TestCase
{
    use RefreshDatabase;

    private Customer $customer;

    private string $customerToken;

    protected function setUp(): void
    {
        parent::setUp();

        $this->customer = Customer::create([
            'phone' => '+9607002001',
            'name' => 'Route Guard Customer',
            'loyalty_points' => 0,
            'tier' => 'bronze',
        ]);

        $this->customerToken = $this->customer
            ->createToken('customer-guard', ['customer'])
            ->plainTextToken;

        $category = Category::create(['name' => 'Guard Food', 'slug' => 'guard-food', 'is_active' => true]);
        Item::create([
            'category_id' => $category->id,
            'name' => 'Guard Item',
            'sku' => 'GRD-001',
            'base_price' => 10.00,
            'is_active' => true,
            'is_available' => true,
        ]);
    }

    /** @return array<string, string> */
    private function customerHeader(): array
    {
        return ['Authorization' => "Bearer {$this->customerToken}"];
    }

    #[Test]
    public function customer_token_is_rejected_on_staff_me(): void
    {
        $this->getJson('/api/auth/me', $this->customerHeader())->assertForbidden();
    }

    #[Test]
    public function customer_token_is_rejected_on_pos_bootstrap(): void
    {
        $this->getJson('/api/pos/bootstrap', $this->customerHeader())->assertForbidden();
    }

    #[Test]
    public function customer_token_is_rejected_on_pos_menu(): void
    {
        $this->getJson('/api/pos/menu', $this->customerHeader())->assertForbidden();
    }

    #[Test]
    public function customer_token_is_rejected_on_pos_offline_sync(): void
    {
        $this->postJson('/api/pos/offline-sync', ['orders' => []], $this->customerHeader())
            ->assertForbidden();
    }

    #[Test]
    public function customer_token_is_rejected_on_kds_orders_list(): void
    {
        $this->getJson('/api/kds/orders', $this->customerHeader())->assertForbidden();
    }

    #[Test]
    public function customer_token_is_rejected_on_post_orders(): void
    {
        $this->postJson('/api/orders', [
            'type' => 'takeaway',
            'items' => [['item_id' => 1, 'quantity' => 1]],
        ], $this->customerHeader())->assertForbidden();
    }

    #[Test]
    public function customer_token_is_rejected_on_admin_gift_cards(): void
    {
        $this->getJson('/api/admin/gift-cards', $this->customerHeader())->assertForbidden();
        $this->postJson('/api/admin/gift-cards', ['amount' => 50], $this->customerHeader())
            ->assertForbidden();
    }

    #[Test]
    public function customer_token_is_rejected_on_shifts_current(): void
    {
        $this->getJson('/api/shifts/current', $this->customerHeader())->assertForbidden();
    }

    #[Test]
    public function customer_token_is_rejected_on_invoices_list(): void
    {
        $this->getJson('/api/invoices', $this->customerHeader())->assertForbidden();
    }

    #[Test]
    public function customer_token_is_rejected_on_sales_summary_report(): void
    {
        $this->getJson('/api/reports/sales-summary', $this->customerHeader())->assertForbidden();
    }

    #[Test]
    public function customer_token_is_rejected_on_admin_customers(): void
    {
        $this->getJson('/api/admin/customers', $this->customerHeader())->assertForbidden();
    }

    #[Test]
    public function customer_token_is_rejected_on_refunds_list(): void
    {
        $this->getJson('/api/refunds', $this->customerHeader())->assertForbidden();
    }

    #[Test]
    public function customer_token_is_rejected_on_pos_gift_card_apply(): void
    {
        $this->postJson('/api/pos/orders/1/gift-card', ['code' => 'TEST-CODE'], $this->customerHeader())
            ->assertForbidden();
    }

    #[Test]
    public function customer_token_is_rejected_on_admin_reservations(): void
    {
        $this->getJson('/api/admin/reservations', $this->customerHeader())->assertForbidden();
    }

    #[Test]
    public function disabled_staff_token_is_rejected_on_auth_me(): void
    {
        $role = Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'is_active' => true]);
        $user = User::create([
            'name' => 'Disabled Staff',
            'email' => 'disabled-staff@test.local',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => false,
        ]);

        $token = $user->createToken('disabled', ['staff'])->plainTextToken;

        $this->getJson('/api/auth/me', ['Authorization' => "Bearer {$token}"])
            ->assertForbidden();
    }
}

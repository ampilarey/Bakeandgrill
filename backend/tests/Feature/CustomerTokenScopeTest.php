<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Customer;
use App\Models\Item;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Tests for the EnsureCustomerToken middleware (PR 2 — Auth hardening).
 *
 * Verifies that token-ability segregation is correctly enforced:
 *   - Customer tokens (ability='customer') can only reach customer routes.
 *   - Staff tokens (ability='staff') are blocked from customer routes.
 *   - Customer tokens are blocked from staff/admin routes.
 *   - Unauthenticated requests are rejected with 401.
 *
 * Routes tested:
 *   GET  /api/customer/me
 *   GET  /api/customer/orders
 *   GET  /api/customer/orders/{id}
 *   PATCH /api/customer/profile
 *   GET  /api/customer/favorites
 *   GET  /api/customer/pre-orders
 *   GET  /api/customer/reviews
 *   GET  /api/customer/referral-code
 */
class CustomerTokenScopeTest extends TestCase
{
    use RefreshDatabase;

    private Customer $customer;
    private string   $customerToken;
    private User     $staff;
    private string   $staffToken;

    protected function setUp(): void
    {
        parent::setUp();

        // ── Customer ──────────────────────────────────────────────────────────
        $this->customer = Customer::create([
            'phone'          => '+9607001001',
            'name'           => 'Test Customer',
            'loyalty_points' => 0,
            'tier'           => 'bronze',
        ]);

        $this->customerToken = $this->customer
            ->createToken('customer-test', ['customer'])
            ->plainTextToken;

        // ── Staff ─────────────────────────────────────────────────────────────
        $role = Role::create([
            'name'      => 'Cashier',
            'slug'      => 'cashier',
            'is_active' => true,
        ]);

        $this->staff = User::create([
            'name'      => 'Test Cashier',
            'email'     => 'cashier@test.local',
            'password'  => Hash::make('password'),
            'role_id'   => $role->id,
            'pin_hash'  => Hash::make('9999'),
            'is_active' => true,
        ]);

        $this->staffToken = $this->staff
            ->createToken('staff-test', ['staff'])
            ->plainTextToken;

        // ── Seed minimal menu data ────────────────────────────────────────────
        $category = Category::create(['name' => 'Mains', 'slug' => 'mains', 'is_active' => true]);
        Item::create([
            'category_id'  => $category->id,
            'name'         => 'Test Item',
            'sku'          => 'TST-001',
            'base_price'   => 25.00,
            'is_active'    => true,
            'is_available' => true,
        ]);
    }

    // =========================================================================
    // A. Unauthenticated → 401
    // =========================================================================

    /** @test */
    public function unauthenticated_request_is_rejected_on_customer_me(): void
    {
        $this->getJson('/api/customer/me')->assertStatus(401);
    }

    /** @test */
    public function unauthenticated_request_is_rejected_on_customer_orders(): void
    {
        $this->getJson('/api/customer/orders')->assertStatus(401);
    }

    /** @test */
    public function unauthenticated_request_is_rejected_on_customer_favorites(): void
    {
        $this->getJson('/api/customer/favorites')->assertStatus(401);
    }

    /** @test */
    public function unauthenticated_request_is_rejected_on_customer_pre_orders(): void
    {
        $this->getJson('/api/customer/pre-orders')->assertStatus(401);
    }

    /** @test */
    public function unauthenticated_request_is_rejected_on_customer_reviews(): void
    {
        $this->getJson('/api/customer/reviews')->assertStatus(401);
    }

    // =========================================================================
    // B. Staff token → 403 on all customer routes
    // =========================================================================

    private function staffHeader(): array
    {
        return ['Authorization' => "Bearer {$this->staffToken}"];
    }

    /** @test */
    public function staff_token_is_rejected_on_customer_me(): void
    {
        $this->getJson('/api/customer/me', $this->staffHeader())->assertStatus(403);
    }

    /** @test */
    public function staff_token_is_rejected_on_customer_orders_list(): void
    {
        $this->getJson('/api/customer/orders', $this->staffHeader())->assertStatus(403);
    }

    /** @test */
    public function staff_token_is_rejected_on_customer_order_detail(): void
    {
        $this->getJson('/api/customer/orders/1', $this->staffHeader())->assertStatus(403);
    }

    /** @test */
    public function staff_token_is_rejected_on_customer_profile_update(): void
    {
        $this->patchJson('/api/customer/profile', ['name' => 'Hacker'], $this->staffHeader())
            ->assertStatus(403);
    }

    /** @test */
    public function staff_token_is_rejected_on_customer_favorites(): void
    {
        $this->getJson('/api/customer/favorites', $this->staffHeader())->assertStatus(403);
    }

    /** @test */
    public function staff_token_is_rejected_on_customer_pre_orders(): void
    {
        $this->getJson('/api/customer/pre-orders', $this->staffHeader())->assertStatus(403);
    }

    /** @test */
    public function staff_token_is_rejected_on_customer_reviews(): void
    {
        $this->getJson('/api/customer/reviews', $this->staffHeader())->assertStatus(403);
    }

    /** @test */
    public function staff_token_is_rejected_on_customer_referral_code(): void
    {
        $this->getJson('/api/customer/referral-code', $this->staffHeader())->assertStatus(403);
    }

    // =========================================================================
    // C. Customer token → 403 on staff / admin routes
    // =========================================================================

    private function customerHeader(): array
    {
        return ['Authorization' => "Bearer {$this->customerToken}"];
    }

    /** @test */
    public function customer_token_is_rejected_on_staff_inventory_route(): void
    {
        // InventoryController::index requires tokenCan('staff')
        $this->getJson('/api/inventory', $this->customerHeader())->assertStatus(403);
    }

    /** @test */
    public function customer_token_is_rejected_on_admin_reports(): void
    {
        // Admin analytics — protected by role:manager,admin,owner
        $this->getJson('/api/admin/analytics/profitability', $this->customerHeader())
            ->assertStatus(403);
    }

    /** @test */
    public function customer_token_is_rejected_on_staff_orders_list(): void
    {
        // OrderController::index requires tokenCan('staff')
        $this->getJson('/api/orders', $this->customerHeader())->assertStatus(403);
    }

    // =========================================================================
    // D. Valid customer token → passes EnsureCustomerToken
    // =========================================================================

    /** @test */
    public function customer_token_reaches_customer_me(): void
    {
        $this->getJson('/api/customer/me', $this->customerHeader())
            ->assertStatus(200)
            ->assertJsonPath('customer.phone', $this->customer->phone);
    }

    /** @test */
    public function customer_token_reaches_customer_orders_list(): void
    {
        // Returns paginated empty list — 200 is the important assertion
        $this->getJson('/api/customer/orders', $this->customerHeader())
            ->assertStatus(200);
    }

    /** @test */
    public function customer_token_reaches_customer_favorites(): void
    {
        $this->getJson('/api/customer/favorites', $this->customerHeader())
            ->assertStatus(200)
            ->assertJsonStructure(['favorites']);
    }

    /** @test */
    public function customer_token_reaches_customer_pre_orders(): void
    {
        $this->getJson('/api/customer/pre-orders', $this->customerHeader())
            ->assertStatus(200)
            ->assertJsonStructure(['data']);
    }

    /** @test */
    public function customer_token_reaches_customer_reviews(): void
    {
        $this->getJson('/api/customer/reviews', $this->customerHeader())
            ->assertStatus(200)
            ->assertJsonStructure(['reviews']);
    }

    /** @test */
    public function customer_can_update_own_profile(): void
    {
        $this->patchJson('/api/customer/profile', ['name' => 'Updated Name'], $this->customerHeader())
            ->assertStatus(200)
            ->assertJsonPath('message', 'Profile updated successfully');

        $this->assertEquals('Updated Name', $this->customer->fresh()->name);
    }

    // =========================================================================
    // E. Token ability edge cases
    // =========================================================================

    /** @test */
    public function token_with_no_abilities_is_rejected_on_customer_routes(): void
    {
        // A token created with no explicit abilities defaults to ['*'] in older
        // Sanctum versions. EnsureCustomerToken must reject it because the
        // authenticated model is a User (staff), not a Customer.
        $noAbilityToken = $this->staff
            ->createToken('no-ability')
            ->plainTextToken;

        $this->getJson('/api/customer/me', ['Authorization' => "Bearer {$noAbilityToken}"])
            ->assertStatus(403);
    }

    /** @test */
    public function customer_token_with_wrong_ability_is_rejected(): void
    {
        // Simulate a hypothetically issued 'staff'-scoped token on a Customer model.
        // This should be rejected by the tokenCan('customer') check.
        $wrongToken = $this->customer
            ->createToken('wrong-ability', ['staff'])
            ->plainTextToken;

        $this->getJson('/api/customer/me', ['Authorization' => "Bearer {$wrongToken}"])
            ->assertStatus(403);
    }
}

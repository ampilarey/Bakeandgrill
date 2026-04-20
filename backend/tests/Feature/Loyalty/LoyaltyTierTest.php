<?php

declare(strict_types=1);

namespace Tests\Feature\Loyalty;

use App\Domains\Loyalty\Services\LoyaltyLedgerService;
use App\Domains\Orders\DTOs\OrderPaidData;
use App\Domains\Orders\Events\OrderPaid;
use App\Models\LoyaltyAccount;
use App\Models\LoyaltyLedger;
use App\Models\Order;
use App\Models\OrderItem;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Loyalty point & tier lifecycle tests.
 *
 * Covers:
 *  - /loyalty/me returns account for authenticated customer
 *  - earnPointsForOrder credits points to account
 *  - admin can adjust (credit & debit) points
 *  - admin adjustment cannot drive balance negative
 *  - IDOR: customer cannot see another customer's ledger
 *  - hold and release preserve available points correctly
 *  - idempotent earn: OrderPaid fired twice does not double-credit
 */
class LoyaltyTierTest extends TestCase
{
    use RefreshDatabase;

    private array $adminHeaders;

    protected function setUp(): void
    {
        parent::setUp();
        $this->adminHeaders = $this->staffHeaders($this->makeOwner());
    }

    // ── /loyalty/me ───────────────────────────────────────────────────────────

    public function test_loyalty_me_returns_account_for_customer(): void
    {
        $customer = $this->makeCustomer();
        Sanctum::actingAs($customer, ['customer']);

        $response = $this->getJson('/api/loyalty/me')->assertStatus(200);

        $response->assertJsonStructure([
            'account' => ['points_balance', 'points_held', 'available_points', 'lifetime_points', 'tier'],
        ]);
    }

    public function test_loyalty_me_requires_customer_token(): void
    {
        // Staff token should not be able to see loyalty/me
        $staff = $this->makeOwner();
        Sanctum::actingAs($staff, ['staff']);
        $this->getJson('/api/loyalty/me')->assertStatus(403);
    }

    public function test_loyalty_me_requires_auth(): void
    {
        $this->getJson('/api/loyalty/me')->assertStatus(401);
    }

    // ── Earn points on order ──────────────────────────────────────────────────

    public function test_earn_points_credits_account_after_order_paid(): void
    {
        $customer = $this->makeCustomer();
        $order    = Order::factory()->paid()->forCustomer($customer)->create([
            'total' => 100.00,
            'total_laar' => 10000,
        ]);

        $service = app(LoyaltyLedgerService::class);
        $service->earnPointsForOrder($customer, $order->fresh());

        $account = LoyaltyAccount::where('customer_id', $customer->id)->first();
        $this->assertNotNull($account);
        $this->assertGreaterThan(0, $account->points_balance);
        $this->assertGreaterThan(0, $account->lifetime_points);
    }

    public function test_earn_is_idempotent_on_duplicate_order_paid_event(): void
    {
        $customer = $this->makeCustomer();
        $order    = Order::factory()->paid()->forCustomer($customer)->create([
            'total'      => 50.00,
            'total_laar' => 5000,
        ]);

        $service = app(LoyaltyLedgerService::class);
        $service->earnPointsForOrder($customer, $order->fresh());
        $service->earnPointsForOrder($customer, $order->fresh()); // duplicate

        $account = LoyaltyAccount::where('customer_id', $customer->id)->first();

        // Only one earn ledger entry should exist for this order
        $earnCount = LoyaltyLedger::where('customer_id', $customer->id)
            ->where('type', 'earn')
            ->where('order_id', $order->id)
            ->count();

        $this->assertSame(1, $earnCount, 'Duplicate earn call must not create extra ledger entry');
    }

    // ── Admin adjust ──────────────────────────────────────────────────────────

    public function test_admin_can_credit_points_to_customer(): void
    {
        $customer = $this->makeCustomer();

        $this->postJson("/api/admin/loyalty/accounts/{$customer->id}/adjust", [
            'delta'  => 100,
            'reason' => 'Goodwill credit',
        ], $this->adminHeaders)->assertStatus(200);

        $account = LoyaltyAccount::where('customer_id', $customer->id)->first();
        $this->assertSame(100, (int) $account->points_balance);
    }

    public function test_admin_can_debit_points_from_customer(): void
    {
        $customer = $this->makeCustomer();

        // First credit
        $this->postJson("/api/admin/loyalty/accounts/{$customer->id}/adjust", [
            'delta'  => 200,
            'reason' => 'Initial credit',
        ], $this->adminHeaders)->assertStatus(200);

        // Then debit
        $this->postJson("/api/admin/loyalty/accounts/{$customer->id}/adjust", [
            'delta'  => -50,
            'reason' => 'Correction debit',
        ], $this->adminHeaders)->assertStatus(200);

        $account = LoyaltyAccount::where('customer_id', $customer->id)->first();
        $this->assertSame(150, (int) $account->points_balance);
    }

    public function test_admin_debit_cannot_drive_balance_below_zero(): void
    {
        $customer = $this->makeCustomer();

        // Start at 50 points
        $this->postJson("/api/admin/loyalty/accounts/{$customer->id}/adjust", [
            'delta'  => 50,
            'reason' => 'Initial',
        ], $this->adminHeaders)->assertStatus(200);

        // Debit 200 — balance should floor at 0, not go negative
        $this->postJson("/api/admin/loyalty/accounts/{$customer->id}/adjust", [
            'delta'  => -200,
            'reason' => 'Over-debit test',
        ], $this->adminHeaders)->assertStatus(200);

        $account = LoyaltyAccount::where('customer_id', $customer->id)->first();
        $this->assertGreaterThanOrEqual(0, (int) $account->points_balance);
    }

    public function test_admin_adjust_requires_non_zero_delta(): void
    {
        $customer = $this->makeCustomer();

        $this->postJson("/api/admin/loyalty/accounts/{$customer->id}/adjust", [
            'delta'  => 0,
            'reason' => 'Nothing',
        ], $this->adminHeaders)->assertStatus(422);
    }

    public function test_admin_adjust_creates_ledger_entry(): void
    {
        $customer = $this->makeCustomer();

        $this->postJson("/api/admin/loyalty/accounts/{$customer->id}/adjust", [
            'delta'  => 75,
            'reason' => 'Test ledger',
        ], $this->adminHeaders)->assertStatus(200);

        $this->assertDatabaseHas('loyalty_ledger', [
            'customer_id' => $customer->id,
            'type'        => 'admin_credit',
            'points'      => 75,
        ]);
    }

    // ── Hold and release ──────────────────────────────────────────────────────

    public function test_hold_reduces_available_points(): void
    {
        $customer = $this->makeCustomer();
        $order    = Order::factory()->pending()->forCustomer($customer)->create();

        // Give them 200 points via admin (minimum hold is 100)
        $this->postJson("/api/admin/loyalty/accounts/{$customer->id}/adjust", [
            'delta'  => 200,
            'reason' => 'Setup',
        ], $this->adminHeaders);

        Sanctum::actingAs($customer, ['customer']);

        $this->postJson('/api/loyalty/hold', [
            'points'   => 100,
            'order_id' => $order->id,
        ])->assertSuccessful();

        $account = LoyaltyAccount::where('customer_id', $customer->id)->first();
        $this->assertSame(100, (int) $account->points_held);
        $this->assertSame(100, (int) $account->availablePoints());
    }

    public function test_hold_release_restores_available_points(): void
    {
        $customer = $this->makeCustomer();
        $order    = Order::factory()->pending()->forCustomer($customer)->create();

        $this->postJson("/api/admin/loyalty/accounts/{$customer->id}/adjust", [
            'delta'  => 200,
            'reason' => 'Setup',
        ], $this->adminHeaders);

        Sanctum::actingAs($customer, ['customer']);

        $this->postJson('/api/loyalty/hold', [
            'points'   => 100,
            'order_id' => $order->id,
        ])->assertSuccessful();

        // Release hold
        $this->deleteJson("/api/loyalty/hold/{$order->id}")
            ->assertSuccessful();

        $account = LoyaltyAccount::where('customer_id', $customer->id)->first()->fresh();
        $this->assertSame(0, (int) $account->points_held);
    }

    // ── IDOR guard ────────────────────────────────────────────────────────────

    public function test_customer_cannot_see_another_customers_ledger(): void
    {
        $customerA = $this->makeCustomer(['phone' => '+9607900001']);
        $customerB = $this->makeCustomer(['phone' => '+9607900002']);

        // Customer B tries to access admin-only ledger endpoint — must be forbidden
        Sanctum::actingAs($customerB, ['customer']);

        $response = $this->getJson("/api/admin/loyalty/accounts/{$customerA->id}/ledger");

        $this->assertContains($response->status(), [401, 403]);
    }

    public function test_admin_can_list_loyalty_accounts(): void
    {
        $this->makeCustomer();

        $this->getJson('/api/admin/loyalty/accounts', $this->adminHeaders)
            ->assertStatus(200);
    }
}

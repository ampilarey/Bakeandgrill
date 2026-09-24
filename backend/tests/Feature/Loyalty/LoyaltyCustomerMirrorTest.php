<?php

declare(strict_types=1);

namespace Tests\Feature\Loyalty;

use App\Domains\Loyalty\Services\LoyaltyLedgerService;
use App\Models\Customer;
use App\Models\LoyaltyAccount;
use App\Models\LoyaltyLedger;
use App\Models\LoyaltyTier;
use App\Models\Order;
use App\Models\SiteSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\RateLimiter;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Audit fixes, 2026-09-24: the customer row's copy of points and tier
 * follows the loyalty account; the nightly reconciliation compares
 * numbers, not a number to a string; a reset code asked for through the
 * general OTP endpoint spends the reset budget.
 */
class LoyaltyCustomerMirrorTest extends TestCase
{
    use RefreshDatabase;

    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();
        $this->customer = Customer::create([
            'name' => 'Mirror', 'phone' => '+9607999777', 'loyalty_points' => 0, 'tier' => 'bronze', 'is_active' => true,
        ]);
    }

    private function order(float $total, string $number): Order
    {
        return Order::create([
            'order_number' => $number, 'type' => 'takeaway', 'status' => 'pending',
            'subtotal' => $total, 'tax_amount' => 0, 'discount_amount' => 0, 'total' => $total,
            'customer_id' => $this->customer->id,
        ]);
    }

    public function test_earning_redeeming_and_admin_adjustments_all_reach_the_customer_row(): void
    {
        $service = app(LoyaltyLedgerService::class);

        $service->earnPointsForOrder($this->customer, $this->order(300, 'BG-M-1'));
        $this->assertSame(300, $this->customer->fresh()->loyalty_points, 'earn is mirrored');

        $service->createOrRefreshHold($this->customer, $order = $this->order(100, 'BG-M-2'), 100);
        $service->consumeHold(\App\Models\LoyaltyHold::firstOrFail());
        $this->assertSame(200, $this->customer->fresh()->loyalty_points, 'redeem is mirrored');

        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $this->postJson("/api/admin/loyalty/accounts/{$this->customer->id}/adjust", ['delta' => 50, 'reason' => 'goodwill'])->assertOk();
        $this->assertSame(250, $this->customer->fresh()->loyalty_points, 'admin credit is mirrored');
        unset($order);
    }

    public function test_the_tier_is_mirrored_and_the_admin_customer_list_shows_the_real_numbers(): void
    {
        SiteSetting::set('loyalty_tiers_enabled', '1');
        SiteSetting::bust();
        app(\App\Services\LoyaltySettingsService::class)->bustCache();
        LoyaltyTier::query()->delete();
        LoyaltyTier::create(['name' => 'Bronze', 'slug' => 'bronze', 'min_lifetime_points' => 0, 'earn_multiplier' => 1, 'sort_order' => 0]);
        LoyaltyTier::create(['name' => 'Silver', 'slug' => 'silver', 'min_lifetime_points' => 200, 'earn_multiplier' => 1, 'sort_order' => 1]);

        app(LoyaltyLedgerService::class)->earnPointsForOrder($this->customer, $this->order(250, 'BG-M-3'));

        $fresh = $this->customer->fresh();
        $this->assertSame('silver', $fresh->tier);
        $this->assertSame(250, $fresh->loyalty_points);

        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $res = $this->getJson("/api/admin/customers/{$this->customer->id}")->assertOk();
        $this->assertSame(250, $res->json('customer.loyalty_points'));
        $this->assertSame('silver', $res->json('customer.tier'));
    }

    public function test_the_backfill_migration_copies_existing_balances(): void
    {
        LoyaltyAccount::withoutEvents(fn () => LoyaltyAccount::create([
            'customer_id' => $this->customer->id, 'points_balance' => 420, 'points_held' => 0, 'lifetime_points' => 900, 'tier' => 'gold',
        ]));
        $this->assertSame(0, $this->customer->fresh()->loyalty_points, 'nothing mirrored yet');

        (require database_path('migrations/2026_09_25_100000_backfill_customer_loyalty_mirror.php'))->up();

        $fresh = $this->customer->fresh();
        $this->assertSame(420, $fresh->loyalty_points);
        $this->assertSame('gold', $fresh->tier);
    }

    public function test_reconciliation_reports_only_real_drift(): void
    {
        app(LoyaltyLedgerService::class)->earnPointsForOrder($this->customer, $this->order(120, 'BG-M-4'));
        $this->artisan('app:reconcile-loyalty-balances')->expectsOutputToContain('All loyalty balances are correct.')->assertSuccessful();

        LoyaltyAccount::where('customer_id', $this->customer->id)->update(['points_balance' => 999]);
        $this->artisan('app:reconcile-loyalty-balances --dry-run')->expectsOutputToContain('1 mismatches found')->assertSuccessful();
        $this->artisan('app:reconcile-loyalty-balances')->expectsOutputToContain('Fixed 1 balance mismatches.')->assertSuccessful();
        $this->assertSame(120, LoyaltyAccount::where('customer_id', $this->customer->id)->value('points_balance'));
        $this->assertSame(120, $this->customer->fresh()->loyalty_points, 'the fix is mirrored too');
        $this->assertSame(1, LoyaltyLedger::count());
    }

    public function test_a_reset_code_through_the_general_otp_endpoint_spends_the_reset_budget(): void
    {
        RateLimiter::clear('otp-request:reset:+9607999777');
        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/auth/customer/otp/request', ['phone' => '+9607999777', 'purpose' => 'reset_password'])->assertOk();
        }
        $this->postJson('/api/auth/customer/otp/request', ['phone' => '+9607999777', 'purpose' => 'reset_password'])->assertStatus(422);
        $this->postJson('/api/auth/customer/forgot-password', ['phone' => '+9607999777'])->assertStatus(422);

        // The login budget is untouched by reset requests.
        $this->postJson('/api/auth/customer/otp/request', ['phone' => '+9607999777'])->assertOk();
    }
}

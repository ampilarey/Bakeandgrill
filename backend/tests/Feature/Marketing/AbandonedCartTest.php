<?php

declare(strict_types=1);

namespace Tests\Feature\Marketing;

use App\Models\AbandonedCart;
use App\Models\SiteSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AbandonedCartTest extends TestCase
{
    use RefreshDatabase;

    public function test_customer_can_snapshot_cart(): void
    {
        $customer = $this->makeCustomer(['sms_opt_out' => false]);
        Sanctum::actingAs($customer, ['customer']);

        $response = $this->postJson('/api/customer/cart/snapshot', [
            'items' => [
                ['id' => 1, 'name' => 'Chicken Wrap', 'quantity' => 2, 'price' => 85.00],
            ],
            'subtotal_laar' => 17000,
        ])->assertOk();

        $response->assertJsonStructure(['cart_token', 'snapshot_at']);

        $this->assertDatabaseHas('abandoned_carts', [
            'customer_id' => $customer->id,
            'subtotal_laar' => 17000,
        ]);
    }

    public function test_abandoned_cart_reminder_sends_once(): void
    {
        SiteSetting::set('marketing_abandoned_cart_enabled', '1');
        SiteSetting::set('marketing_abandoned_cart_delay_minutes', '30');
        SiteSetting::bust();

        $customer = $this->makeCustomer(['sms_opt_out' => false]);

        AbandonedCart::create([
            'customer_id' => $customer->id,
            'cart_token' => (string) \Illuminate\Support\Str::uuid(),
            'items_json' => [['id' => 1, 'name' => 'Tea', 'quantity' => 1]],
            'subtotal_laar' => 1500,
            'snapshot_at' => now()->subMinutes(45),
        ]);

        $this->artisan('marketing:send-abandoned-cart-reminders')
            ->assertSuccessful();

        $cart = AbandonedCart::where('customer_id', $customer->id)->first();
        $this->assertNotNull($cart?->reminded_at);

        $this->assertDatabaseHas('sms_logs', [
            'customer_id' => $customer->id,
            'type' => 'promotion',
            'reference_type' => 'abandoned_cart',
        ]);

        $before = \App\Models\SmsLog::count();
        $this->artisan('marketing:send-abandoned-cart-reminders')
            ->assertSuccessful();
        $this->assertSame($before, \App\Models\SmsLog::count());
    }

    public function test_prune_command_deletes_stale_snapshots(): void
    {
        SiteSetting::set('marketing_abandoned_cart_ttl_days', '7');
        SiteSetting::bust();

        $customer = $this->makeCustomer();
        AbandonedCart::create([
            'customer_id' => $customer->id,
            'cart_token' => (string) \Illuminate\Support\Str::uuid(),
            'items_json' => [],
            'subtotal_laar' => 0,
            'snapshot_at' => now()->subDays(10),
        ]);

        $this->artisan('marketing:prune-abandoned-carts')
            ->assertSuccessful();

        $this->assertDatabaseMissing('abandoned_carts', [
            'customer_id' => $customer->id,
        ]);
    }

    public function test_loyalty_me_includes_tier_progress_when_tiers_enabled(): void
    {
        SiteSetting::set('loyalty_tiers_enabled', '1');
        SiteSetting::bust();

        $customer = $this->makeCustomer();
        \App\Models\LoyaltyAccount::create([
            'customer_id' => $customer->id,
            'points_balance' => 500,
            'points_held' => 0,
            'lifetime_points' => 900,
            'tier' => 'bronze',
        ]);

        Sanctum::actingAs($customer, ['customer']);

        $this->getJson('/api/loyalty/me')
            ->assertOk()
            ->assertJsonPath('tier_progress.current_tier', 'bronze')
            ->assertJsonPath('tier_progress.next_tier', 'silver')
            ->assertJsonPath('tier_progress.points_to_next', 100);
    }
}

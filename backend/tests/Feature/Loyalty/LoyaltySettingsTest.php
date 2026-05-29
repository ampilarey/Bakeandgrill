<?php

declare(strict_types=1);

namespace Tests\Feature\Loyalty;

use App\Models\LoyaltyTier;
use App\Models\SiteSetting;
use App\Services\LoyaltySettingsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LoyaltySettingsTest extends TestCase
{
    use RefreshDatabase;

    private array $adminHeaders;

    protected function setUp(): void
    {
        parent::setUp();
        $this->adminHeaders = $this->staffHeaders($this->makeOwner());
    }

    public function test_admin_can_fetch_loyalty_settings_and_tiers(): void
    {
        $response = $this->getJson('/api/admin/loyalty/settings', $this->adminHeaders)
            ->assertOk();

        $response->assertJsonStructure([
            'settings' => [
                'enabled',
                'earn_rate_per_mvr',
                'redeem_rate_points_per_mvr',
                'min_redeem_points',
                'max_redeem_points',
                'max_redeem_percent',
                'hold_ttl_minutes',
                'tiers_enabled',
                'points_expiry_days',
                'earn_on_delivery_fee',
                'program_starts_at',
                'program_ends_at',
                'customer_message',
            ],
            'tiers',
        ]);

        $this->assertGreaterThanOrEqual(1, count($response->json('tiers')));
    }

    public function test_admin_can_update_loyalty_settings(): void
    {
        $this->putJson('/api/admin/loyalty/settings', [
            'earn_rate_per_mvr' => 2,
            'redeem_rate_points_per_mvr' => 80,
            'min_redeem_points' => 50,
            'max_redeem_percent' => 40,
            'points_expiry_days' => 365,
            'customer_message' => 'Earn double points this month!',
        ], $this->adminHeaders)
            ->assertOk()
            ->assertJsonPath('settings.earn_rate_per_mvr', 2)
            ->assertJsonPath('settings.redeem_rate_points_per_mvr', 80)
            ->assertJsonPath('settings.min_redeem_points', 50)
            ->assertJsonPath('settings.max_redeem_percent', 40)
            ->assertJsonPath('settings.points_expiry_days', 365)
            ->assertJsonPath('settings.customer_message', 'Earn double points this month!');

        $settings = app(LoyaltySettingsService::class);
        $this->assertSame(2.0, $settings->earnRatePerMvr());
        $this->assertSame(80, $settings->redeemRatePointsPerMvr());
        $this->assertSame(50, $settings->minRedeemPoints());
        $this->assertSame(40.0, $settings->maxRedeemPercent());
        $this->assertSame(365, $settings->pointsExpiryDays());
    }

    public function test_admin_can_update_tier_configuration(): void
    {
        $tier = LoyaltyTier::orderBy('id')->first();
        $this->assertNotNull($tier);

        $this->putJson('/api/admin/loyalty/tiers', [
            'tiers' => [[
                'id' => $tier->id,
                'name' => 'Bronze Plus',
                'slug' => 'bronze',
                'min_lifetime_points' => 0,
                'earn_multiplier' => 1.25,
                'sort_order' => 0,
            ]],
        ], $this->adminHeaders)
            ->assertOk()
            ->assertJsonPath('tiers.0.name', 'Bronze Plus')
            ->assertJsonPath('tiers.0.earn_multiplier', 1.25);

        $this->assertDatabaseHas('loyalty_tiers', [
            'id' => $tier->id,
            'name' => 'Bronze Plus',
        ]);
    }

    public function test_loyalty_me_returns_program_and_rates(): void
    {
        SiteSetting::set('loyalty_redeem_rate', '120');
        SiteSetting::set('loyalty_min_redeem', '80');
        app(LoyaltySettingsService::class)->bustCache();

        $customer = $this->makeCustomer();
        \Laravel\Sanctum\Sanctum::actingAs($customer, ['customer']);

        $response = $this->getJson('/api/loyalty/me')->assertOk();

        $response->assertJsonStructure([
            'account',
            'program' => ['enabled', 'redeem_rate_points_per_mvr', 'min_redeem_points'],
            'rates' => ['redeem_rate_points_per_mvr', 'min_redeem_points', 'max_redeem_percent'],
        ]);

        $this->assertSame(120, $response->json('rates.redeem_rate_points_per_mvr'));
        $this->assertSame(80, $response->json('rates.min_redeem_points'));
    }
}

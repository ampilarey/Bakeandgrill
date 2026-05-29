<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Role;
use App\Models\SiteSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DeliverySettingsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        SiteSetting::updateOrCreate(['key' => 'delivery_zones'], [
            'value' => null,
            'type' => 'json',
            'group' => 'Delivery',
            'label' => 'Delivery Zones',
            'is_public' => true,
        ]);
    }

    private function actingManager(): User
    {
        $role = Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'description' => '', 'is_active' => true]);
        $user = User::create([
            'name' => 'Owner',
            'email' => 'owner-delivery-settings@test.com',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        Sanctum::actingAs($user, ['staff']);

        return $user;
    }

    public function test_admin_delivery_settings_requires_auth(): void
    {
        $this->getJson('/api/admin/delivery/settings')->assertUnauthorized();
    }

    public function test_show_returns_config_defaults_when_unset(): void
    {
        $this->actingManager();

        $response = $this->getJson('/api/admin/delivery/settings')->assertOk();

        $response->assertJsonPath('settings.default_fee', 30);
        $response->assertJsonPath('settings.free_threshold', 200);
        $response->assertJsonPath('settings.zone_fees.Male', 20);
        $response->assertJsonPath('settings.zones_enforced', false);
    }

    public function test_patch_persists_settings_and_public_status_reflects_threshold(): void
    {
        $this->actingManager();

        $this->patchJson('/api/admin/delivery/settings', [
            'default_fee' => 35,
            'free_threshold' => 250,
            'zone_fees' => [
                'Male' => 15,
                'Hulhumale' => 25,
            ],
            'restrict_to_zone_fees' => true,
        ])->assertOk()
            ->assertJsonPath('settings.default_fee', 35)
            ->assertJsonPath('settings.free_threshold', 250)
            ->assertJsonPath('settings.zones_enforced', true);

        Cache::forget('site_setting.delivery_free_threshold');

        $this->getJson('/api/ordering/delivery-status')
            ->assertOk()
            ->assertJsonPath('free_delivery_threshold', 250);

        $this->assertEquals(1500, app(\App\Domains\Delivery\Services\DeliveryFeeCalculator::class)->calculateLaar('Male', 0));
        $this->assertEquals(0.0, app(\App\Domains\Delivery\Services\DeliveryFeeCalculator::class)->calculate('Male', 25000));
    }

    public function test_delivery_status_blocks_non_whitelisted_zone_when_restricted(): void
    {
        $this->actingManager();

        SiteSetting::set('delivery_accepting_orders', '1');
        SiteSetting::set('delivery_schedule', null);

        $this->patchJson('/api/admin/delivery/settings', [
            'default_fee' => 30,
            'free_threshold' => 200,
            'zone_fees' => ['Male' => 20],
            'restrict_to_zone_fees' => true,
        ])->assertOk();

        $this->getJson('/api/ordering/delivery-status?area=Hulhumale')
            ->assertOk()
            ->assertJsonPath('delivery_open', false);
    }
}

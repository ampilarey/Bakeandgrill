<?php

declare(strict_types=1);

namespace Tests\Feature\Delivery;

use App\Domains\Content\ContentResolver;
use App\Domains\Delivery\Services\DeliverySettingsService;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Domains\Settings\OpsOwnedContent;
use App\Models\Role;
use App\Models\SiteSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Owner decision 2026-08-14 — the delivery promise ("30–45 min") is managed in
 * Delivery Settings, beside the free-delivery threshold, so the two cannot drift.
 */
class DeliveryTimeOwnershipTest extends TestCase
{
    use RefreshDatabase;

    private function actingAsOwner(): void
    {
        $role = Role::firstOrCreate(
            ['slug' => 'owner'],
            ['name' => 'Owner', 'description' => '', 'is_active' => true],
        );
        PermissionCatalogSync::sync();
        $user = User::create([
            'name' => 'Owner',
            'email' => 'delivery-time@test.local',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        Sanctum::actingAs($user, ['staff']);
    }

    public function test_delivery_time_is_owned_by_delivery_settings(): void
    {
        $this->assertTrue(OpsOwnedContent::isDeliveryOpsMirror('delivery_time'));
        $this->assertTrue(OpsOwnedContent::isWriteForbidden('delivery_time'));
        $this->assertFalse(OpsOwnedContent::isHiddenFromContentHub('delivery_time'));

        $meta = OpsOwnedContent::managedByMeta('delivery_time');
        $this->assertSame('/admin/delivery-settings', $meta['owner_path']);
    }

    public function test_delivery_settings_saves_it_and_both_apps_show_it(): void
    {
        $this->actingAsOwner();

        $this->patchJson('/api/admin/delivery/settings', [
            'default_fee' => 30,
            'free_threshold' => 300,
            'delivery_time' => '25–40 min (test)',
            'zone_fees' => ['Malé' => 30],
        ])->assertOk();

        SiteSetting::bust();
        ContentResolver::bust();

        $this->assertSame('25–40 min (test)', app(DeliverySettingsService::class)->deliveryTime());
        $this->assertSame('25–40 min (test)', ContentResolver::for('website')->get('delivery_time'));
        $this->assertSame('25–40 min (test)', ContentResolver::for('order_app')->get('delivery_time'));

        $settings = $this->getJson('/api/admin/delivery/settings')->assertOk()->json('settings');
        $this->assertSame('25–40 min (test)', $settings['delivery_time']);
    }

    public function test_content_api_cannot_write_a_per_app_delivery_time(): void
    {
        $this->actingAsOwner();
        SiteSetting::set('delivery_time', '25–40 min (test)');
        ContentResolver::bust();

        foreach (['website', 'order_app'] as $scope) {
            $this->putJson('/api/admin/content', [
                'locale' => 'en',
                'changes' => [
                    ['key' => 'delivery_time', 'scope' => $scope, 'value' => '5 min'],
                ],
            ])->assertUnprocessable();
        }

        $this->assertSame('25–40 min (test)', ContentResolver::for('website')->get('delivery_time'));
    }

    public function test_unset_delivery_time_falls_back_to_the_default_not_blank(): void
    {
        SiteSetting::query()->where('key', 'delivery_time')->delete();
        SiteSetting::bust();
        ContentResolver::bust();

        $resolved = ContentResolver::for('website')->get('delivery_time');
        $this->assertNotSame('', $resolved, 'an unset delivery promise must not render blank');
        $this->assertSame(
            \App\Domains\Content\ContentRegistry::default('delivery_time'),
            $resolved,
        );
    }

    public function test_it_still_shows_in_content_hub_read_only_with_a_link_home(): void
    {
        $this->actingAsOwner();
        SiteSetting::set('delivery_time', '25–40 min (test)');
        ContentResolver::bust();

        $blocks = collect($this->getJson('/api/admin/content')->assertOk()->json('blocks'));
        $block = $blocks->firstWhere('key', 'delivery_time');

        $this->assertIsArray($block, 'delivery_time should still be visible, read-only');
        $this->assertSame('/admin/delivery-settings', $block['managed_by']['owner_path']);
        $this->assertSame('25–40 min (test)', $block['managed_by']['current_value']);
    }
}

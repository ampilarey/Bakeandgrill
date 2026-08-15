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
        $this->assertTrue(OpsOwnedContent::isHiddenFromContentHub('delivery_time'));

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

    public function test_it_is_hidden_from_content_and_branding_entirely(): void
    {
        // Owner decision 2026-08-15: "Hide those read only boxes also." A row
        // you cannot edit, among rows you can, reads as a setting to fix.
        $this->actingAsOwner();
        SiteSetting::set('delivery_time', '25–40 min (test)');
        ContentResolver::bust();

        $blocks = collect($this->getJson('/api/admin/content')->assertOk()->json('blocks'));

        $this->assertNull($blocks->firstWhere('key', 'delivery_time'));
        $this->assertNull($blocks->firstWhere('key', 'delivery_threshold'));
    }

    public function test_hiding_it_does_not_take_it_off_the_live_site(): void
    {
        // The danger of hiding a key: it stops being edited AND stops being
        // shown. The public payload must still carry the promise.
        SiteSetting::set('delivery_time', '25–40 min (test)');
        ContentResolver::bust();

        foreach (['website', 'order_app'] as $app) {
            $content = $this->getJson("/api/content?app={$app}&locale=en")->assertOk()->json('content');
            $this->assertSame('25–40 min (test)', $content['delivery_time'] ?? null, $app);
        }
    }
}

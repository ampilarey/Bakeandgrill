<?php

declare(strict_types=1);

namespace Tests\Feature\Settings;

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

class OpsOwnedSettingsOwnershipTest extends TestCase
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
            'name' => 'Ops Owner',
            'email' => 'ops-owned@test.local',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        Sanctum::actingAs($user, ['staff']);
    }

    public function test_free_delivery_threshold_only_updates_via_delivery_settings(): void
    {
        $this->actingAsOwner();

        SiteSetting::set('delivery_threshold', 'MVR 999', 'website');
        SiteSetting::set('delivery_threshold', 'MVR 888', 'order_app');
        SiteSetting::set('delivery_free_threshold', '200');
        ContentResolver::bust();

        // Content Hub cannot change the mirror key.
        $this->putJson('/api/admin/content', [
            'changes' => [
                ['key' => 'delivery_threshold', 'scope' => 'website', 'value' => 'MVR 50'],
            ],
        ])->assertUnprocessable()
            ->assertJsonValidationErrors(['changes.0.key']);

        $this->putJson('/api/admin/content/drafts', [
            'changes' => [
                ['key' => 'delivery_threshold', 'scope' => 'website', 'value' => 'MVR 50'],
            ],
        ])->assertUnprocessable();

        // Delivery Settings is the only write path.
        $this->patchJson('/api/admin/delivery/settings', [
            'default_fee' => 30,
            'free_threshold' => 275,
            'zone_fees' => ['Male' => 20],
            'restrict_to_zone_fees' => false,
        ])->assertOk()
            ->assertJsonPath('settings.free_threshold', 275);

        $this->assertSame('275', (string) SiteSetting::get('delivery_free_threshold'));

        // Public / ContentResolver mirrors the ops value — legacy content rows ignored.
        ContentResolver::bust();
        $this->assertSame('MVR 275', ContentResolver::for('website')->get('delivery_threshold'));
        $this->assertSame('MVR 275', ContentResolver::for('order_app')->get('delivery_threshold'));
        $this->assertSame('MVR 275', OpsOwnedContent::freeDeliveryThresholdLabel());

        $public = $this->getJson('/api/content?app=website')->assertOk()->json();
        $this->assertSame('MVR 275', $public['content']['delivery_threshold'] ?? null);
        $this->assertSame('MVR 275', $public['settings']['delivery_threshold'] ?? null);
    }

    public function test_content_hub_cannot_update_business_details_identity_keys(): void
    {
        $this->actingAsOwner();

        SiteSetting::set('business_phone', '+960 SHARED', 'shared');
        SiteSetting::set('business_phone', '+960 WEB OVERRIDE', 'website');
        ContentResolver::bust();

        $this->putJson('/api/admin/content', [
            'changes' => [
                ['key' => 'business_phone', 'scope' => 'website', 'value' => '+960 HACK'],
            ],
        ])->assertUnprocessable();

        // Resolver prefers Business Details (shared), ignoring app override leftovers.
        $this->assertSame('+960 SHARED', ContentResolver::for('website')->get('business_phone'));

        // Business Details remains the authoritative writer.
        $this->putJson('/api/admin/business-details', [
            'changes' => [
                ['key' => 'business_phone', 'value' => '+960 700 1234'],
            ],
        ])->assertOk();

        ContentResolver::bust();
        $this->assertSame('+960 700 1234', ContentResolver::for('website')->get('business_phone'));
        $this->assertSame('+960 700 1234', ContentResolver::for('order_app')->get('business_phone'));
    }

    public function test_business_details_cannot_update_delivery_or_tax_keys(): void
    {
        $this->actingAsOwner();

        $this->putJson('/api/admin/business-details', [
            'changes' => [
                ['key' => 'delivery_threshold', 'value' => 'MVR 1'],
            ],
        ])->assertUnprocessable();

        $this->putJson('/api/admin/business-details', [
            'changes' => [
                ['key' => 'delivery_free_threshold', 'value' => '1'],
            ],
        ])->assertUnprocessable();

        $this->putJson('/api/admin/business-details', [
            'changes' => [
                ['key' => 'seller_tin', 'value' => 'X'],
            ],
        ])->assertUnprocessable();
    }

    public function test_content_blocks_expose_managed_by_for_ops_owned_keys(): void
    {
        $this->actingAsOwner();
        SiteSetting::set('delivery_free_threshold', '210');
        ContentResolver::bust();

        $blocks = $this->getJson('/api/admin/content')->assertOk()->json('blocks');
        $threshold = collect($blocks)->firstWhere('key', 'delivery_threshold');
        $this->assertIsArray($threshold);
        $this->assertNotNull($threshold['managed_by']);
        $this->assertStringContainsString('Delivery', (string) $threshold['managed_by']['owner_label']);
        $this->assertSame('/admin/delivery-settings', $threshold['managed_by']['owner_path']);
        $this->assertSame('MVR 210', $threshold['managed_by']['current_value']);

        $phone = collect($blocks)->firstWhere('key', 'business_phone');
        $this->assertNotNull($phone['managed_by']);
        $this->assertSame('/admin/business-details', $phone['managed_by']['owner_path']);
    }

    public function test_fee_preview_uses_delivery_settings_threshold(): void
    {
        $this->actingAsOwner();
        app(DeliverySettingsService::class)->update([
            'default_fee' => 30,
            'free_threshold' => 150,
            'zone_fees' => ['Male' => 20],
            'restrict_to_zone_fees' => false,
        ]);

        $this->getJson('/api/ordering/delivery-fee-preview?island=Male&subtotal_laar=16000')
            ->assertOk()
            ->assertJsonPath('free_threshold_mvr', 150)
            ->assertJsonPath('fee_mvr', 0)
            ->assertJsonPath('qualifies_free', true);
    }
}

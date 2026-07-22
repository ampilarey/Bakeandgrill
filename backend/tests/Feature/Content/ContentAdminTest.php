<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Role;
use App\Models\SiteSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ContentAdminTest extends TestCase
{
    use RefreshDatabase;

    private function actingAsOwner(): User
    {
        $role = Role::firstOrCreate(
            ['slug' => 'owner'],
            ['name' => 'Owner', 'description' => '', 'is_active' => true],
        );
        PermissionCatalogSync::sync();
        $user = User::create([
            'name' => 'Content Owner',
            'email' => 'content-owner@test.local',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        Sanctum::actingAs($user, ['staff']);

        return $user;
    }

    public function test_admin_index_lists_registry_blocks(): void
    {
        $this->actingAsOwner();
        $blocks = $this->getJson('/api/admin/content')->assertOk()->json('blocks');
        $this->assertNotEmpty($blocks);
        $this->assertArrayHasKey('key', $blocks[0]);
        $this->assertArrayHasKey('state', $blocks[0]);
    }

    public function test_save_scoped_value_and_split_copy_share(): void
    {
        $this->actingAsOwner();
        SiteSetting::set('business_phone', '+960 SHARED', 'shared');

        $this->putJson('/api/admin/content', [
            'changes' => [
                ['key' => 'business_phone', 'scope' => 'website', 'value' => '+960 WEB'],
            ],
        ])->assertOk();

        $this->assertSame('+960 WEB', SiteSetting::getScoped('business_phone', 'website'));
        $this->assertSame('+960 SHARED', SiteSetting::get('business_phone'));

        $this->postJson('/api/admin/content/business_phone/split')->assertOk();
        $this->assertNotEmpty(SiteSetting::getScoped('business_phone', 'order_app'));

        $this->postJson('/api/admin/content/business_phone/copy', [
            'from' => 'website',
            'to' => 'order_app',
        ])->assertOk();
        $this->assertSame('+960 WEB', SiteSetting::getScoped('business_phone', 'order_app'));

        $this->postJson('/api/admin/content/business_phone/share')->assertOk();
        $this->assertFalse(
            SiteSetting::query()->where('key', 'business_phone')->where('scope', 'website')->exists(),
        );
    }

    public function test_rich_content_is_sanitised_on_save(): void
    {
        $this->actingAsOwner();
        $this->putJson('/api/admin/content', [
            'changes' => [
                [
                    'key' => 'cta_band_headline',
                    'scope' => 'shared',
                    'value' => 'Hi <script>x</script><em>there</em>',
                ],
            ],
        ])->assertOk();

        $val = SiteSetting::get('cta_band_headline');
        $this->assertStringNotContainsString('<script', (string) $val);
        $this->assertStringContainsString('<em>there</em>', (string) $val);
    }

    public function test_permission_enforced(): void
    {
        $role = Role::firstOrCreate(
            ['slug' => 'staff'],
            ['name' => 'Staff', 'description' => '', 'is_active' => true],
        );
        PermissionCatalogSync::sync();
        $user = User::create([
            'name' => 'Staffer',
            'email' => 'staff-content@test.local',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        Sanctum::actingAs($user, ['staff']);

        $this->getJson('/api/admin/content')->assertForbidden();
    }
}

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

        $this->postJson('/api/admin/content/business_phone/share', ['source' => 'website'])->assertOk();
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

    public function test_share_then_split_clears_stale_cache_so_different_per_app_works(): void
    {
        $this->actingAsOwner();

        $slides = json_encode([[
            'image' => '/images/shared.jpg',
            'title' => 'Shared Hero',
            'eyebrow' => '',
            'subtitle' => '',
            'cta_text' => 'Order',
            'cta_url' => '/order/',
        ]], JSON_UNESCAPED_SLASHES);

        SiteSetting::set('hero_slides', $slides, 'shared');
        SiteSetting::set('hero_slides', json_encode([[
            'image' => '/images/web.jpg',
            'title' => 'Web Only',
        ]], JSON_UNESCAPED_SLASHES), 'website');
        SiteSetting::set('hero_slides', json_encode([[
            'image' => '/images/order.jpg',
            'title' => 'Order Only',
        ]], JSON_UNESCAPED_SLASHES), 'order_app');

        // Collapse to Same in both — must kill scoped forever-cache entries.
        $this->postJson('/api/admin/content/hero_slides/share', ['locale' => 'en', 'source' => 'shared'])->assertOk();
        $this->assertNull(SiteSetting::getScoped('hero_slides', 'website', 'en'));
        $this->assertNull(SiteSetting::getScoped('hero_slides', 'order_app', 'en'));
        $this->assertSame('same', \App\Domains\Content\ContentRegistry::linkState('hero_slides', 'en'));

        // Plant the historical bug: stale non-null forever cache with no DB row.
        \App\Support\ResilientCache::forever(
            'site_setting.hero_slides.website.en',
            json_encode([['title' => 'STALE WEB']], JSON_UNESCAPED_SLASHES),
        );
        \App\Support\ResilientCache::forever(
            'site_setting.hero_slides.order_app.en',
            json_encode([['title' => 'STALE ORDER']], JSON_UNESCAPED_SLASHES),
        );

        // Different per app must still create real override rows (not no-op on stale cache).
        $res = $this->postJson('/api/admin/content/hero_slides/split', ['locale' => 'en'])->assertOk();
        $hero = collect($res->json('blocks'))->firstWhere('key', 'hero_slides');
        $this->assertNotNull($hero);
        $this->assertSame('different', $hero['link_state']);
        $this->assertNotNull(SiteSetting::getScoped('hero_slides', 'website', 'en'));
        $this->assertNotNull(SiteSetting::getScoped('hero_slides', 'order_app', 'en'));
        $this->assertStringContainsString('Shared Hero', (string) SiteSetting::getScoped('hero_slides', 'website', 'en'));
        $this->assertStringNotContainsString('STALE', (string) SiteSetting::getScoped('hero_slides', 'website', 'en'));
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

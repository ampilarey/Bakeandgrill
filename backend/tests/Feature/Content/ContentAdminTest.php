<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\ContentSchedule;
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
                    'scope' => 'website',
                    'value' => 'Hi <script>x</script><em>there</em>',
                ],
            ],
        ])->assertOk();

        $val = SiteSetting::getScoped('cta_band_headline', 'website');
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

    public function test_content_validation_normalizes_primary_color_and_rejects_bad_public_url(): void
    {
        $this->actingAsOwner();

        $this->putJson('/api/admin/content', [
            'changes' => [
                ['key' => 'primary_color', 'scope' => 'shared', 'value' => '#d8a'],
            ],
        ])->assertOk();

        $this->assertSame('#DD88AA', SiteSetting::getScoped('primary_color', 'shared'));

        $this->putJson('/api/admin/content', [
            'changes' => [
                ['key' => 'announcement_url', 'scope' => 'shared', 'value' => 'javascript:alert(1)'],
            ],
        ])->assertUnprocessable();

        $this->assertNotSame('javascript:alert(1)', SiteSetting::getScoped('announcement_url', 'shared'));
    }

    public function test_content_validation_rejects_invalid_hero_json_and_bad_hero_urls(): void
    {
        $this->actingAsOwner();

        $this->putJson('/api/admin/content', [
            'changes' => [
                ['key' => 'hero_slides', 'scope' => 'shared', 'value' => ['title' => 'Not a list']],
            ],
        ])->assertUnprocessable();

        $this->putJson('/api/admin/content', [
            'changes' => [
                [
                    'key' => 'hero_slides',
                    'scope' => 'shared',
                    'value' => [[
                        'title' => 'Unsafe',
                        'cta_text' => 'Tap',
                        'cta_url' => 'javascript:alert(1)',
                    ]],
                ],
            ],
        ])->assertUnprocessable();

        $this->putJson('/api/admin/content', [
            'changes' => [
                [
                    'key' => 'hero_slides',
                    'scope' => 'shared',
                    'value' => [[
                        'title' => 'Safe',
                        'showing' => false,
                        'cta_text' => 'Email',
                        'cta_url' => 'mailto:hello@example.test',
                    ]],
                ],
            ],
        ])->assertOk();

        $slides = json_decode((string) SiteSetting::getScoped('hero_slides', 'shared'), true);
        $this->assertFalse($slides[0]['showing']);
        $this->assertSame('mailto:hello@example.test', $slides[0]['cta_url']);
    }

    public function test_content_validation_rejects_invalid_app_scope_overrides(): void
    {
        $this->actingAsOwner();

        // Order-app-only key cannot take a website override.
        $this->putJson('/api/admin/content', [
            'changes' => [
                ['key' => 'menu_page_title', 'scope' => 'website', 'value' => 'Wrong app'],
            ],
        ])->assertUnprocessable();

        // Website-only key cannot take an order_app override.
        $this->putJson('/api/admin/content', [
            'changes' => [
                ['key' => 'meta_title', 'scope' => 'order_app', 'value' => 'Wrong app'],
            ],
        ])->assertUnprocessable();

        // Shared remains the seed/default layer even for website-targeted keys.
        $this->putJson('/api/admin/content', [
            'changes' => [
                ['key' => 'meta_title', 'scope' => 'shared', 'value' => 'Shared seed title'],
            ],
        ])->assertOk();
        $this->assertSame('Shared seed title', SiteSetting::getScoped('meta_title', 'shared'));
    }

    public function test_schedule_and_import_use_content_validator(): void
    {
        $this->actingAsOwner();

        $this->postJson('/api/admin/content/schedule', [
            'publish_at' => now()->addHour()->toIso8601String(),
            'changes' => [
                ['key' => 'primary_color', 'scope' => 'shared', 'value' => '#abc'],
            ],
        ])->assertCreated();

        $this->assertSame('#AABBCC', ContentSchedule::query()->latest('id')->value('value'));

        $this->postJson('/api/admin/content/schedule', [
            'publish_at' => now()->addHour()->toIso8601String(),
            'changes' => [
                ['key' => 'announcement_url', 'scope' => 'shared', 'value' => '//evil.example'],
            ],
        ])->assertUnprocessable();

        $this->postJson('/api/admin/content/import', [
            'entries' => [
                ['key' => 'announcement_url', 'scope' => 'shared', 'value' => 'data:text/html,<svg>'],
            ],
        ])->assertUnprocessable();
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

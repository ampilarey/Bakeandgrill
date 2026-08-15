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

    public function test_save_scoped_value_leaves_shared_and_other_app_alone(): void
    {
        $this->actingAsOwner();
        // Marketing copy key (not ops-owned / Business Details).
        SiteSetting::set('home_specials_title', 'SHARED SPECIALS', 'shared');
        SiteSetting::set('home_specials_title', 'ORDER SPECIALS', 'order_app');

        $this->putJson('/api/admin/content', [
            'changes' => [
                ['key' => 'home_specials_title', 'scope' => 'website', 'value' => 'WEB SPECIALS'],
            ],
        ])->assertOk();

        $this->assertSame('WEB SPECIALS', SiteSetting::getScoped('home_specials_title', 'website'));
        $this->assertSame('ORDER SPECIALS', SiteSetting::getScoped('home_specials_title', 'order_app'));
        $this->assertSame('SHARED SPECIALS', SiteSetting::get('home_specials_title'));
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

    public function test_content_validation_rejects_business_record_keys_and_bad_public_url(): void
    {
        $this->actingAsOwner();

        // primary_color moved to Business Details (2026-08-14) — the content API
        // must refuse it rather than store a competing per-app copy.
        $this->putJson('/api/admin/content', [
            'changes' => [
                ['key' => 'primary_color', 'scope' => 'website', 'value' => '#d8a'],
            ],
        ])->assertUnprocessable();

        $this->assertNull(SiteSetting::getScoped('primary_color', 'website'));

        $this->putJson('/api/admin/content', [
            'changes' => [
                ['key' => 'announcement_url', 'scope' => 'website', 'value' => 'javascript:alert(1)'],
            ],
        ])->assertUnprocessable();

        $this->assertNotSame('javascript:alert(1)', SiteSetting::getScoped('announcement_url', 'website'));
    }

    public function test_content_validation_rejects_invalid_hero_json_and_bad_hero_urls(): void
    {
        $this->actingAsOwner();

        $this->putJson('/api/admin/content', [
            'changes' => [
                ['key' => 'hero_slides', 'scope' => 'website', 'value' => ['title' => 'Not a list']],
            ],
        ])->assertUnprocessable();

        $this->putJson('/api/admin/content', [
            'changes' => [
                [
                    'key' => 'hero_slides',
                    'scope' => 'website',
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
                    'scope' => 'website',
                    'value' => [[
                        'title' => 'Safe',
                        'showing' => false,
                        'cta_text' => 'Email',
                        'cta_url' => 'mailto:hello@example.test',
                    ]],
                ],
            ],
        ])->assertOk();

        $slides = json_decode((string) SiteSetting::getScoped('hero_slides', 'website'), true);
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

        // Content Hub rejects shared scope — use Business Details for shared writes.
        $this->putJson('/api/admin/content', [
            'changes' => [
                ['key' => 'meta_title', 'scope' => 'shared', 'value' => 'Shared seed title'],
            ],
        ])->assertUnprocessable();
    }

    public function test_schedule_and_import_use_content_validator(): void
    {
        $this->actingAsOwner();

        $this->postJson('/api/admin/content/schedule', [
            'publish_at' => now()->addHour()->toIso8601String(),
            'changes' => [
                ['key' => 'announcement_text', 'scope' => 'website', 'value' => '  Ramadan hours  '],
            ],
        ])->assertCreated();

        $this->assertSame('Ramadan hours', ContentSchedule::query()->latest('id')->value('value'));

        $this->postJson('/api/admin/content/schedule', [
            'publish_at' => now()->addHour()->toIso8601String(),
            'changes' => [
                ['key' => 'announcement_url', 'scope' => 'website', 'value' => '//evil.example'],
            ],
        ])->assertUnprocessable();

        $this->postJson('/api/admin/content/import', [
            'entries' => [
                ['key' => 'announcement_url', 'scope' => 'website', 'value' => 'data:text/html,<svg>'],
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

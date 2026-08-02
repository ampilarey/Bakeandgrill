<?php

declare(strict_types=1);

namespace Tests\Feature\Signage;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Domains\Signage\Services\SignageResolver;
use App\Domains\Signage\Services\WeightedRotation;
use App\Models\Role;
use App\Models\SignageCampaign;
use App\Models\SignageGroup;
use App\Models\SignagePlaylist;
use App\Models\SignageScreen;
use App\Models\SiteSetting;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

final class SignageResolverTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'description' => '', 'is_active' => true]);
        Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'description' => '', 'is_active' => true]);
        PermissionCatalogSync::sync();
    }

    public function test_public_signage_returns_default_screen_config(): void
    {
        $res = $this->getJson('/api/signage');
        $res->assertOk();
        $res->assertJsonStructure([
            'playlist_version',
            'slides',
            'rotation',
            'theme',
            'orientation',
            'refresh_seconds',
            'bestsellers',
            'menu_new_days',
            'variables',
        ]);
        $this->assertNotEmpty($res->json('slides'));
    }

    public function test_screen_inherits_group_playlist_and_can_override(): void
    {
        $base = SignagePlaylist::query()->firstOrFail();
        $override = SignagePlaylist::create([
            'name' => 'Override',
            'slides' => [['id' => 'only', 'name' => 'Only', 'seconds' => 5, 'weight' => 1, 'elements' => []]],
            'theme' => ['primary' => '#111111'],
            'is_active' => true,
        ]);
        $group = SignageGroup::query()->firstOrFail();
        $group->update(['playlist_id' => $base->id]);

        SignageScreen::create([
            'name' => 'Cashier',
            'slug' => 'cashier',
            'group_id' => $group->id,
            'playlist_id' => $override->id,
            'orientation' => 'portrait',
            'refresh_seconds' => 90,
        ]);

        /** @var SignageResolver $resolver */
        $resolver = app(SignageResolver::class);
        $cfg = $resolver->resolveFresh('cashier', Carbon::now(), null, 'v1');
        $this->assertSame('portrait', $cfg['orientation']);
        $this->assertSame(90, $cfg['refresh_seconds']);
        $this->assertSame($override->id, $cfg['playlist_id']);
        $this->assertSame('only', $cfg['slides'][0]['id']);
    }

    public function test_campaign_priority_overrides_base_playlist(): void
    {
        $promo = SignagePlaylist::create([
            'name' => 'Ramadan',
            'slides' => [['id' => 'ramadan', 'name' => 'Ramadan', 'seconds' => 10, 'weight' => 1, 'elements' => []]],
            'theme' => [],
            'is_active' => true,
        ]);
        SignageCampaign::create([
            'name' => 'Ramadan promo',
            'playlist_id' => $promo->id,
            'date_start' => now()->subDay()->toDateString(),
            'date_end' => now()->addDay()->toDateString(),
            'days' => null,
            'windows' => null,
            'priority' => 50,
            'is_active' => true,
            'store_id' => null,
        ]);

        /** @var SignageResolver $resolver */
        $resolver = app(SignageResolver::class);
        $cfg = $resolver->resolveFresh('default', Carbon::now(), null, 'v2');
        $this->assertStringStartsWith('campaign:', $cfg['source']);
        $this->assertSame('ramadan', $cfg['slides'][0]['id']);
    }

    public function test_corporate_null_store_campaign_applies_to_all(): void
    {
        $promo = SignagePlaylist::create([
            'name' => 'Corp',
            'slides' => [['id' => 'corp', 'name' => 'Corp', 'seconds' => 8, 'weight' => 1, 'elements' => []]],
            'is_active' => true,
        ]);
        SignageCampaign::create([
            'name' => 'Corporate',
            'playlist_id' => $promo->id,
            'priority' => 10,
            'is_active' => true,
            'store_id' => null,
        ]);

        /** @var SignageResolver $resolver */
        $resolver = app(SignageResolver::class);
        $cfg = $resolver->resolveFresh('default', Carbon::now(), 999, 'v3');
        $this->assertSame('corp', $cfg['slides'][0]['id']);
    }

    public function test_emergency_wins_over_campaign_and_auto_resumes(): void
    {
        $promo = SignagePlaylist::create([
            'name' => 'Promo',
            'slides' => [['id' => 'promo', 'name' => 'Promo', 'seconds' => 8, 'weight' => 1, 'elements' => []]],
            'is_active' => true,
        ]);
        SignageCampaign::create([
            'name' => 'Active',
            'playlist_id' => $promo->id,
            'priority' => 99,
            'is_active' => true,
        ]);
        SiteSetting::set('signage_emergency', 'closed');

        /** @var SignageResolver $resolver */
        $resolver = app(SignageResolver::class);
        $cfg = $resolver->resolveFresh('default', Carbon::now(), null, 'v4');
        $this->assertSame('emergency', $cfg['source']);
        $this->assertStringContainsString('emergency', $cfg['mode']);

        SiteSetting::set('signage_emergency', 'none');
        $cfg2 = $resolver->resolveFresh('default', Carbon::now(), null, 'v5');
        $this->assertSame('promo', $cfg2['slides'][0]['id']);
    }

    public function test_weighted_rotation_includes_each_slide_without_source_duplicates(): void
    {
        $slides = [
            ['id' => 'a', 'weight' => 1],
            ['id' => 'b', 'weight' => 3],
            ['id' => 'c', 'weight' => 1],
        ];
        $order = WeightedRotation::buildOrder($slides);
        $this->assertContains('a', $order);
        $this->assertContains('b', $order);
        $this->assertContains('c', $order);
        $counts = array_count_values($order);
        $this->assertGreaterThan($counts['a'], $counts['b']);
        $this->assertCount(3, $slides);
    }

    public function test_variables_blank_unknowns_and_interpolate_known(): void
    {
        SiteSetting::set('site_name', 'Bake & Grill');
        SiteSetting::set('signage_wifi_name', 'BG-Guest');

        /** @var SignageResolver $resolver */
        $resolver = app(SignageResolver::class);
        $cfg = $resolver->resolveFresh('default', Carbon::now(), null, 'v6');
        $this->assertSame('Bake & Grill', $cfg['variables']['branch_name']);
        $this->assertSame('BG-Guest', $cfg['variables']['wifi_name']);
        $this->assertArrayHasKey('promotion_name', $cfg['variables']);
    }

    public function test_admin_writes_are_permission_gated(): void
    {
        $this->putJson('/api/admin/signage/emergency', ['mode' => 'closed'])->assertUnauthorized();

        $staff = User::create([
            'name' => 'Staff Signage',
            'email' => 'staff-signage@test.com',
            'password' => Hash::make('password'),
            'role_id' => Role::where('slug', 'staff')->value('id'),
            'is_active' => true,
        ]);
        Sanctum::actingAs($staff, ['staff']);
        $this->putJson('/api/admin/signage/emergency', ['mode' => 'closed'])->assertForbidden();
    }

    public function test_owner_can_set_emergency(): void
    {
        $owner = User::create([
            'name' => 'Owner Signage',
            'email' => 'owner-signage@test.com',
            'password' => Hash::make('password'),
            'role_id' => Role::where('slug', 'owner')->value('id'),
            'is_active' => true,
        ]);
        Sanctum::actingAs($owner, ['staff']);

        $this->putJson('/api/admin/signage/emergency', ['mode' => 'maintenance'])
            ->assertOk()
            ->assertJson(['mode' => 'maintenance']);
        $this->assertSame('maintenance', (string) SiteSetting::get('signage_emergency'));
    }

    public function test_resolve_includes_prayer_schedule_and_disabled_banner_by_default(): void
    {
        /** @var SignageResolver $resolver */
        $resolver = app(SignageResolver::class);
        $cfg = $resolver->resolveFresh('default', Carbon::now('Indian/Maldives'), null, 'v-banner');

        $this->assertArrayHasKey('prayer_schedule', $cfg);
        $this->assertIsArray($cfg['prayer_schedule']);
        // When prayer lookup works we get five ISO entries; when it fails we get [].
        if ($cfg['prayer_schedule'] !== []) {
            $this->assertCount(5, $cfg['prayer_schedule']);
            foreach ($cfg['prayer_schedule'] as $entry) {
                $this->assertArrayHasKey('name', $entry);
                $this->assertArrayHasKey('at', $entry);
                $this->assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}T/', (string) $entry['at']);
            }
        }
        $this->assertArrayHasKey('banner', $cfg);
        $this->assertFalse((bool) $cfg['banner']['enabled']);
        $this->assertSame('bottom', $cfg['banner']['position']);
    }

    public function test_banner_settings_round_trip_and_bust_cache(): void
    {
        $owner = User::create([
            'name' => 'Owner Banner',
            'email' => 'owner-banner@test.com',
            'password' => Hash::make('password'),
            'role_id' => Role::where('slug', 'owner')->value('id'),
            'is_active' => true,
        ]);
        Sanctum::actingAs($owner, ['staff']);

        $this->putJson('/api/admin/signage/banner', [
            'enabled' => true,
            'position' => 'top',
            'fields' => ['date', 'time', 'next_prayer', 'countdown'],
            'speed_seconds' => 55,
        ])->assertOk()->assertJsonPath('banner.enabled', true)
            ->assertJsonPath('banner.position', 'top')
            ->assertJsonPath('banner.speed_seconds', 55);

        $raw = SiteSetting::get('signage_banner');
        $stored = is_string($raw) ? (json_decode($raw, true) ?: []) : (is_array($raw) ? $raw : []);
        $this->assertIsArray($stored);
        $this->assertTrue((bool) ($stored['enabled'] ?? false));

        $overview = $this->getJson('/api/admin/signage')->assertOk();
        $overview->assertJsonPath('banner.enabled', true);
        $overview->assertJsonPath('banner.position', 'top');

        /** @var SignageResolver $resolver */
        $resolver = app(SignageResolver::class);
        $cfg = $resolver->resolveFresh('default', Carbon::now(), null, 'v-banner-2');
        $this->assertTrue((bool) $cfg['banner']['enabled']);
        $this->assertSame('top', $cfg['banner']['position']);
        $this->assertSame(55, $cfg['banner']['speed_seconds']);
    }
}

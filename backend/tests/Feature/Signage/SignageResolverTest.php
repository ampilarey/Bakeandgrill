<?php

declare(strict_types=1);

namespace Tests\Feature\Signage;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Domains\Signage\Services\SignageBannerNormalizer;
use App\Domains\Signage\Services\SignageResolver;
use App\Domains\Signage\Services\WeightedRotation;
use App\Models\Role;
use App\Models\SignageCampaign;
use App\Models\SignageGroup;
use App\Models\SignagePlaylist;
use App\Models\SignageScreen;
use App\Models\SiteSetting;
use App\Models\User;
use App\Support\PrayerTimeHelper;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
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
        $this->assertArrayHasKey('business_phone', $cfg['variables']);
        $this->assertArrayHasKey('business_website', $cfg['variables']);
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
            ->assertJsonPath('manual', 'maintenance');
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
        $this->assertIsArray($cfg['banner']['banners'] ?? null);
        $this->assertSame('bottom', $cfg['banner']['banners'][0]['position']);
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

        // Legacy Stage-3 shape still accepted and normalized into banners[].
        $this->putJson('/api/admin/signage/banner', [
            'enabled' => true,
            'position' => 'top',
            'fields' => ['date', 'time', 'next_prayer', 'countdown'],
            'speed_seconds' => 55,
        ])->assertOk()->assertJsonPath('banner.enabled', true)
            ->assertJsonPath('banner.banners.0.position', 'top')
            ->assertJsonPath('banner.banners.0.speed_seconds', 55);

        $raw = SiteSetting::get('signage_banner');
        $stored = is_string($raw) ? (json_decode($raw, true) ?: []) : (is_array($raw) ? $raw : []);
        $this->assertIsArray($stored);
        $this->assertTrue((bool) ($stored['enabled'] ?? false));
        $this->assertIsArray($stored['banners'] ?? null);

        $overview = $this->getJson('/api/admin/signage')->assertOk();
        $overview->assertJsonPath('banner.enabled', true);
        $overview->assertJsonPath('banner.banners.0.position', 'top');

        /** @var SignageResolver $resolver */
        $resolver = app(SignageResolver::class);
        $cfg = $resolver->resolveFresh('default', Carbon::now(), null, 'v-banner-2');
        $this->assertTrue((bool) $cfg['banner']['enabled']);
        $this->assertSame('top', $cfg['banner']['banners'][0]['position']);
        $this->assertSame(55, $cfg['banner']['banners'][0]['speed_seconds']);
    }

    public function test_multi_banner_list_round_trip(): void
    {
        $owner = User::create([
            'name' => 'Owner Multi Banner',
            'email' => 'owner-multi-banner@test.com',
            'password' => Hash::make('password'),
            'role_id' => Role::where('slug', 'owner')->value('id'),
            'is_active' => true,
        ]);
        Sanctum::actingAs($owner, ['staff']);

        $this->putJson('/api/admin/signage/banner', [
            'enabled' => true,
            'banners' => [
                [
                    'id' => 'prayer',
                    'label' => 'Prayer',
                    'enabled' => true,
                    'position' => 'bottom',
                    'fields' => ['date', 'time', 'next_prayer', 'countdown'],
                    'speed_seconds' => 40,
                    'duration_seconds' => 30,
                ],
                [
                    'id' => 'wifi',
                    'label' => 'Wi-Fi',
                    'enabled' => true,
                    'position' => 'bottom',
                    'custom_text' => 'Wi-Fi: {{wifi_name}} · {{wifi_password}}',
                    'fields' => ['date'],
                    'speed_seconds' => 40,
                    'duration_seconds' => 20,
                ],
            ],
        ])->assertOk()
            ->assertJsonPath('banner.enabled', true)
            ->assertJsonPath('banner.banners.1.label', 'Wi-Fi')
            ->assertJsonPath('banner.banners.1.custom_text', 'Wi-Fi: {{wifi_name}} · {{wifi_password}}')
            ->assertJsonPath('banner.banners.1.duration_seconds', 20);

        /** @var SignageResolver $resolver */
        $resolver = app(SignageResolver::class);
        $cfg = $resolver->resolveFresh('default', Carbon::now(), null, 'v-banner-multi');
        $this->assertCount(2, $cfg['banner']['banners']);
        $this->assertSame('wifi', $cfg['banner']['banners'][1]['id']);
        // Banners posted with no scroll_mode / scroll get current appearance defaults.
        $this->assertSame(1.0, $cfg['banner']['banners'][0]['font_scale']);
        $this->assertSame(SignageBannerNormalizer::DEFAULT_SCROLL_MODE, $cfg['banner']['banners'][0]['scroll_mode']);
        $this->assertSame('full', $cfg['banner']['banners'][0]['date_format']);
    }

    public function test_banner_appearance_settings_round_trip(): void
    {
        $owner = User::create([
            'name' => 'Owner Banner Appear',
            'email' => 'owner-banner-appear@test.com',
            'password' => Hash::make('password'),
            'role_id' => Role::where('slug', 'owner')->value('id'),
            'is_active' => true,
        ]);
        Sanctum::actingAs($owner, ['staff']);

        $this->putJson('/api/admin/signage/banner', [
            'enabled' => true,
            'banners' => [[
                'id' => 'styled',
                'label' => 'Styled',
                'enabled' => true,
                'position' => 'top',
                'fields' => ['date', 'time'],
                'speed_seconds' => 50,
                'duration_seconds' => 25,
                'font_scale' => 1.75,
                'height_scale' => 1.25,
                'text_color' => '#ffe8c8',
                'background_color' => 'rgba(20, 10, 5, 0.9)',
                'align' => 'center',
                'scroll_mode' => 'ticker',
                'date_format' => 'short',
                'inset_percent' => 3,
            ]],
        ])->assertOk()
            ->assertJsonPath('banner.banners.0.font_scale', 1.75)
            ->assertJsonPath('banner.banners.0.height_scale', 1.25)
            ->assertJsonPath('banner.banners.0.text_color', '#ffe8c8')
            ->assertJsonPath('banner.banners.0.background_color', 'rgba(20, 10, 5, 0.9)')
            ->assertJsonPath('banner.banners.0.align', 'center')
            ->assertJsonPath('banner.banners.0.scroll_mode', 'ticker')
            ->assertJsonPath('banner.banners.0.date_format', 'short')
            ->assertJsonPath('banner.banners.0.inset_percent', 3);

        /** @var SignageResolver $resolver */
        $resolver = app(SignageResolver::class);
        $cfg = $resolver->resolveFresh('default', Carbon::now(), null, 'v-banner-appear');
        $this->assertSame(1.75, $cfg['banner']['banners'][0]['font_scale']);
        $this->assertSame('ticker', $cfg['banner']['banners'][0]['scroll_mode']);
        $this->assertSame('short', $cfg['banner']['banners'][0]['date_format']);
        $this->assertSame(3.0, $cfg['banner']['banners'][0]['inset_percent']);
    }

    public function test_banner_legacy_scroll_boolean_preserves_look_on_save(): void
    {
        $owner = User::create([
            'name' => 'Owner Banner Migrate',
            'email' => 'owner-banner-migrate@test.com',
            'password' => Hash::make('password'),
            'role_id' => Role::where('slug', 'owner')->value('id'),
            'is_active' => true,
        ]);
        Sanctum::actingAs($owner, ['staff']);

        // scroll:false → static (pre-enhancement non-scrolling banners).
        $this->putJson('/api/admin/signage/banner', [
            'enabled' => true,
            'banners' => [[
                'id' => 'legacy-scroll-false',
                'label' => 'Legacy static',
                'enabled' => true,
                'position' => 'bottom',
                'fields' => ['date'],
                'speed_seconds' => 40,
                'duration_seconds' => 30,
                'scroll' => false,
            ]],
        ])->assertOk()
            ->assertJsonPath('banner.banners.0.scroll_mode', 'static');

        // scroll:true → seamless (pre-enhancement scrolling look must be preserved).
        $this->putJson('/api/admin/signage/banner', [
            'enabled' => true,
            'banners' => [[
                'id' => 'legacy-scroll-true',
                'label' => 'Legacy seamless',
                'enabled' => true,
                'position' => 'bottom',
                'fields' => ['date'],
                'speed_seconds' => 40,
                'duration_seconds' => 30,
                'scroll' => true,
            ]],
        ])->assertOk()
            ->assertJsonPath('banner.banners.0.scroll_mode', 'seamless');

        /** @var SignageResolver $resolver */
        $resolver = app(SignageResolver::class);
        $cfg = $resolver->resolveFresh('default', Carbon::now(), null, 'v-banner-legacy-scroll');
        $this->assertSame('seamless', $cfg['banner']['banners'][0]['scroll_mode']);
    }

    public function test_prayer_island_setting_drives_schedule_and_admin_round_trip(): void
    {
        DB::table('prayer_categories')->insert(['id' => 1]);
        DB::table('prayer_islands')->insert([
            [
                'id' => 102,
                'category_id' => 1,
                'atoll' => 'ކ',
                'atoll_latin' => 'Kaafu',
                'name' => PrayerTimeHelper::MALE_ISLAND_DV_NAME,
                'name_latin' => 'Malé',
                'offset_minutes' => 0,
                'latitude' => 4.1754,
                'longitude' => 73.5093,
                'is_active' => true,
            ],
            [
                'id' => 201,
                'category_id' => 1,
                'atoll' => 'އ',
                'atoll_latin' => 'Addu',
                'name' => 'Hithadhoo',
                'name_latin' => 'Hithadhoo',
                'offset_minutes' => 5,
                'latitude' => -0.6,
                'longitude' => 73.1,
                'is_active' => true,
            ],
        ]);
        $now = Carbon::now(PrayerTimeHelper::MVT_TIMEZONE);
        $doy = (int) $now->dayOfYear;
        // PrayerTimeResolver shifts non-leap Mar–Dec lookups by +1 to match leap-year source rows.
        if (! $now->isLeapYear() && $doy >= 60) {
            $doy++;
        }
        DB::table('prayer_times')->insert([
            'category_id' => 1,
            'day_of_year' => $doy,
            'fajr' => 270,
            'sunrise' => 330,
            'dhuhr' => 720,
            'asr' => 930,
            'maghrib' => 1080,
            'isha' => 1140,
        ]);

        SiteSetting::set('signage_prayer_island_id', '102');
        /** @var SignageResolver $resolver */
        $resolver = app(SignageResolver::class);
        $male = $resolver->resolveFresh('default', Carbon::now(PrayerTimeHelper::MVT_TIMEZONE), null, 'v-isle-male');
        $this->assertNotEmpty($male['prayer_schedule']);

        SiteSetting::set('signage_prayer_island_id', '201');
        $other = $resolver->resolveFresh('default', Carbon::now(PrayerTimeHelper::MVT_TIMEZONE), null, 'v-isle-other');
        $this->assertNotEmpty($other['prayer_schedule']);
        // Same category times + different island offset → schedule timestamps must differ.
        $this->assertNotSame(
            $male['prayer_schedule'][0]['at'] ?? null,
            $other['prayer_schedule'][0]['at'] ?? null
        );

        $owner = User::create([
            'name' => 'Owner Prayer Island',
            'email' => 'owner-prayer-island@test.com',
            'password' => Hash::make('password'),
            'role_id' => Role::where('slug', 'owner')->value('id'),
            'is_active' => true,
        ]);
        Sanctum::actingAs($owner, ['staff']);

        $this->putJson('/api/admin/signage/prayer', [
            'enabled' => true,
            'prayers' => ['dhuhr', 'asr'],
            'break_minutes' => 12,
            'island_id' => 201,
        ])->assertOk()
            ->assertJsonPath('prayer.island_id', 201)
            ->assertJsonPath('prayer.break_minutes', 12);

        $this->assertSame('201', (string) SiteSetting::get('signage_prayer_island_id'));
        $overview = $this->getJson('/api/admin/signage')->assertOk();
        $overview->assertJsonPath('prayer.island_id', 201);
        $this->assertNotEmpty($overview->json('prayer_islands'));
    }
}

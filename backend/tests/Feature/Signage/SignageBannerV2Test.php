<?php

declare(strict_types=1);

namespace Tests\Feature\Signage;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Domains\Signage\Services\SignageResolver;
use App\Models\Role;
use App\Models\SiteSetting;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

final class SignageBannerV2Test extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'description' => '', 'is_active' => true]);
        PermissionCatalogSync::sync();
    }

    public function test_migration_converts_seamless_and_scroll_true_to_ticker(): void
    {
        DB::table('migrations')
            ->where('migration', '2026_08_03_120000_migrate_signage_banner_seamless_to_ticker')
            ->delete();

        $before = [
            'enabled' => true,
            'banners' => [
                ['id' => 'a', 'scroll_mode' => 'seamless', 'fields' => ['date'], 'speed_seconds' => 40],
                ['id' => 'b', 'scroll' => true, 'fields' => ['time'], 'speed_seconds' => 40],
                ['id' => 'c', 'fields' => ['date'], 'speed_seconds' => 40],
                ['id' => 'd', 'scroll' => false, 'scroll_mode' => 'static', 'fields' => ['date'], 'speed_seconds' => 40],
            ],
        ];
        SiteSetting::set('signage_banner', $before);
        SiteSetting::bust();

        Artisan::call('migrate', [
            '--path' => 'database/migrations/2026_08_03_120000_migrate_signage_banner_seamless_to_ticker.php',
            '--force' => true,
        ]);
        SiteSetting::bust();

        $raw = SiteSetting::get('signage_banner');
        $stored = is_string($raw) ? json_decode($raw, true) : $raw;
        $this->assertIsArray($stored);
        $this->assertArrayHasKey('show_logo_between', $stored);
        $this->assertFalse((bool) $stored['show_logo_between']);
        $byId = collect($stored['banners'])->keyBy('id');
        $this->assertSame('ticker', $byId['a']['scroll_mode']);
        $this->assertArrayNotHasKey('scroll', $byId['a']);
        $this->assertSame('ticker', $byId['b']['scroll_mode']);
        $this->assertSame('ticker', $byId['c']['scroll_mode']);
        $this->assertSame('static', $byId['d']['scroll_mode']);
        $this->assertSame(1, $byId['a']['repeat_count']);
        $this->assertSame('ltr', $byId['a']['direction']);
    }

    public function test_manual_emergency_overrides_scheduled_entry(): void
    {
        SiteSetting::set('signage_emergency', 'none');
        SiteSetting::set('signage_emergency_entries', [
            'entries' => [[
                'id' => 'sched-closed',
                'mode' => 'closed',
                'priority' => 100,
                'is_active' => true,
                'layout' => 'notice',
                'title' => 'Scheduled closed',
                'body' => 'Should not show when manual set',
            ]],
        ]);

        /** @var SignageResolver $resolver */
        $resolver = app(SignageResolver::class);
        $scheduled = $resolver->resolveFresh('default', Carbon::now(), null, 'v-emg-1');
        $this->assertSame('emergency:closed', $scheduled['mode']);
        $this->assertSame('Scheduled closed', $scheduled['slides'][0]['elements'][0]['text'] ?? null);

        SiteSetting::set('signage_emergency', 'maintenance');
        $manual = $resolver->resolveFresh('default', Carbon::now(), null, 'v-emg-2');
        $this->assertSame('emergency:maintenance', $manual['mode']);
        $this->assertSame('Under maintenance', $manual['slides'][0]['elements'][0]['text'] ?? null);
    }

    public function test_scheduled_emergency_respects_schedule_window(): void
    {
        SiteSetting::set('signage_emergency', 'none');
        SiteSetting::set('signage_emergency_entries', [
            'entries' => [[
                'id' => 'night-only',
                'mode' => 'kitchen_closed',
                'priority' => 50,
                'is_active' => true,
                'layout' => 'notice',
                'title' => 'Kitchen closed tonight',
                'body' => 'Ask staff',
                'schedule' => [
                    'windows' => [['start' => '22:00', 'end' => '02:00']],
                ],
            ]],
        ]);

        /** @var SignageResolver $resolver */
        $resolver = app(SignageResolver::class);
        $inside = $resolver->resolveFresh(
            'default',
            Carbon::parse('2026-08-03 23:00:00', 'Indian/Maldives'),
            null,
            'v-emg-3'
        );
        $this->assertSame('emergency:kitchen_closed', $inside['mode']);

        $outside = $resolver->resolveFresh(
            'default',
            Carbon::parse('2026-08-03 14:00:00', 'Indian/Maldives'),
            null,
            'v-emg-4'
        );
        $this->assertStringNotContainsString('emergency', $outside['mode']);
    }

    public function test_banner_schedule_fields_round_trip(): void
    {
        $owner = User::create([
            'name' => 'Owner Banner Schedule',
            'email' => 'owner-banner-sched@test.com',
            'password' => Hash::make('password'),
            'role_id' => Role::where('slug', 'owner')->value('id'),
            'is_active' => true,
        ]);
        Sanctum::actingAs($owner, ['staff']);

        $this->putJson('/api/admin/signage/banner', [
            'enabled' => true,
            'show_logo_between' => true,
            'banners' => [[
                'id' => 'weekend',
                'label' => 'Weekend',
                'enabled' => true,
                'position' => 'bottom',
                'fields' => ['date', 'time'],
                'speed_seconds' => 40,
                'repeat_count' => 3,
                'direction' => 'rtl',
                'scroll_mode' => 'ticker',
                'schedule' => [
                    'days' => [0, 6],
                    'windows' => [['start' => '10:00', 'end' => '14:00']],
                ],
            ]],
        ])->assertOk()
            ->assertJsonPath('banner.show_logo_between', true)
            ->assertJsonPath('banner.banners.0.repeat_count', 3)
            ->assertJsonPath('banner.banners.0.direction', 'rtl')
            ->assertJsonPath('banner.banners.0.schedule.days', [0, 6]);

        /** @var SignageResolver $resolver */
        $resolver = app(SignageResolver::class);
        $cfg = $resolver->resolveFresh('default', Carbon::now(), null, 'v-banner-sched');
        $this->assertTrue($cfg['banner']['show_logo_between']);
        $this->assertSame(3, $cfg['banner']['banners'][0]['repeat_count']);
        $this->assertSame('rtl', $cfg['banner']['banners'][0]['direction']);
        $this->assertSame([0, 6], $cfg['banner']['banners'][0]['schedule']['days']);
    }

    public function test_emergency_entries_round_trip_via_admin(): void
    {
        $owner = User::create([
            'name' => 'Owner Emergency Entries',
            'email' => 'owner-emg-entries@test.com',
            'password' => Hash::make('password'),
            'role_id' => Role::where('slug', 'owner')->value('id'),
            'is_active' => true,
        ]);
        Sanctum::actingAs($owner, ['staff']);

        $this->putJson('/api/admin/signage/emergency', [
            'mode' => 'none',
            'entries' => [[
                'id' => 'holiday-1',
                'mode' => 'holiday',
                'priority' => 20,
                'is_active' => true,
                'layout' => 'split',
                'title' => 'Eid hours',
                'body' => 'Open 2–10 PM',
                'title_dv' => 'އީދު',
            ]],
        ])->assertOk()
            ->assertJsonPath('manual', 'none')
            ->assertJsonPath('entries.0.mode', 'holiday')
            ->assertJsonPath('entries.0.layout', 'split');

        $overview = $this->getJson('/api/admin/signage')->assertOk();
        $overview->assertJsonPath('emergency.entries.0.title', 'Eid hours');
    }
}

<?php

declare(strict_types=1);

namespace Tests\Feature\Signage;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\AuditLog;
use App\Models\Role;
use App\Models\SignageDevice;
use App\Models\SignageScreen;
use App\Models\User;
use App\Support\SpaBuild;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

final class SignageDeviceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'description' => '', 'is_active' => true]);
        Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'description' => '', 'is_active' => true]);
        PermissionCatalogSync::sync();
    }

    public function test_heartbeat_upserts_device_and_returns_pairing_code(): void
    {
        $res = $this->postJson('/api/signage/heartbeat', [
            'device_id' => 'tv-device-1',
            'screen' => 'default',
            'current_slide' => 'hero',
            'playlist_version' => 'v1',
            'resolution' => '1920x1080',
            'cache_status' => 'ok',
            'build_version' => '2.1',
        ]);

        $res->assertOk()
            ->assertJsonPath('device.device_id', 'tv-device-1')
            ->assertJsonPath('device.approved', false);

        $code = $res->json('device.pairing_code');
        $this->assertIsString($code);
        $this->assertSame(6, strlen($code));

        $this->assertDatabaseHas('signage_devices', [
            'device_id' => 'tv-device-1',
            'approved' => false,
        ]);

        $again = $this->postJson('/api/signage/heartbeat', [
            'device_id' => 'tv-device-1',
            'screen' => 'default',
        ]);
        $again->assertOk()->assertJsonPath('device.pairing_code', $code);
    }

    /**
     * Signage audit, 2026-09-23. The test above passes without a Referer,
     * which is not how a TV sends it. From the board page on the site's own
     * origin, Sanctum's stateful pipeline ran CSRF on the heartbeat and
     * answered 419 — so no TV ever paired and the Devices tab stayed empty.
     */
    public function test_heartbeat_from_the_board_page_is_not_refused_for_csrf(): void
    {
        // The CSRF middleware stands down entirely under APP_ENV=testing, so
        // a request sent as-is proves nothing. Pretend to be a live box for
        // this one request; without the bootstrap except-list entry this
        // answers 419.
        $this->app['env'] = 'local';
        try {
            $site = rtrim((string) config('app.url'), '/');
            $res = $this
                ->withHeader('Origin', $site)
                ->withHeader('Referer', $site . '/order/tv')
                ->postJson('/api/signage/heartbeat', [
                    'device_id' => 'tv-in-the-shop',
                    'screen' => 'default',
                ]);
        } finally {
            $this->app['env'] = 'testing';
        }

        $this->assertNotSame(419, $res->status(), (string) $res->getContent());
        $res->assertOk()->assertJsonPath('device.device_id', 'tv-in-the-shop');
    }

    public function test_heartbeat_tells_the_board_which_build_the_server_is_serving(): void
    {
        SpaBuild::fake('order', 'abc123def456');
        try {
            $this->postJson('/api/signage/heartbeat', ['device_id' => 'tv-build'])
                ->assertOk()
                ->assertJsonPath('server_build', 'abc123def456');
        } finally {
            SpaBuild::clearFake();
        }

        // An unbuilt checkout has no stamp; the board then never reloads.
        SpaBuild::fake('order', null);
        try {
            $this->postJson('/api/signage/heartbeat', ['device_id' => 'tv-build'])
                ->assertOk()
                ->assertJsonPath('server_build', null);
        } finally {
            SpaBuild::clearFake();
        }
    }

    public function test_the_build_stamp_is_read_from_the_built_index_html(): void
    {
        $dir = sys_get_temp_dir() . '/spa-build-' . uniqid();
        mkdir($dir);
        file_put_contents($dir . '/index.html', "<!doctype html><html><head>\n<meta name=\"app-build\" content=\"0F1E2D3C4B5A\" />\n</head></html>");
        file_put_contents($dir . '/dev.html', '<meta name="app-build" content="__SW_BUILD_ID__" />');

        try {
            $this->assertSame('0f1e2d3c4b5a', SpaBuild::read($dir . '/index.html'));
            $this->assertNull(SpaBuild::read($dir . '/dev.html'), 'an unreplaced placeholder is not a build');
            $this->assertNull(SpaBuild::read($dir . '/missing.html'));
        } finally {
            @unlink($dir . '/index.html');
            @unlink($dir . '/dev.html');
            @rmdir($dir);
        }
    }

    public function test_heartbeat_records_whether_the_screen_is_asleep(): void
    {
        $this->postJson('/api/signage/heartbeat', ['device_id' => 'tv-night', 'mode' => 'asleep'])->assertOk();
        $this->assertSame('asleep', SignageDevice::query()->where('device_id', 'tv-night')->firstOrFail()->meta['mode']);
    }

    public function test_approve_assigns_screen_and_is_audited(): void
    {
        $screen = SignageScreen::query()->where('slug', 'default')->firstOrFail();
        $device = SignageDevice::create([
            'device_id' => 'tv-pending',
            'pairing_code' => 'ABC123',
            'approved' => false,
            'last_seen_at' => now(),
        ]);

        $owner = User::create([
            'name' => 'Owner Devices',
            'email' => 'owner-devices@test.com',
            'password' => Hash::make('password'),
            'role_id' => Role::where('slug', 'owner')->value('id'),
            'is_active' => true,
        ]);
        Sanctum::actingAs($owner, ['staff']);

        $this->postJson("/api/admin/signage/devices/{$device->id}/approve", [
            'screen_id' => $screen->id,
        ])->assertOk()
            ->assertJsonPath('data.approved', true)
            ->assertJsonPath('data.screen_id', $screen->id)
            ->assertJsonPath('data.pairing_code', null);

        $this->assertTrue(AuditLog::query()->where('action', 'signage.device.approve')->exists());
    }

    public function test_queued_command_is_consumed_on_next_heartbeat(): void
    {
        $device = SignageDevice::create([
            'device_id' => 'tv-cmd',
            'approved' => true,
            'screen_id' => SignageScreen::query()->value('id'),
            'last_seen_at' => now(),
            'queued_command' => [
                'type' => 'pause',
                'payload' => [],
                'queued_at' => now()->toIso8601String(),
            ],
        ]);

        $res = $this->postJson('/api/signage/heartbeat', [
            'device_id' => 'tv-cmd',
            'screen' => 'default',
        ]);

        $res->assertOk()->assertJsonPath('command.type', 'pause');
        $this->assertNull($device->fresh()->queued_command);
    }

    public function test_health_marks_online_offline_by_last_seen(): void
    {
        $screenId = SignageScreen::query()->value('id');
        SignageDevice::create([
            'device_id' => 'online-tv',
            'approved' => true,
            'screen_id' => $screenId,
            'last_seen_at' => now(),
        ]);
        SignageDevice::create([
            'device_id' => 'offline-tv',
            'approved' => true,
            'screen_id' => $screenId,
            'last_seen_at' => now()->subMinutes(10),
        ]);

        $owner = User::create([
            'name' => 'Owner Health',
            'email' => 'owner-health@test.com',
            'password' => Hash::make('password'),
            'role_id' => Role::where('slug', 'owner')->value('id'),
            'is_active' => true,
        ]);
        Sanctum::actingAs($owner, ['staff']);

        $res = $this->getJson('/api/admin/signage/devices')->assertOk();
        $byId = collect($res->json('data'))->keyBy('device_id');
        $this->assertTrue($byId['online-tv']['online']);
        $this->assertFalse($byId['offline-tv']['online']);
    }

    public function test_device_admin_routes_are_permission_gated(): void
    {
        $device = SignageDevice::create([
            'device_id' => 'gated',
            'approved' => false,
            'pairing_code' => 'ZZZZZZ',
        ]);

        $this->getJson('/api/admin/signage/devices')->assertUnauthorized();

        $staff = User::create([
            'name' => 'Staff Devices',
            'email' => 'staff-devices@test.com',
            'password' => Hash::make('password'),
            'role_id' => Role::where('slug', 'staff')->value('id'),
            'is_active' => true,
        ]);
        Sanctum::actingAs($staff, ['staff']);
        $this->getJson('/api/admin/signage/devices')->assertForbidden();
        $this->postJson("/api/admin/signage/devices/{$device->id}/command", [
            'command' => 'refresh',
        ])->assertForbidden();
    }

    public function test_owner_can_queue_remote_command(): void
    {
        $device = SignageDevice::create([
            'device_id' => 'cmd-owner',
            'approved' => true,
            'screen_id' => SignageScreen::query()->value('id'),
            'last_seen_at' => now(),
        ]);

        $owner = User::create([
            'name' => 'Owner Cmd',
            'email' => 'owner-cmd@test.com',
            'password' => Hash::make('password'),
            'role_id' => Role::where('slug', 'owner')->value('id'),
            'is_active' => true,
        ]);
        Sanctum::actingAs($owner, ['staff']);

        $this->postJson("/api/admin/signage/devices/{$device->id}/command", [
            'command' => 'black_screen',
        ])->assertOk()->assertJsonPath('data.queued_command.type', 'black_screen');

        $this->assertTrue(AuditLog::query()->where('action', 'signage.device.command')->exists());
    }

    public function test_fullscreen_command_is_accepted(): void
    {
        $device = SignageDevice::create([
            'device_id' => 'tv-fs',
            'approved' => true,
            'screen_id' => SignageScreen::query()->value('id'),
            'last_seen_at' => now(),
        ]);

        $owner = User::create([
            'name' => 'Owner Fs',
            'email' => 'owner-fs@test.com',
            'password' => Hash::make('password'),
            'role_id' => Role::where('slug', 'owner')->value('id'),
            'is_active' => true,
        ]);
        Sanctum::actingAs($owner, ['staff']);

        $this->postJson("/api/admin/signage/devices/{$device->id}/command", [
            'command' => 'fullscreen',
        ])->assertOk()->assertJsonPath('data.queued_command.type', 'fullscreen');
    }
}

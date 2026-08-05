<?php

declare(strict_types=1);

namespace Tests\Feature\Signage;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\AuditLog;
use App\Models\Role;
use App\Models\SignageDevice;
use App\Models\SignageScreen;
use App\Models\User;
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

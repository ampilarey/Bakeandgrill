<?php

declare(strict_types=1);

namespace Tests\Feature\Signage;

use App\Domains\Notifications\Services\SmsService;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Domains\Signage\Services\SignageDeviceHealth;
use App\Models\Role;
use App\Models\SignageDevice;
use App\Models\SignageScreen;
use App\Models\SiteSetting;
use App\Models\SmsLog;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Owner's shortlist, 2026-09-23: "you'll know when a screen is wrong
 * before a customer does" — a thumbnail per TV, and one alert when a TV
 * goes quiet or sticks on a slide.
 */
final class SignageDeviceAlertsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'description' => '', 'is_active' => true]);
        PermissionCatalogSync::sync();
        Carbon::setTestNow('2026-09-23 12:00:00');
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    /** A tiny valid JPEG (magic bytes + padding) as the board would send it. */
    private function jpegDataUri(): string
    {
        $bytes = "\xFF\xD8\xFF\xE0" . str_repeat("\x00", 200) . "\xFF\xD9";

        return 'data:image/jpeg;base64,' . base64_encode($bytes);
    }

    private function device(string $id = 'tv-1', array $meta = []): SignageDevice
    {
        return SignageDevice::create([
            'device_id' => $id,
            'approved' => true,
            'screen_id' => SignageScreen::query()->value('id'),
            'last_seen_at' => now(),
            'meta' => $meta,
        ]);
    }

    public function test_heartbeat_keeps_the_thumbnail_and_tells_the_devices_tab_where_it_is(): void
    {
        Storage::fake('public');
        $this->postJson('/api/signage/heartbeat', ['device_id' => 'tv-shot', 'screenshot' => $this->jpegDataUri()])->assertOk();
        $device = SignageDevice::query()->where('device_id', 'tv-shot')->firstOrFail();
        $device->update(['approved' => true]);

        Storage::disk('public')->assertExists(SignageDeviceHealth::screenshotPath($device));
        $this->assertNotEmpty($device->meta['screenshot_at']);

        Sanctum::actingAs($this->owner(), ['staff']);
        $url = $this->getJson('/api/admin/signage/devices')->assertOk()->json('data.0.screenshot_url');
        $this->assertStringContainsString('signage/devices/' . $device->id . '.jpg', $url);

        // Junk is ignored, and the previous thumbnail's time survives.
        $this->postJson('/api/signage/heartbeat', ['device_id' => 'tv-shot', 'screenshot' => 'data:image/png;base64,AAAA'])->assertOk();
        $this->assertSame($device->meta['screenshot_at'], $device->fresh()->meta['screenshot_at']);
    }

    public function test_heartbeat_records_when_the_slide_last_changed(): void
    {
        $this->postJson('/api/signage/heartbeat', ['device_id' => 'tv-s', 'current_slide' => 'a', 'slide_count' => 5])->assertOk();
        $first = SignageDevice::query()->where('device_id', 'tv-s')->firstOrFail()->meta['slide_since'];

        Carbon::setTestNow('2026-09-23 12:03:00');
        $this->postJson('/api/signage/heartbeat', ['device_id' => 'tv-s', 'current_slide' => 'a', 'slide_count' => 5])->assertOk();
        $this->assertSame($first, SignageDevice::query()->where('device_id', 'tv-s')->firstOrFail()->meta['slide_since'], 'same slide: the clock keeps running');

        Carbon::setTestNow('2026-09-23 12:04:00');
        $this->postJson('/api/signage/heartbeat', ['device_id' => 'tv-s', 'current_slide' => 'b', 'slide_count' => 5])->assertOk();
        $this->assertNotSame($first, SignageDevice::query()->where('device_id', 'tv-s')->firstOrFail()->meta['slide_since'], 'new slide: the clock restarts');
    }

    public function test_stuck_means_awake_unpaused_more_than_one_slide_and_ten_minutes_on_it(): void
    {
        $now = Carbon::parse('2026-09-23 12:00:00');
        $since = $now->copy()->subMinutes(12)->toIso8601String();
        $stuck = $this->device('tv-a', ['current_slide' => 'x', 'slide_since' => $since, 'slide_count' => 4, 'mode' => 'awake']);
        $this->assertSame(12, SignageDeviceHealth::stuckMinutes($stuck, $now));

        $this->assertNull(SignageDeviceHealth::stuckMinutes($this->device('tv-b', ['slide_since' => $since, 'slide_count' => 4, 'paused' => true]), $now), 'paused is not stuck');
        $this->assertNull(SignageDeviceHealth::stuckMinutes($this->device('tv-c', ['slide_since' => $since, 'slide_count' => 4, 'mode' => 'asleep']), $now), 'asleep is not stuck');
        $this->assertNull(SignageDeviceHealth::stuckMinutes($this->device('tv-d', ['slide_since' => $since, 'slide_count' => 1]), $now), 'one slide cannot be stuck');
        $this->assertNull(SignageDeviceHealth::stuckMinutes($this->device('tv-e', ['slide_since' => $now->copy()->subMinutes(3)->toIso8601String(), 'slide_count' => 4]), $now), 'three minutes is a long slide, not stuck');
    }

    public function test_the_check_alerts_once_and_clears_when_the_tv_is_back(): void
    {
        SiteSetting::set('business_phone', '+9607771234');
        SiteSetting::bust();
        $quiet = $this->device('tv-quiet');
        $quiet->forceFill(['last_seen_at' => now()->subMinutes(7)])->save();
        $stuck = $this->device('tv-stuck', ['current_slide' => 'hero', 'slide_since' => now()->subMinutes(15)->toIso8601String(), 'slide_count' => 6]);
        $fine = $this->device('tv-fine', ['slide_since' => now()->toIso8601String(), 'slide_count' => 6]);

        $sms = $this->createMock(SmsService::class);
        $sent = [];
        $sms->expects($this->once())->method('send')->willReturnCallback(function ($msg) use (&$sent) {
            $sent[] = $msg->message;

            return new SmsLog(['message' => $msg->message, 'to' => $msg->to, 'type' => 'system', 'status' => 'sent']);
        });
        $this->app->instance(SmsService::class, $sms);

        $this->artisan('signage:check-devices')->assertSuccessful();
        $this->assertCount(1, $sent);
        $this->assertStringContainsString('offline for 7 min', $sent[0]);
        $this->assertStringContainsString('same slide (hero) for 15 min', $sent[0]);
        $this->assertNotEmpty($quiet->fresh()->meta['alerted_offline_at']);
        $this->assertNotEmpty($stuck->fresh()->meta['alerted_stuck_at']);

        // Five minutes on, still broken: no second SMS (the mock's once() holds).
        // The healthy TV keeps beating, so it does not "go offline" with the clock.
        Carbon::setTestNow('2026-09-23 12:05:00');
        $fine->forceFill(['last_seen_at' => now()])->save();
        $stuck->forceFill(['last_seen_at' => now()])->save(); // stuck, but beating
        $this->artisan('signage:check-devices')->assertSuccessful();

        // Back: flags clear, so the next failure alerts again.
        $fine->forceFill(['last_seen_at' => now()])->save();
        $quiet->forceFill(['last_seen_at' => now()])->save();
        $stuck->forceFill(['last_seen_at' => now()])->save();
        $stuck->forceFill(['meta' => array_merge($stuck->fresh()->meta, ['slide_since' => now()->toIso8601String()])])->save();
        $this->artisan('signage:check-devices')->assertSuccessful();
        $this->assertArrayNotHasKey('alerted_offline_at', $quiet->fresh()->meta);
        $this->assertArrayNotHasKey('alerted_stuck_at', $stuck->fresh()->meta);
    }

    public function test_the_sms_can_be_switched_off_and_the_devices_tab_sees_the_setting(): void
    {
        SiteSetting::set('business_phone', '+9607771234');
        SiteSetting::set('signage_device_alert_sms', '0');
        SiteSetting::bust();
        $this->device('tv-quiet')->forceFill(['last_seen_at' => now()->subMinutes(9)])->save();

        $sms = $this->createMock(SmsService::class);
        $sms->expects($this->never())->method('send');
        $this->app->instance(SmsService::class, $sms);
        $this->artisan('signage:check-devices')->assertSuccessful();

        Sanctum::actingAs($this->owner(), ['staff']);
        $this->getJson('/api/admin/signage')->assertOk()->assertJsonPath('settings.device_alert_sms', false);
        $this->putJson('/api/admin/signage/settings', ['device_alert_sms' => true])->assertOk()->assertJsonPath('settings.device_alert_sms', true);
        $this->getJson('/api/admin/signage/devices')->assertOk()->assertJsonPath('data.0.offline_minutes', 9);
    }

    private function owner(): User
    {
        return User::create([
            'name' => 'Owner',
            'email' => 'owner-alerts@test.com',
            'password' => Hash::make('password'),
            'role_id' => Role::where('slug', 'owner')->value('id'),
            'is_active' => true,
        ]);
    }
}

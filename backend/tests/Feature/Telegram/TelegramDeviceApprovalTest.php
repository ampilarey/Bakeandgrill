<?php

declare(strict_types=1);

namespace Tests\Feature\Telegram;

use App\Domains\Notifications\Contracts\SmsProviderInterface;
use App\Domains\Notifications\Support\SmsDeliveryRules;
use App\Models\AuditLog;
use App\Models\Device;
use App\Models\SiteSetting;
use App\Models\SmsLog;
use App\Services\DeviceApprovalAlert;
use App\Support\DeferAfterResponse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery;
use Tests\TestCase;

/**
 * A new till waiting for approval arrives on Telegram with Approve and
 * Reject (owner, 2026-10-07: "No button for approval?"), and is listed
 * under ✅ Approvals. The same change and audit as Admin → Devices.
 */
class TelegramDeviceApprovalTest extends TestCase
{
    use FakesTelegram;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->roles();
        $this->fakeTelegram();
        $provider = Mockery::mock(SmsProviderInterface::class);
        $provider->shouldReceive('send')->andReturn([true, ['ok' => true], null]);
        $this->app->instance(SmsProviderInterface::class, $provider);
        SiteSetting::set('business_phone', '+960 330 1234');
        SiteSetting::bust();
    }

    private function pendingTill(): Device
    {
        return Device::create([
            'name' => 'POS front 2',
            'identifier' => 'POS-ABC123',
            'type' => 'pos',
            'is_active' => false,
            'status' => 'pending',
        ]);
    }

    /** @return array<string, mixed> */
    private function lastEdit(): array
    {
        return collect($this->telegramCalls)->where('method', 'editMessageText')->last()['params'] ?? [];
    }

    public function test_the_alert_arrives_with_approve_and_reject_and_approve_unlocks_the_till(): void
    {
        $owner = $this->staff('owner', '+9607820288', 'Ahmed');
        $cashier = $this->staff('staff', '+9607001001', 'Mariyam');
        $bot = $this->bot();
        $this->link($bot, $owner, '5550001');
        $device = $this->pendingTill();
        $device->forceFill(['last_user_id' => $cashier->id])->save();

        DeviceApprovalAlert::send($device, $cashier);
        DeferAfterResponse::flushTestingCallbacks();

        $card = collect($this->sent('5550001'))->last();
        $this->assertStringContainsString('New till waiting for approval', $card['text']);
        $this->assertStringContainsString('POS front 2', $card['text']);
        $this->assertStringContainsString('POS-ABC123', $card['text']);
        $this->assertStringContainsString('Signed in on it: Mariyam', $card['text']);
        $this->assertSame(['dv:' . $device->id, 'dx:' . $device->id], array_column($card['reply_markup']['inline_keyboard'][0], 'callback_data'));

        $this->telegramButton($bot, '5550001', 'dv:' . $device->id)->assertOk();

        $device->refresh();
        $this->assertSame('approved', $device->status);
        $this->assertTrue($device->is_active);
        $audit = AuditLog::query()->where('action', 'device.approved')->latest('id')->first();
        $this->assertNotNull($audit);
        $this->assertSame($owner->id, (int) $audit->user_id);
        $this->assertStringContainsString('Approved', $this->lastEdit()['text']);
    }

    public function test_reject_asks_first_and_back_leaves_it_pending(): void
    {
        $owner = $this->staff('owner', '+9607820288');
        $bot = $this->bot();
        $this->link($bot, $owner, '5550001');
        $device = $this->pendingTill();

        $this->telegramButton($bot, '5550001', 'dx:' . $device->id)->assertOk();
        $this->assertSame('pending', $device->fresh()->status);
        $edit = $this->lastEdit();
        $this->assertStringContainsString('Reject this till?', $edit['text']);
        $this->assertSame(['dy:' . $device->id, 'dc:' . $device->id], array_column($edit['reply_markup']['inline_keyboard'][0], 'callback_data'));

        $this->telegramButton($bot, '5550001', 'dc:' . $device->id)->assertOk();
        $this->assertSame('pending', $device->fresh()->status);
        $this->assertSame(['dv:' . $device->id, 'dx:' . $device->id], array_column($this->lastEdit()['reply_markup']['inline_keyboard'][0], 'callback_data'));

        $this->telegramButton($bot, '5550001', 'dy:' . $device->id)->assertOk();
        $this->assertSame('rejected', $device->fresh()->status);
        $this->assertFalse($device->fresh()->is_active);
        $this->assertTrue(AuditLog::query()->where('action', 'device.rejected')->exists());
    }

    public function test_a_second_tap_after_another_owner_decided_changes_nothing(): void
    {
        $owner = $this->staff('owner', '+9607820288');
        $bot = $this->bot();
        $this->link($bot, $owner, '5550001');
        $device = $this->pendingTill();
        $device->update(['status' => 'approved', 'is_active' => true]);

        $this->telegramButton($bot, '5550001', 'dy:' . $device->id)->assertOk();

        $this->assertSame('approved', $device->fresh()->status);
        $this->assertStringContainsString('Already approved', $this->lastEdit()['text']);
    }

    public function test_someone_without_device_approval_cannot_approve(): void
    {
        $manager = $this->staff('manager', '+9607001002');
        $bot = $this->bot();
        $this->link($bot, $manager, '5550002');
        $device = $this->pendingTill();

        $this->telegramButton($bot, '5550002', 'dv:' . $device->id)->assertOk();

        $this->assertSame('pending', $device->fresh()->status);
    }

    public function test_approvals_lists_tills_waiting(): void
    {
        $owner = $this->staff('owner', '+9607820288');
        $bot = $this->bot();
        $this->link($bot, $owner, '5550001');
        $device = $this->pendingTill();

        $this->telegramText($bot, '5550001', '/approvals')->assertOk();

        $sent = $this->sent('5550001');
        $this->assertStringContainsString('Waiting for approval</b> (1)', $sent[count($sent) - 2]['text']);
        $card = end($sent);
        $this->assertStringContainsString('POS front 2', $card['text']);
        $this->assertSame(['dv:' . $device->id, 'dx:' . $device->id], array_column($card['reply_markup']['inline_keyboard'][0], 'callback_data'));
    }

    /*
     * Owner, 2026-10-07: "Notifications didn't come to telegram", for a till
     * deleted in Admin and used again. The 6-hour limit was keyed by the
     * till's identifier, which survives a delete.
     */
    public function test_a_deleted_till_used_again_alerts_again(): void
    {
        $owner = $this->staff('owner', '+9607820288');
        $this->link($this->bot(), $owner, '5550001');

        $first = $this->pendingTill();
        DeviceApprovalAlert::send($first, null);
        DeferAfterResponse::flushTestingCallbacks();
        $this->assertCount(1, $this->sent('5550001'));

        $first->delete();
        $again = $this->pendingTill();
        DeviceApprovalAlert::send($again, null);
        DeferAfterResponse::flushTestingCallbacks();

        $this->assertCount(2, $this->sent('5550001'));
        $this->assertSame('dv:' . $again->id, collect($this->sent('5550001'))->last()['reply_markup']['inline_keyboard'][0][0]['callback_data']);

        // The same row is still limited, so a till retrying does not spam.
        DeviceApprovalAlert::send($again, null);
        DeferAfterResponse::flushTestingCallbacks();
        $this->assertCount(2, $this->sent('5550001'));
    }

    public function test_quiet_hours_holding_owner_alerts_does_not_hold_a_till_waiting(): void
    {
        SiteSetting::set(SmsDeliveryRules::QUIET_ENABLED, '1');
        SiteSetting::set(SmsDeliveryRules::QUIET_START, '00:00');
        SiteSetting::set(SmsDeliveryRules::QUIET_END, '23:59');
        SiteSetting::set(SmsDeliveryRules::QUIET_ALERTS, '1');
        SiteSetting::bust();
        $owner = $this->staff('owner', '+9607820288');
        $this->link($this->bot(), $owner, '5550001');

        DeviceApprovalAlert::send($this->pendingTill(), null);
        DeferAfterResponse::flushTestingCallbacks();

        $this->assertStringContainsString('New till waiting for approval', $this->lastText('5550001'));
        $this->assertSame('sent', SmsLog::query()->where('type', 'owner_device_approval')->latest('id')->value('status'));

        // Other owner alerts are still held.
        $log = app(\App\Domains\Notifications\Services\SmsService::class)->send(new \App\Domains\Notifications\DTOs\SmsMessage(to: '7820288', message: 'Shift left open.', type: 'owner_shift_left_open'));
        $this->assertSame('deferred', $log->status);
    }
}

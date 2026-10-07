<?php

declare(strict_types=1);

namespace Tests\Feature\Telegram;

use App\Domains\Notifications\Contracts\SmsProviderInterface;
use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Shifts\DTOs\ShiftClosedData;
use App\Domains\Shifts\Events\ShiftClosed;
use App\Models\Device;
use App\Models\Shift;
use App\Models\SiteSetting;
use App\Support\DeferAfterResponse;
use App\Support\OwnerPhones;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery;
use Tests\TestCase;

/**
 * The manager level (owner, 2026-10-07: "Do it"): what a linked manager
 * gets follows their permissions: the day report with reports.view, the
 * shop-phone alerts they can act on, a help that lists only their buttons.
 */
class TelegramManagerTest extends TestCase
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
    }

    private function closeTheDay(): void
    {
        $device = Device::create(['name' => 'Till', 'identifier' => 'TG-MGR', 'type' => 'pos', 'is_active' => true, 'status' => 'approved']);
        $cashier = $this->staff('staff', '+9607001001', 'Mariyam');
        $shift = Shift::create(['user_id' => $cashier->id, 'device_id' => $device->id, 'opened_at' => now()->subHours(8), 'opening_cash' => 0, 'closed_at' => now(), 'variance' => 0]);
        event(new ShiftClosed(new ShiftClosedData($shift->id, (int) $cashier->id, 'x', 0, 0, 0, 0, 0)));
        DeferAfterResponse::flushTestingCallbacks();
    }

    public function test_a_manager_who_sees_reports_gets_the_day_report(): void
    {
        $bot = $this->bot();
        $this->link($bot, $this->staff('manager', '+9607001002', 'Ariya'), '5550002');
        $blind = $this->staff('manager', '+9607001004', 'Hamid');
        $blind->revokePermission('reports.view');
        $this->link($bot, $blind, '5550004');
        $this->link($bot, $this->staff('staff', '+9607001005', 'Ali'), '5550005');

        $this->closeTheDay();

        $this->assertStringContainsString('Day closed', $this->lastText('5550002'));
        $this->assertSame([], $this->sent('5550004'), 'no reports.view, no report');
        $this->assertSame([], $this->sent('5550005'), 'cashiers never get it');
    }

    public function test_a_manager_who_approves_tills_gets_the_new_till_alert(): void
    {
        SiteSetting::set('business_phone', '+960 912 0011');
        SiteSetting::bust();
        $bot = $this->bot();
        $approver = $this->staff('manager', '+9607001002', 'Ariya');
        $approver->grantPermission('devices.approve');
        $this->link($bot, $approver, '5550002');
        $this->link($bot, $this->staff('manager', '+9607001004', 'Hamid'), '5550004');

        foreach (OwnerPhones::for('owner_device_approval') as $to) {
            app(SmsService::class)->send(new SmsMessage(to: $to, message: 'New POS device "Front till" is waiting for approval.', type: 'owner_device_approval', idempotencyKey: 'mgr:' . $to));
        }
        DeferAfterResponse::flushTestingCallbacks();

        $this->assertStringContainsString('Front till', $this->lastText('5550002'));
        $this->assertSame([], $this->sent('5550004'), 'cannot approve tills: no alert');
    }

    public function test_a_managers_help_lists_only_what_they_can_do(): void
    {
        $bot = $this->bot();
        $manager = $this->staff('manager', '+9607001002', 'Ariya');
        $manager->revokePermission('promotions.discount_override');
        $this->link($bot, $manager, '5550002');

        $this->telegramText($bot, '5550002', '/help')->assertOk();

        $help = $this->lastText('5550002');
        $this->assertStringContainsString('day\'s report arrives here', $help);
        $this->assertStringNotContainsString('Discount requests', $help);
        $this->assertStringNotContainsString('Complaints', $help, 'complaints stay with the owner');
    }
}

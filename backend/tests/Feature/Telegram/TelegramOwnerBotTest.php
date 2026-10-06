<?php

declare(strict_types=1);

namespace Tests\Feature\Telegram;

use App\Domains\Notifications\Contracts\SmsProviderInterface;
use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Telegram\Services\TelegramAlertCopier;
use App\Models\AuditLog;
use App\Models\Device;
use App\Models\Item;
use App\Models\Order;
use App\Models\Refund;
use App\Models\Shift;
use App\Models\SiteSetting;
use App\Models\SmsLog;
use App\Support\DeferAfterResponse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery;
use Tests\TestCase;

/**
 * The owner level of the staff bot (owner, 2026-10-06): alerts arrive on
 * Telegram, and Today, Shifts, Open orders and Sold out answer from the
 * same figures Admin shows. Each command checks the person's permissions.
 */
class TelegramOwnerBotTest extends TestCase
{
    use FakesTelegram;
    use RefreshDatabase;

    /** @var list<string> */
    private array $smsSentTo = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->roles();
        $this->fakeTelegram();

        $provider = Mockery::mock(SmsProviderInterface::class);
        $provider->shouldReceive('send')->andReturnUsing(function (string $to) {
            $this->smsSentTo[] = $to;

            return [true, ['ok' => true], null];
        });
        $this->app->instance(SmsProviderInterface::class, $provider);
    }

    private function alert(string $to, string $type, string $message): SmsLog
    {
        $log = app(SmsService::class)->send(new SmsMessage(to: $to, message: $message, type: $type));
        DeferAfterResponse::flushTestingCallbacks();

        return $log;
    }

    // ── Alerts ───────────────────────────────────────────────────────────

    public function test_an_owner_alert_also_arrives_on_the_owners_telegram(): void
    {
        $owner = $this->staff('owner', '+9607820288');
        $bot = $this->bot();
        $this->link($bot, $owner, '5550001');

        $log = $this->alert('7820288', 'owner_shift_left_open', 'Shift #4 has been open for 14 hours. Close it in the POS.');

        $this->assertSame('sent', $log->status);
        $this->assertSame(['+9607820288'], $this->smsSentTo);
        $text = $this->lastText('5550001');
        $this->assertStringContainsString('<b>Shift left open</b>', $text);
        $this->assertStringContainsString('Shift #4 has been open for 14 hours', $text);
    }

    public function test_instead_of_sms_sends_telegram_only_and_falls_back_to_sms_when_telegram_is_down(): void
    {
        SiteSetting::set(TelegramAlertCopier::SETTING_INSTEAD_OF_SMS, '1');
        $owner = $this->staff('owner', '+9607820288');
        $bot = $this->bot();
        $this->link($bot, $owner, '5550001');

        $log = $this->alert('7820288', 'owner_complaint_received', 'New complaint on order 1042.');
        $this->assertSame('suppressed', $log->status);
        $this->assertSame('Sent on Telegram instead of SMS.', $log->error_message);
        $this->assertSame(0.0, (float) $log->cost_estimate_mvr);
        $this->assertSame([], $this->smsSentTo);
        $this->assertCount(1, $this->sent('5550001'));

        $this->telegramDown = true;
        $log = $this->alert('7820288', 'owner_complaint_received', 'New complaint on order 1043.');
        $this->assertSame('sent', $log->status);
        $this->assertSame(['+9607820288'], $this->smsSentTo, 'nothing is lost when Telegram cannot be reached');
    }

    public function test_an_alert_still_reaches_telegram_when_its_sms_is_switched_off(): void
    {
        SiteSetting::set('sms_owner_ops_alert_enabled', false);
        $owner = $this->staff('owner', '+9607820288');
        $this->link($this->bot(), $owner, '5550001');

        $log = $this->alert('7820288', 'owner_ops_alert', 'Backup failed at 02:00.');

        $this->assertSame('disabled', $log->status);
        $this->assertSame([], $this->smsSentTo);
        $this->assertStringContainsString('Backup failed', $this->lastText('5550001'));
    }

    public function test_customer_texts_never_go_to_a_staff_telegram(): void
    {
        $owner = $this->staff('owner', '+9607820288');
        $this->link($this->bot(), $owner, '5550001');

        $this->alert('7820288', 'customer_order_ready', 'Your order #A12 is ready to collect.');

        $this->assertSame([], $this->sent('5550001'));
    }

    public function test_a_discount_approval_code_reaches_the_approver_on_telegram(): void
    {
        $manager = $this->staff('manager', '+9607001002');
        $this->link($this->bot(), $manager, '5550002');

        $this->alert('7001002', 'discount_approval_otp', 'Bake & Grill: approval code 4821 for a 10% (5.00) discount on order 1042.');

        $this->assertStringContainsString('approval code 4821', $this->lastText('5550002'));
    }

    public function test_nobody_linked_or_alerts_off_means_no_telegram(): void
    {
        $owner = $this->staff('owner', '+9607820288');
        $this->bot();
        $this->alert('7820288', 'owner_shift_left_open', 'Shift open.');
        $this->assertSame([], $this->sent());

        $this->link(\App\Models\TelegramBot::first(), $owner, '5550001');
        SiteSetting::set(TelegramAlertCopier::SETTING_ENABLED, '0');
        $this->alert('7820288', 'owner_shift_left_open', 'Shift open again.');
        $this->assertSame([], $this->sent('5550001'));
    }

    public function test_a_refund_alert_arrives_as_the_refund_with_its_buttons(): void
    {
        $owner = $this->staff('owner', '+9607820288');
        $cashier = $this->staff('staff', '+9607001001', 'Mariyam');
        $this->link($this->bot(), $owner, '5550001');
        $order = Order::factory()->paid()->create(['order_number' => 'BG-1042', 'total' => 80]);
        $refund = Refund::create(['order_id' => $order->id, 'user_id' => $cashier->id, 'amount' => 80, 'status' => 'pending', 'reason' => 'Cold food', 'drawer_cash_out_laar' => 0]);

        app(SmsService::class)->send(new SmsMessage(
            to: '7820288', message: 'Refund request on BG-1042 for MVR 80.00 needs approval.', type: 'staff_refund_requested',
            referenceType: 'refund', referenceId: (string) $refund->id,
        ));
        DeferAfterResponse::flushTestingCallbacks();

        $sent = $this->sent('5550001');
        $msg = end($sent);
        $this->assertStringContainsString('Refund waiting for approval', $msg['text']);
        $this->assertStringContainsString('#BG-1042', $msg['text']);
        $this->assertSame(['rfa:' . $refund->id, 'rfr:' . $refund->id], array_column($msg['reply_markup']['inline_keyboard'][0], 'callback_data'));
    }

    // ── Commands ─────────────────────────────────────────────────────────

    public function test_today_shows_the_days_sales(): void
    {
        $owner = $this->staff('owner', '+9607820288');
        $bot = $this->bot();
        $this->link($bot, $owner, '5550001');
        Order::factory()->paid()->create(['status' => 'paid', 'total' => 150, 'total_laar' => 15000, 'type' => 'takeaway']);
        Order::factory()->paid()->create(['status' => 'completed', 'total' => 50, 'total_laar' => 5000, 'type' => 'delivery']);

        $this->telegramText($bot, '5550001', '📊 Today')->assertOk();

        $text = $this->lastText('5550001');
        $this->assertStringContainsString('<b>Sales</b> MVR 200.00', $text);
        $this->assertStringContainsString('<b>Orders</b> 2', $text);
        $this->assertStringContainsString('Takeaway: 1', $text);
    }

    public function test_shifts_shows_who_is_on_and_the_drawer_cash(): void
    {
        $owner = $this->staff('owner', '+9607820288');
        $cashier = $this->staff('staff', '+9607001001', 'Mariyam');
        $bot = $this->bot();
        $this->link($bot, $owner, '5550001');
        $device = Device::create(['name' => 'Front till', 'identifier' => 'TG-POS', 'type' => 'pos', 'is_active' => true, 'status' => 'approved']);
        Shift::create(['user_id' => $cashier->id, 'device_id' => $device->id, 'opened_at' => now()->subHours(3), 'opening_cash' => 500]);

        $this->telegramText($bot, '5550001', '/shifts')->assertOk();

        $text = $this->lastText('5550001');
        $this->assertStringContainsString('<b>Mariyam</b> · Front till', $text);
        $this->assertStringContainsString('Should be in the drawer: MVR 500.00', $text);
    }

    public function test_a_cashier_cannot_see_sales_or_drawers(): void
    {
        $cashier = $this->staff('staff', '+9607001001');
        $bot = $this->bot();
        $this->link($bot, $cashier, '5550003');

        $keyboard = $this->sent('5550003')[0]['reply_markup']['keyboard'] ?? [];
        $labels = array_column(array_merge(...$keyboard), 'text');
        $this->assertNotContains('📊 Today', $labels);
        $this->assertNotContains('💵 Shifts', $labels);

        $this->telegramText($bot, '5550003', '/shifts')->assertOk();
        $this->assertSame('Your account does not have access to that.', $this->lastText('5550003'));
    }

    public function test_open_orders_lists_unfinished_orders_oldest_first(): void
    {
        $owner = $this->staff('owner', '+9607820288');
        $bot = $this->bot();
        $this->link($bot, $owner, '5550001');
        Order::factory()->create(['status' => 'ready', 'order_number' => 'BG-2001', 'total' => 80, 'created_at' => now()->subMinutes(30)]);
        Order::factory()->create(['status' => 'in_progress', 'order_number' => 'BG-2002', 'total' => 40, 'created_at' => now()->subMinutes(5)]);
        Order::factory()->create(['status' => 'completed', 'order_number' => 'BG-2003']);

        $this->telegramText($bot, '5550001', '🧾 Open orders')->assertOk();

        $text = $this->lastText('5550001');
        $this->assertStringContainsString('<b>Open orders</b> (2)', $text);
        $this->assertLessThan(strpos($text, 'BG-2002'), strpos($text, 'BG-2001'));
        $this->assertStringNotContainsString('BG-2003', $text);
    }

    public function test_sold_out_from_telegram_changes_the_menu_and_is_audited(): void
    {
        $owner = $this->staff('owner', '+9607820288');
        $bot = $this->bot();
        $this->link($bot, $owner, '5550001');
        $item = Item::factory()->create(['name' => 'Chicken Kottu', 'is_active' => true, 'is_available' => true]);

        $this->telegramText($bot, '5550001', 'sold out kottu')->assertOk();
        $last = $this->sent('5550001');
        $this->assertSame('sof:' . $item->id, end($last)['reply_markup']['inline_keyboard'][0][0]['callback_data']);

        $this->telegramButton($bot, '5550001', 'sof:' . $item->id)->assertOk();
        $this->assertFalse($item->fresh()->is_available);
        $audit = AuditLog::where('action', 'item.86')->firstOrFail();
        $this->assertSame($owner->id, $audit->user_id);
        $this->assertSame('telegram', $audit->meta['source'] ?? $audit->metadata['source'] ?? null);

        $this->telegramButton($bot, '5550001', 'son:' . $item->id)->assertOk();
        $this->assertTrue($item->fresh()->is_available);
    }

    public function test_a_button_pressed_by_someone_else_is_refused(): void
    {
        $owner = $this->staff('owner', '+9607820288');
        $bot = $this->bot();
        $this->link($bot, $owner, '5550001');
        $item = Item::factory()->create(['name' => 'Kottu', 'is_active' => true, 'is_available' => true]);

        $this->telegramButton($bot, '5550001', 'sof:' . $item->id, fromId: '6660001')->assertOk();

        $this->assertTrue($item->fresh()->is_available);
    }
}

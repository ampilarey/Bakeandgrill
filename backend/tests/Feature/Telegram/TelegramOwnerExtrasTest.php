<?php

declare(strict_types=1);

namespace Tests\Feature\Telegram;

use App\Domains\Notifications\Contracts\SmsProviderInterface;
use App\Domains\Shifts\DTOs\ShiftClosedData;
use App\Domains\Shifts\Events\ShiftClosed;
use App\Domains\Telegram\Listeners\SendDayReportOnLastShiftClose;
use App\Models\ComplaintBoxEntry;
use App\Models\Customer;
use App\Models\Device;
use App\Models\Order;
use App\Models\Refund;
use App\Models\ServiceState;
use App\Models\Shift;
use App\Models\SiteSetting;
use App\Models\User;
use App\Services\OpeningHoursService;
use App\Support\DeferAfterResponse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery;
use Tests\TestCase;

/**
 * Owner bot, step 2 (owner, 2026-10-07: "Up to u"): week and month, by
 * cashier, the day's report when the last shift closes, the shop's
 * switches, refunds owed, complaints with replies and customer lookup.
 */
class TelegramOwnerExtrasTest extends TestCase
{
    use FakesTelegram;
    use RefreshDatabase;

    private User $owner;

    /** @var list<array{to: string, message: string}> */
    private array $texts = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->roles();
        $this->fakeTelegram();
        $provider = Mockery::mock(SmsProviderInterface::class);
        $provider->shouldReceive('send')->andReturnUsing(function (string $to, string $message) {
            $this->texts[] = ['to' => $to, 'message' => $message];

            return [true, ['ok' => true], null];
        });
        $this->app->instance(SmsProviderInterface::class, $provider);
        $this->owner = $this->staff('owner', '+9607820288', 'Ahmed');
    }

    private function linked(): \App\Models\TelegramBot
    {
        $bot = $this->bot();
        $this->link($bot, $this->owner, '5550001');

        return $bot;
    }

    public function test_the_menu_has_the_new_buttons(): void
    {
        $bot = $this->linked();
        $this->telegramText($bot, '5550001', '/help')->assertOk();
        $sent = $this->sent('5550001');
        $labels = array_column(array_merge(...end($sent)['reply_markup']['keyboard']), 'text');
        foreach (['📈 Week', '👥 Cashiers', '🏪 Shop', '💸 Refunds owed', '💬 Complaints', '🔎 Customer'] as $b) {
            $this->assertContains($b, $labels);
        }
    }

    public function test_week_compares_with_the_same_days_last_week(): void
    {
        $this->travelTo(now()->startOfWeek()->addDays(2)->setTime(15, 0)); // a Wednesday
        $bot = $this->linked();
        Order::factory()->create(['status' => 'completed', 'total' => 300, 'total_laar' => 30000, 'created_at' => now()->subDay()]);
        Order::factory()->create(['status' => 'completed', 'total' => 100, 'total_laar' => 10000, 'created_at' => now()]);
        Order::factory()->create(['status' => 'completed', 'total' => 200, 'total_laar' => 20000, 'created_at' => now()->subWeek()]);

        $this->telegramText($bot, '5550001', '📈 Week')->assertOk();

        $text = $this->lastText('5550001');
        $this->assertStringContainsString('<b>Sales</b> MVR 400.00', $text);
        $this->assertStringContainsString('▲ 100% on the same days last week (MVR 200.00)', $text);
        $this->assertStringContainsString('<b>Best day</b>', $text);
        $this->assertStringContainsString('MVR 300.00', $text);
    }

    public function test_cashiers_shows_each_persons_sales_today(): void
    {
        $bot = $this->linked();
        $mariyam = $this->staff('staff', '+9607001001', 'Mariyam');
        $ali = $this->staff('staff', '+9607001002', 'Ali');
        Order::factory()->create(['status' => 'completed', 'total' => 150, 'total_laar' => 15000, 'user_id' => $mariyam->id, 'manual_discount_laar' => 500]);
        Order::factory()->create(['status' => 'completed', 'total' => 50, 'total_laar' => 5000, 'user_id' => $ali->id]);

        $this->telegramText($bot, '5550001', '/cashiers')->assertOk();

        $text = $this->lastText('5550001');
        $this->assertLessThan(strpos($text, 'Ali'), strpos($text, 'Mariyam'));
        $this->assertStringContainsString('MVR 150.00 · 1 order', $text);
        $this->assertStringContainsString('Discounts given MVR 5.00', $text);
    }

    public function test_the_days_report_arrives_when_the_last_shift_closes_once(): void
    {
        $this->linked();
        $cashier = $this->staff('staff', '+9607001001', 'Mariyam');
        $device = Device::create(['name' => 'Till', 'identifier' => 'TG-EOD', 'type' => 'pos', 'is_active' => true, 'status' => 'approved']);
        $open = Shift::create(['user_id' => $cashier->id, 'device_id' => $device->id, 'opened_at' => now()->subHours(8), 'opening_cash' => 500]);
        $other = Shift::create(['user_id' => $this->owner->id, 'device_id' => $device->id, 'opened_at' => now()->subHours(2), 'opening_cash' => 0]);
        $event = fn (Shift $s) => event(new ShiftClosed(new ShiftClosedData($s->id, (int) $s->user_id, 'x', 500, 487.5, -12.5, 3, 300)));

        $open->update(['closed_at' => now(), 'variance' => -12.5]);
        $event($open);
        DeferAfterResponse::flushTestingCallbacks();
        $this->assertCount(0, $this->sent('5550001'), 'another shift is still open: no report yet');

        $other->update(['closed_at' => now(), 'variance' => 0]);
        $event($other);
        DeferAfterResponse::flushTestingCallbacks();
        $text = $this->lastText('5550001');
        $this->assertStringContainsString('🌙 <b>Day closed</b>', $text);
        $this->assertStringContainsString('Mariyam', $text);
        $this->assertStringContainsString('drawer short MVR 12.50', $text);

        $event($other);
        DeferAfterResponse::flushTestingCallbacks();
        $this->assertCount(1, $this->sent('5550001'), 'once a day');
    }

    public function test_the_days_report_can_be_switched_off(): void
    {
        SiteSetting::set(SendDayReportOnLastShiftClose::SETTING, '0');
        $this->linked();
        $device = Device::create(['name' => 'Till', 'identifier' => 'TG-EOD2', 'type' => 'pos', 'is_active' => true, 'status' => 'approved']);
        $s = Shift::create(['user_id' => $this->owner->id, 'device_id' => $device->id, 'opened_at' => now()->subHour(), 'opening_cash' => 0, 'closed_at' => now()]);

        event(new ShiftClosed(new ShiftClosedData($s->id, $this->owner->id, 'x', 0, 0, 0, 0, 0)));
        DeferAfterResponse::flushTestingCallbacks();

        $this->assertCount(0, $this->sent('5550001'));
    }

    public function test_shop_pauses_and_resumes_online_orders_and_delivery(): void
    {
        $bot = $this->linked();
        $this->telegramText($bot, '5550001', '🏪 Shop')->assertOk();
        $this->assertStringContainsString('<b>Online orders</b> ✅ Taking orders', $this->lastText('5550001'));

        $this->telegramButton($bot, '5550001', 'sh:op')->assertOk();
        $this->assertSame('operational_pause', ServiceState::where('service_key', 'online_ordering')->value('status'));
        $this->assertSame('operational_pause', ServiceState::where('service_key', 'online_checkout')->value('status'));
        $edit = collect($this->telegramCalls)->where('method', 'editMessageText')->last();
        $this->assertStringContainsString('⏸ Paused by Ahmed', $edit['params']['text']);

        $this->telegramButton($bot, '5550001', 'sh:oo')->assertOk();
        $this->assertSame('available', ServiceState::where('service_key', 'online_ordering')->value('status'));

        $this->telegramButton($bot, '5550001', 'sh:dp')->assertOk();
        $this->assertSame('operational_pause', ServiceState::where('service_key', 'online_delivery')->value('status'));
        $this->assertSame('available', ServiceState::where('service_key', 'online_ordering')->value('status'));
    }

    public function test_closed_today_marks_the_day_and_stops_online_orders_and_open_undoes_it(): void
    {
        $bot = $this->linked();

        $this->telegramButton($bot, '5550001', 'sh:ct')->assertOk();
        $this->assertSame('Closed today', app(OpeningHoursService::class)->closures()[now()->toDateString()] ?? null);
        $this->assertSame('operational_pause', ServiceState::where('service_key', 'online_ordering')->value('status'));

        $this->telegramButton($bot, '5550001', 'sh:cm')->assertOk();
        $this->assertArrayHasKey(now()->addDay()->toDateString(), app(OpeningHoursService::class)->closures());

        $this->telegramButton($bot, '5550001', 'sh:ot')->assertOk();
        $this->assertArrayNotHasKey(now()->toDateString(), app(OpeningHoursService::class)->closures());
        $this->assertSame('available', ServiceState::where('service_key', 'online_ordering')->value('status'));
    }

    public function test_a_cashier_cannot_use_the_shop_switches(): void
    {
        $bot = $this->bot();
        $cashier = $this->staff('staff', '+9607001001');
        $this->link($bot, $cashier, '5550003');

        $this->telegramButton($bot, '5550003', 'sh:op')->assertOk();
        $this->assertNull(ServiceState::where('service_key', 'online_ordering')->value('status'));
    }

    public function test_refunds_owed_marks_one_paid_with_a_reference(): void
    {
        $bot = $this->linked();
        $order = Order::factory()->create(['order_number' => 'BG-3001', 'total' => 80]);
        $refund = Refund::create([
            'order_id' => $order->id, 'user_id' => $this->owner->id, 'amount' => 80, 'status' => 'approved',
            'approved_at' => now()->subDay(), 'external_tender_laar' => 8000, 'drawer_cash_out_laar' => 0, 'reason' => 'Wrong order',
        ]);

        $this->telegramText($bot, '5550001', '💸 Refunds owed')->assertOk();
        $sent = $this->sent('5550001');
        $card = end($sent);
        $this->assertStringContainsString('MVR 80.00</b> to pay back · order #BG-3001', $card['text']);

        $this->telegramButton($bot, '5550001', 'po:' . $refund->id . ':bank_transfer')->assertOk();
        $this->assertStringContainsString('transfer reference', $this->lastText('5550001'));
        $this->telegramText($bot, '5550001', 'BML-55120')->assertOk();

        $fresh = $refund->fresh();
        $this->assertNotNull($fresh->paid_out_at);
        $this->assertSame('bank_transfer', $fresh->paid_out_method);
        $this->assertSame('BML-55120', $fresh->paid_out_reference);
        $this->assertSame($this->owner->id, (int) $fresh->paid_out_by);
    }

    public function test_complaints_reply_texts_the_customer_and_resolved_closes_it(): void
    {
        $bot = $this->linked();
        $entry = ComplaintBoxEntry::create([
            'reference_number' => 'CB-0042', 'categories' => ['food_quality'], 'comment' => 'Burger was cold',
            'phone' => '+9607778888', 'is_anonymous' => false, 'status' => ComplaintBoxEntry::STATUS_NEW, 'source' => 'app',
        ]);

        $this->telegramText($bot, '5550001', '💬 Complaints')->assertOk();
        $sent = $this->sent('5550001');
        $card = end($sent);
        $this->assertStringContainsString('CB-0042', $card['text']);
        $this->assertStringContainsString('Burger was cold', $card['text']);

        $this->telegramButton($bot, '5550001', 'cb:' . $entry->id . ':reply')->assertOk();
        $this->telegramText($bot, '5550001', 'Sorry! Your next burger is on us.')->assertOk();
        $this->assertTrue(collect($this->texts)->contains(fn ($t) => $t['to'] === '+9607778888' && str_contains($t['message'], 'Your next burger is on us')));
        $this->assertSame(ComplaintBoxEntry::STATUS_IN_PROGRESS, $entry->fresh()->status);

        $this->telegramButton($bot, '5550001', 'cb:' . $entry->id . ':done')->assertOk();
        $this->assertSame(ComplaintBoxEntry::STATUS_RESOLVED, $entry->fresh()->status);
        $this->assertSame($this->owner->id, (int) $entry->fresh()->resolved_by);
    }

    public function test_customer_lookup_by_phone_and_by_name(): void
    {
        $bot = $this->linked();
        $c = Customer::create(['name' => 'Aishath Ali', 'phone' => '+9607771234', 'is_active' => true, 'loyalty_points' => 0, 'tier' => 'silver', 'credit_limit_laar' => 100000, 'credit_balance_laar' => 25000, 'credit_status' => 'active']);
        Order::factory()->create(['customer_id' => $c->id, 'order_number' => 'BG-9', 'total' => 75, 'total_laar' => 7500, 'paid_at' => now()]);

        $this->telegramText($bot, '5550001', '/customer 777 1234')->assertOk();
        $text = $this->lastText('5550001');
        $this->assertStringContainsString('<b>Aishath Ali</b>', $text);
        $this->assertStringContainsString('1 orders · MVR 75.00 spent', $text);
        $this->assertStringContainsString('Credit owed MVR 250.00 of MVR 1,000.00', $text);

        $this->telegramText($bot, '5550001', '🔎 Customer')->assertOk();
        $this->telegramText($bot, '5550001', 'aishath')->assertOk();
        $this->assertStringContainsString('<b>Aishath Ali</b>', $this->lastText('5550001'));
    }

    public function test_a_new_complaint_alert_arrives_with_its_buttons(): void
    {
        $this->linked();
        $entry = ComplaintBoxEntry::create([
            'reference_number' => 'CB-0050', 'categories' => ['service'], 'comment' => 'Slow',
            'phone' => '+9607778888', 'is_anonymous' => false, 'status' => ComplaintBoxEntry::STATUS_NEW, 'source' => 'app',
        ]);

        app(\App\Domains\Complaints\Services\ComplaintBoxService::class)->notifyOwner($entry);
        DeferAfterResponse::flushTestingCallbacks();

        $sent = $this->sent('5550001');
        $msg = end($sent);
        $this->assertStringContainsString('New complaint', $msg['text']);
        $this->assertContains('cb:' . $entry->id . ':reply', array_column($msg['reply_markup']['inline_keyboard'][0], 'callback_data'));
    }
}

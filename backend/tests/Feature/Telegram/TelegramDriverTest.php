<?php

declare(strict_types=1);

namespace Tests\Feature\Telegram;

use App\Domains\Telegram\Services\TelegramLinker;
use App\Models\AuditLog;
use App\Models\DeliveryDriver;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Payment;
use App\Models\TelegramBot;
use App\Models\TelegramLink;
use App\Support\DeferAfterResponse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * The driver level (owner, 2026-10-07: "Do it"): a message when a delivery
 * is given to them, My deliveries, and Picked up / On the way / Delivered.
 */
class TelegramDriverTest extends TestCase
{
    use FakesTelegram;
    use RefreshDatabase;

    private TelegramBot $theBot;

    private DeliveryDriver $driver;

    protected function setUp(): void
    {
        parent::setUp();
        $this->roles();
        $this->fakeTelegram();
        $this->theBot = $this->bot();
        $this->driver = $this->makeDriver('Ibrahim');
    }

    private function makeDriver(string $name): DeliveryDriver
    {
        return DeliveryDriver::query()->create(['name' => $name, 'phone' => '+960' . random_int(7000000, 7999999), 'is_active' => true, 'pin' => Hash::make('4321')]);
    }

    private function linkDriver(DeliveryDriver $driver, string $chatId): TelegramLink
    {
        $code = app(TelegramLinker::class)->issue($this->theBot, null, $driver, null)['code'];

        return app(TelegramLinker::class)->consume($this->theBot, $code, $chatId, ['first_name' => $driver->name]);
    }

    private function delivery(array $attrs = []): Order
    {
        $order = Order::factory()->delivery()->create(array_merge([
            'status' => 'ready',
            'total' => 180.00,
            'payment_status' => 'unpaid',
            'delivery_contact_name' => 'Aisha',
            'delivery_contact_phone' => '+9607771234',
            'delivery_address_line1' => 'Blue Villa, Majeedhee Magu',
            'delivery_location_link' => 'https://maps.google.com/?q=4.17,73.51',
            'delivery_notes' => 'Call at the gate',
        ], $attrs));
        OrderItem::query()->create(['order_id' => $order->id, 'item_name' => 'Beef burger', 'quantity' => 3, 'unit_price' => 50, 'total_price' => 150]);

        return $order;
    }

    private function lastEdit(): array
    {
        $edits = array_values(array_filter($this->telegramCalls, fn (array $c) => $c['method'] === 'editMessageText'));

        return end($edits)['params'] ?? [];
    }

    private function lastAnswer(): string
    {
        $answers = array_values(array_filter($this->telegramCalls, fn (array $c) => $c['method'] === 'answerCallbackQuery'));

        return (string) (end($answers)['params']['text'] ?? '');
    }

    public function test_a_linked_driver_gets_the_driver_menu(): void
    {
        $code = app(TelegramLinker::class)->issue($this->theBot, null, $this->driver, null)['code'];
        $this->telegramText($this->theBot, '6660001', '/start ' . $code)->assertOk();
        $this->assertStringContainsString("Hi Ibrahim, you're linked", $this->lastText('6660001'));
        $sent = $this->sent('6660001');
        $keyboard = end($sent)['reply_markup']['keyboard'];
        $this->assertSame('🛵 My deliveries', $keyboard[0][0]['text']);

        $this->telegramText($this->theBot, '6660001', 'hello')->assertOk();
        $this->assertStringContainsString('What the buttons do', $this->lastText('6660001'));
        $this->assertStringNotContainsString('Today', $this->lastText('6660001'));
    }

    public function test_assigning_a_delivery_messages_the_driver(): void
    {
        $this->linkDriver($this->driver, '6660001');
        $order = $this->delivery(['status' => 'in_progress']);

        $order->update(['delivery_driver_id' => $this->driver->id, 'driver_assigned_at' => now()]);
        DeferAfterResponse::flushTestingCallbacks();

        $text = $this->lastText('6660001');
        $this->assertStringContainsString('New delivery for you #' . $order->order_number, $text);
        $this->assertStringContainsString('Aisha · +9607771234', $text);
        $this->assertStringContainsString('Blue Villa, Majeedhee Magu', $text);
        $this->assertStringContainsString('open the map', $text);
        $this->assertStringContainsString('Call at the gate', $text);
        $this->assertStringContainsString('3 × Beef burger', $text);
        $this->assertStringContainsString('Collect MVR 180.00', $text);
        $this->assertStringContainsString('Still being made', $text);

        // Given to someone else: the first driver is told, the second gets it.
        $other = $this->makeDriver('Moosa');
        $this->linkDriver($other, '6660002');
        $order->update(['delivery_driver_id' => $other->id]);
        DeferAfterResponse::flushTestingCallbacks();
        $this->assertStringContainsString('was taken off you', $this->lastText('6660001'));
        $this->assertStringContainsString('New delivery for you', $this->lastText('6660002'));
    }

    public function test_assigning_through_the_shop_screen_messages_the_driver(): void
    {
        $this->linkDriver($this->driver, '6660001');
        $order = $this->delivery();
        $owner = $this->staff('owner', '+9607820288');
        \Laravel\Sanctum\Sanctum::actingAs($owner, ['staff']);

        $this->postJson('/api/delivery/orders/' . $order->id . '/assign-driver', ['driver_id' => $this->driver->id])->assertOk();
        DeferAfterResponse::flushTestingCallbacks();

        $this->assertSame('out_for_delivery', $order->fresh()->status);
        $this->assertStringContainsString('New delivery for you', $this->lastText('6660001'));
        $sent = $this->sent('6660001');
        $buttons = end($sent)['reply_markup']['inline_keyboard'];
        $this->assertSame('dv:p:' . $order->id, $buttons[0][0]['callback_data']);
    }

    public function test_my_deliveries_lists_only_this_drivers_open_ones(): void
    {
        $this->linkDriver($this->driver, '6660001');
        $mine = $this->delivery(['status' => 'out_for_delivery', 'delivery_driver_id' => $this->driver->id, 'driver_assigned_at' => now()]);
        $paid = $this->delivery(['status' => 'on_the_way', 'delivery_driver_id' => $this->driver->id, 'driver_assigned_at' => now(), 'payment_status' => 'paid', 'paid_at' => now()]);
        $this->delivery(['status' => 'delivered', 'delivery_driver_id' => $this->driver->id]);
        $this->delivery(['status' => 'out_for_delivery', 'delivery_driver_id' => $this->makeDriver('Moosa')->id]);
        DeferAfterResponse::flushTestingCallbacks();
        $before = count($this->sent('6660001'));

        $this->telegramText($this->theBot, '6660001', '🛵 My deliveries')->assertOk();

        $messages = array_slice($this->sent('6660001'), $before);
        $this->assertCount(3, $messages, 'a heading and two cards');
        $this->assertStringContainsString('Your deliveries</b> (2)', $messages[0]['text']);
        $this->assertStringContainsString('Cash to collect in all: <b>MVR 180.00', $messages[0]['text']);
        $this->assertStringContainsString('#' . $mine->order_number, $messages[1]['text']);
        $this->assertStringContainsString('#' . $paid->order_number, $messages[2]['text']);
        $this->assertStringContainsString('Paid already', $messages[2]['text']);
        $this->assertSame('dv:d:' . $paid->id, $messages[2]['reply_markup']['inline_keyboard'][0][0]['callback_data']);
    }

    public function test_picked_up_on_the_way_and_delivered(): void
    {
        $this->linkDriver($this->driver, '6660001');
        $order = $this->delivery(['status' => 'out_for_delivery', 'delivery_driver_id' => $this->driver->id, 'driver_assigned_at' => now()]);

        $this->telegramButton($this->theBot, '6660001', 'dv:p:' . $order->id)->assertOk();
        $this->assertSame('picked_up', $order->fresh()->status);
        $this->assertNotNull($order->fresh()->picked_up_at);
        $this->assertSame('dv:w:' . $order->id, $this->lastEdit()['reply_markup']['inline_keyboard'][0][0]['callback_data']);

        $this->telegramButton($this->theBot, '6660001', 'dv:w:' . $order->id)->assertOk();
        $this->assertSame('on_the_way', $order->fresh()->status);

        $this->telegramButton($this->theBot, '6660001', 'dv:d:' . $order->id)->assertOk();
        $this->assertSame('delivered', $order->fresh()->status);
        $this->assertNotNull($order->fresh()->delivered_at);
        $this->assertStringContainsString('Hand MVR 180.00 to the shop', (string) $this->lastEdit()['text']);
        $this->assertSame([], $this->lastEdit()['reply_markup']['inline_keyboard']);
        $this->assertSame(3, AuditLog::query()->where('action', 'like', 'delivery.%')->where('meta->source', 'telegram')->count());
    }

    public function test_picked_up_from_the_counter_dispatches_it_first(): void
    {
        $this->linkDriver($this->driver, '6660001');
        // Given to the driver while it was cooking; now ready at the counter.
        $order = $this->delivery(['status' => 'ready', 'delivery_driver_id' => $this->driver->id, 'driver_assigned_at' => now()]);
        Payment::query()->create(['order_id' => $order->id, 'method' => 'bml', 'amount' => 180.00, 'status' => 'paid']);

        $this->telegramButton($this->theBot, '6660001', 'dv:p:' . $order->id)->assertOk();

        $fresh = $order->fresh();
        $this->assertSame('picked_up', $fresh->status);
        $this->assertNotNull($fresh->delivery_eta_at, 'dispatching stamps the promise');
    }

    public function test_a_driver_cannot_move_someone_elses_delivery_or_skip_a_step(): void
    {
        $this->linkDriver($this->driver, '6660001');
        $theirs = $this->delivery(['status' => 'out_for_delivery', 'delivery_driver_id' => $this->makeDriver('Moosa')->id]);
        $mine = $this->delivery(['status' => 'out_for_delivery', 'delivery_driver_id' => $this->driver->id]);

        $this->telegramButton($this->theBot, '6660001', 'dv:d:' . $theirs->id)->assertOk();
        $this->assertSame('out_for_delivery', $theirs->fresh()->status);
        $this->assertStringContainsString('not yours', $this->lastAnswer());

        $this->telegramButton($this->theBot, '6660001', 'dv:d:' . $mine->id)->assertOk();
        $this->assertSame('out_for_delivery', $mine->fresh()->status);
        $this->assertStringContainsString('cannot be done', $this->lastAnswer());

        // Staff buttons mean nothing to a driver.
        $this->telegramButton($this->theBot, '6660001', 'td:2026-10-06')->assertOk();
        $this->assertStringContainsString('not for drivers', $this->lastAnswer());
    }

    public function test_a_switched_off_driver_gets_nothing(): void
    {
        $this->linkDriver($this->driver, '6660001');
        $this->driver->update(['is_active' => false]);
        $before = count($this->sent('6660001'));
        $order = $this->delivery(['status' => 'in_progress']);

        $order->update(['delivery_driver_id' => $this->driver->id]);
        DeferAfterResponse::flushTestingCallbacks();

        $this->assertCount($before, $this->sent('6660001'));
    }
}

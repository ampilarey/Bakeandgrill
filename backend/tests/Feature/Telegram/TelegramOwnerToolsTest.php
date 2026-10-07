<?php

declare(strict_types=1);

namespace Tests\Feature\Telegram;

use App\Domains\Telegram\Services\TelegramOwnerTools;
use App\Models\CashMovement;
use App\Models\Device;
use App\Models\InventoryItem;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Payment;
use App\Models\PurchaseRequest;
use App\Models\Shift;
use App\Models\SiteSetting;
use App\Models\TelegramBot;
use App\Models\TimePunch;
use App\Models\User;
use App\Support\DeferAfterResponse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * More for the owner (2026-10-07: "Next"): Who's working, Low stock with
 * add to the buying list, Find an order, Message staff, and the cancelled
 * order and cash-out alerts.
 */
class TelegramOwnerToolsTest extends TestCase
{
    use FakesTelegram;
    use RefreshDatabase;

    private TelegramBot $theBot;

    private User $owner;

    private User $cashier;

    protected function setUp(): void
    {
        parent::setUp();
        $this->roles();
        $this->fakeTelegram();
        $this->theBot = $this->bot();
        $this->owner = $this->staff('owner', '+9607820288', 'Ahmed');
        $this->link($this->theBot, $this->owner, '5550001');
        $this->cashier = $this->staff('staff', '+9607001001', 'Mariyam');
        $this->link($this->theBot, $this->cashier, '5550002');
    }

    private function say(string $chat, string $text): void
    {
        $this->telegramText($this->theBot, $chat, $text)->assertOk();
        DeferAfterResponse::flushTestingCallbacks();
    }

    private function press(string $chat, string $data): void
    {
        $this->telegramButton($this->theBot, $chat, $data)->assertOk();
        DeferAfterResponse::flushTestingCallbacks();
    }

    /** @return array<string, mixed> */
    private function last(string $chat): array
    {
        $s = $this->sent($chat);

        return end($s) ?: [];
    }

    public function test_more_shows_only_what_the_person_may_use(): void
    {
        $this->say('5550001', '🧰 More');
        $labels = array_merge(...array_map(fn (array $r) => array_column($r, 'text'), $this->last('5550001')['reply_markup']['inline_keyboard']));
        $this->assertSame(['👷 Who\'s working', '📉 Low stock', '🔍 Find an order', '📣 Message staff'], $labels);

        $this->say('5550002', '/help');
        $keyboard = array_merge(...array_map(fn (array $r) => array_column($r, 'text'), $this->last('5550002')['reply_markup']['keyboard']));
        $this->assertContains('🧰 More', $keyboard, 'a cashier can view orders and stock');
        $this->say('5550002', '🧰 More');
        $labels = array_merge(...array_map(fn (array $r) => array_column($r, 'text'), $this->last('5550002')['reply_markup']['inline_keyboard']));
        $this->assertNotContains('📣 Message staff', $labels);
        $this->assertNotContains('👷 Who\'s working', $labels);
    }

    public function test_whos_working(): void
    {
        TimePunch::query()->create(['user_id' => $this->cashier->id, 'clocked_in_at' => now()->subHours(3), 'break_minutes' => 15]);
        $device = Device::create(['name' => 'Front till', 'identifier' => 'TG-W', 'type' => 'pos', 'is_active' => true, 'status' => 'approved']);
        Shift::create(['user_id' => $this->cashier->id, 'device_id' => $device->id, 'opened_at' => now()->subHours(2), 'opening_cash' => 500]);

        $this->say('5550001', '/working');

        $text = $this->lastText('5550001');
        $this->assertStringContainsString('Clocked in</b> (1)', $text);
        $this->assertStringContainsString('Mariyam · since', $text);
        $this->assertStringContainsString('break 15m', $text);
        $this->assertStringContainsString('On a till</b> (1)', $text);
        $this->assertStringContainsString('Front till', $text);

        $this->say('5550002', '/working');
        $this->assertStringContainsString('does not have access', $this->lastText('5550002'));
    }

    public function test_low_stock_and_add_to_the_buying_list(): void
    {
        $onions = InventoryItem::query()->create(['name' => 'Onions', 'unit' => 'kg', 'current_stock' => 2, 'reorder_point' => 10, 'reorder_quantity' => 20, 'is_active' => true]);
        $milk = InventoryItem::query()->create(['name' => 'Milk', 'unit' => 'l', 'current_stock' => 0, 'reorder_point' => 6, 'is_active' => true]);
        InventoryItem::query()->create(['name' => 'Rice', 'unit' => 'kg', 'current_stock' => 50, 'reorder_point' => 10, 'is_active' => true]);

        $this->say('5550001', '/lowstock');
        $card = $this->last('5550001');
        $this->assertStringContainsString('Low stock</b> (2)', $card['text']);
        $this->assertStringContainsString('🔴 Milk · 0 l (reorder at 6 l)', $card['text'], 'out of stock first');
        $this->assertStringContainsString('🟠 Onions · 2 kg (reorder at 10 kg)', $card['text']);
        $this->assertStringNotContainsString('Rice', $card['text']);

        $this->press('5550001', 'lo:a:' . $onions->id);
        $pr = PurchaseRequest::query()->with('items')->latest('id')->firstOrFail();
        $this->assertSame('telegram', $pr->source);
        $this->assertSame((int) $onions->id, (int) $pr->items->first()->inventory_item_id);
        $this->assertSame(20.0, (float) $pr->items->first()->requested_qty, 'its reorder quantity');

        $this->say('5550001', '/lowstock');
        $this->assertStringContainsString('Onions · 2 kg (reorder at 10 kg) · 🛒 on the list', $this->lastText('5550001'));

        $this->press('5550001', 'lo:all');
        $this->assertSame(2, PurchaseRequest::query()->count(), 'only milk was added; onions were on the list');
        $this->assertSame(6.0, (float) PurchaseRequest::query()->latest('id')->first()->items->first()->requested_qty, 'up to the reorder point');
        $this->assertSame((int) $milk->id, (int) PurchaseRequest::query()->latest('id')->first()->items->first()->inventory_item_id);
    }

    public function test_find_an_order(): void
    {
        $order = Order::factory()->takeaway()->create(['order_number' => 'BG-20261007-1042', 'status' => 'completed', 'payment_status' => 'paid', 'total' => 85, 'user_id' => $this->cashier->id]);
        OrderItem::query()->create(['order_id' => $order->id, 'item_name' => 'Chicken kottu', 'quantity' => 1, 'unit_price' => 85, 'total_price' => 85]);
        Payment::query()->create(['order_id' => $order->id, 'method' => 'cash', 'amount' => 85, 'status' => 'paid']);

        $this->say('5550001', '/order 1042');

        $text = $this->lastText('5550001');
        $this->assertStringContainsString('Order #BG-20261007-1042</b> · Takeaway', $text);
        $this->assertStringContainsString('by Mariyam', $text);
        $this->assertStringContainsString('1 × Chicken kottu', $text);
        $this->assertStringContainsString('MVR 85.00</b> · paid, Cash', $text);

        $this->say('5550001', '/order 9999');
        $this->assertStringContainsString('No order numbered', $this->lastText('5550001'));
    }

    public function test_message_staff(): void
    {
        $cook = $this->staff('kitchen_staff', '+9607003003', 'Hassan');
        $this->link($this->theBot, $cook, '5550003');

        $this->say('5550001', '/tell kitchen Gas delivery comes at 3');
        $this->assertStringContainsString('From Ahmed</b>' . "\n" . 'Gas delivery comes at 3', $this->lastText('5550003'));
        $this->assertStringContainsString('Sent to 1: Hassan', $this->lastText('5550001'));
        $this->assertSame([], array_filter($this->sent('5550002'), fn ($m) => str_contains($m['text'], 'Gas delivery')), 'cashiers were not in it');

        $this->say('5550001', '/tell mariyam the float is in the safe');
        $this->assertStringContainsString('the float is in the safe', $this->lastText('5550002'));

        // Buttons: who, then the words.
        $this->press('5550001', 'ms:all');
        $this->say('5550001', 'Staff meeting at 10');
        $this->assertStringContainsString('Staff meeting at 10', $this->lastText('5550002'));
        $this->assertStringContainsString('Staff meeting at 10', $this->lastText('5550003'));

        // A cashier cannot.
        $this->say('5550002', '/tell all hello');
        $this->assertStringContainsString('does not have access', $this->lastText('5550002'));
    }

    public function test_an_order_cancelled_at_the_till_reaches_the_owner(): void
    {
        $order = Order::factory()->takeaway()->create(['order_number' => 'BG-55', 'status' => 'pending', 'total' => 120, 'user_id' => $this->cashier->id]);
        OrderItem::query()->create(['order_id' => $order->id, 'item_name' => 'Rice', 'quantity' => 1, 'unit_price' => 120, 'total_price' => 120]);
        Payment::query()->create(['order_id' => $order->id, 'method' => 'cash', 'amount' => 120, 'status' => 'paid']);

        $order->update(['status' => 'cancelled', 'cancelled_by' => $this->cashier->id, 'cancellation_reason' => 'Customer left']);
        DeferAfterResponse::flushTestingCallbacks();

        $text = $this->lastText('5550001');
        $this->assertStringContainsString('Order #BG-55 cancelled</b> by Mariyam', $text);
        $this->assertStringContainsString('MVR 120.00 had been paid: check it was refunded', $text);
        $this->assertStringContainsString('Reason: Customer left', $text);
        $this->assertSame([], $this->sent('5550002'), 'cashiers do not get it');

        // An unpaid online cart cancelled by the system: nothing.
        $before = count($this->sent('5550001'));
        $cart = Order::factory()->onlinePickup()->create(['status' => 'payment_pending', 'user_id' => null]);
        $cart->update(['status' => 'cancelled']);
        DeferAfterResponse::flushTestingCallbacks();
        $this->assertCount($before, $this->sent('5550001'));
    }

    public function test_cash_taken_out_reaches_the_owner_from_the_amount_set(): void
    {
        $device = Device::create(['name' => 'Front till', 'identifier' => 'TG-C', 'type' => 'pos', 'is_active' => true, 'status' => 'approved']);
        $shift = Shift::create(['user_id' => $this->cashier->id, 'device_id' => $device->id, 'opened_at' => now()->subHour(), 'opening_cash' => 500]);
        SiteSetting::set(TelegramOwnerTools::SETTING_CASH_MIN, '100');
        SiteSetting::bust();

        CashMovement::create(['shift_id' => $shift->id, 'user_id' => $this->cashier->id, 'type' => 'cash_out', 'amount' => 50, 'reason' => 'Ice']);
        CashMovement::create(['shift_id' => $shift->id, 'user_id' => $this->cashier->id, 'type' => 'cash_in', 'amount' => 900, 'reason' => 'Float top up']);
        DeferAfterResponse::flushTestingCallbacks();
        $this->assertSame([], $this->sent('5550001'), 'under the amount, and money in');

        $m = CashMovement::create(['shift_id' => $shift->id, 'user_id' => $this->cashier->id, 'type' => 'paid_out', 'amount' => 350, 'reason' => 'Fish from the market', 'category' => 'supplies']);
        DeferAfterResponse::flushTestingCallbacks();
        $this->assertStringContainsString('Cash out MVR 350.00</b> by Mariyam · Front till', $this->lastText('5550001'));
        $this->assertStringContainsString('Fish from the market · supplies', $this->lastText('5550001'));

        $m->update(['voided_at' => now(), 'voided_by' => $this->cashier->id, 'void_reason' => 'Typed twice']);
        DeferAfterResponse::flushTestingCallbacks();
        $this->assertStringContainsString('Cash out struck through</b>: MVR 350.00', $this->lastText('5550001'));

        SiteSetting::set(TelegramOwnerTools::SETTING_CASH, '0');
        SiteSetting::bust();
        $before = count($this->sent('5550001'));
        CashMovement::create(['shift_id' => $shift->id, 'user_id' => $this->cashier->id, 'type' => 'cash_out', 'amount' => 999, 'reason' => 'x']);
        DeferAfterResponse::flushTestingCallbacks();
        $this->assertCount($before, $this->sent('5550001'), 'switched off');
    }
}

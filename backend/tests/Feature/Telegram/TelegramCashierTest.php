<?php

declare(strict_types=1);

namespace Tests\Feature\Telegram;

use App\Models\AuditLog;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\TelegramBot;
use App\Support\DeferAfterResponse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The cashier level (owner, 2026-10-07: "Next"): a cashier's menu follows
 * their permissions; Online orders with Start / Ready / Collected in their
 * own chat; no shift figures (the close count is blind).
 */
class TelegramCashierTest extends TestCase
{
    use FakesTelegram;
    use RefreshDatabase;

    private TelegramBot $theBot;

    protected function setUp(): void
    {
        parent::setUp();
        $this->roles();
        $this->fakeTelegram();
        $this->theBot = $this->bot();
        $this->link($this->theBot, $this->staff('staff', '+9607001001', 'Mariyam'), '5550002');
    }

    /** @return list<string> */
    private function keyboard(): array
    {
        $this->telegramText($this->theBot, '5550002', '/help')->assertOk();
        $sent = $this->sent('5550002');

        return array_merge(...array_map(fn (array $row) => array_column($row, 'text'), end($sent)['reply_markup']['keyboard']));
    }

    public function test_a_cashiers_menu_follows_their_permissions(): void
    {
        $buttons = $this->keyboard();

        $this->assertContains('📥 Online orders', $buttons);
        $this->assertContains('🛒 Buying list', $buttons);
        $this->assertContains('🧾 Open orders', $buttons);
        foreach (['📊 Today', '💵 Shifts', '📈 Week', '👥 Cashiers', '💬 Complaints'] as $ownerOnly) {
            $this->assertNotContains($ownerOnly, $buttons);
        }
        $help = $this->lastText('5550002');
        $this->assertStringContainsString('Online orders</b>: online orders not handed over yet', $help);
        $this->assertStringNotContainsString('day\'s report', $help);
        $this->assertStringNotContainsString('drawer', $help);
    }

    public function test_online_orders_with_start_in_the_cashiers_own_chat(): void
    {
        $order = Order::factory()->onlinePickup()->create(['status' => 'pending', 'payment_status' => 'paid', 'paid_at' => now()->subMinutes(5), 'user_id' => null, 'order_number' => 'BG-77']);
        OrderItem::query()->create(['order_id' => $order->id, 'item_name' => 'Chicken kottu', 'quantity' => 1, 'unit_price' => 85, 'total_price' => 85]);
        Order::factory()->onlinePickup()->create(['status' => 'payment_pending', 'user_id' => null]); // not paid: not listed
        Order::factory()->takeaway()->create(['status' => 'pending', 'paid_at' => now()]); // till order: not listed

        $this->telegramText($this->theBot, '5550002', '📥 Online orders')->assertOk();

        $sent = array_slice($this->sent('5550002'), -2);
        $this->assertStringContainsString('Online orders</b> (1)', $sent[0]['text']);
        $this->assertStringContainsString('Online order #BG-77', $sent[1]['text']);
        $this->assertSame('gp:s:' . $order->id, $sent[1]['reply_markup']['inline_keyboard'][0][0]['callback_data']);

        $this->telegramButton($this->theBot, '5550002', 'gp:s:' . $order->id)->assertOk();
        DeferAfterResponse::flushTestingCallbacks();

        $this->assertSame('in_progress', $order->fresh()->status);
        $edits = array_values(array_filter($this->telegramCalls, fn (array $c) => $c['method'] === 'editMessageText'));
        $this->assertStringContainsString('Cooking</b> by Mariyam', end($edits)['params']['text']);
        $this->assertTrue(AuditLog::query()->where('action', 'order.started')->where('meta->source', 'telegram')->exists());
    }

    public function test_without_the_permission_there_is_no_online_orders_button(): void
    {
        $cashier = \App\Models\User::query()->where('name', 'Mariyam')->firstOrFail();
        $cashier->revokePermission('pos.manage_order_status');
        $cashier->revokePermission('pos.active_orders');

        $this->assertNotContains('📥 Online orders', $this->keyboard());
        $this->telegramText($this->theBot, '5550002', '/online')->assertOk();
        $this->assertStringContainsString('does not have access', $this->lastText('5550002'));
    }
}

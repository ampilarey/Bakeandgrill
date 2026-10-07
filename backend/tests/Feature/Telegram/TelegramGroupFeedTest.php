<?php

declare(strict_types=1);

namespace Tests\Feature\Telegram;

use App\Domains\Orders\DTOs\OrderPaidData;
use App\Domains\Orders\Events\OrderPaid;
use App\Models\AuditLog;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Payment;
use App\Models\TelegramBot;
use App\Models\TelegramGroup;
use App\Models\TelegramGroupPost;
use App\Models\User;
use App\Support\DeferAfterResponse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Online orders in a shop group (owner, 2026-10-07: "Do it", on the group
 * feed): /feed by the owner, a card per paid online order, Start / Ready /
 * Collected checked against whoever presses, and the card following the order.
 */
class TelegramGroupFeedTest extends TestCase
{
    use FakesTelegram;
    use RefreshDatabase;

    private const GROUP = '-1001234567890';

    private TelegramBot $theBot;

    protected function setUp(): void
    {
        parent::setUp();
        $this->roles();
        $this->fakeTelegram();
        $this->theBot = $this->bot();
        $this->theBot->forceFill(['bot_user_id' => 777000111])->save();
    }

    /** @param array<string, mixed> $extra */
    private function groupMessage(string $fromId, string $text, array $extra = []): void
    {
        static $next = 9000;
        $this->postJson('/api/telegram/webhook/' . $this->theBot->id, [
            'update_id' => ++$next,
            'message' => array_merge([
                'message_id' => ++$next,
                'chat' => ['id' => (int) self::GROUP, 'type' => 'supergroup', 'title' => 'Bake & Grill kitchen'],
                'from' => ['id' => (int) $fromId, 'first_name' => 'Tester'],
                'text' => $text,
            ], $extra),
        ], ['X-Telegram-Bot-Api-Secret-Token' => $this->theBot->webhook_secret])->assertOk();
    }

    private function groupButton(string $fromId, string $data, int $messageId): void
    {
        static $next = 70000;
        $this->postJson('/api/telegram/webhook/' . $this->theBot->id, [
            'update_id' => ++$next,
            'callback_query' => [
                'id' => 'cb' . $next,
                'from' => ['id' => (int) $fromId],
                'data' => $data,
                'message' => ['message_id' => $messageId, 'chat' => ['id' => (int) self::GROUP, 'type' => 'supergroup']],
            ],
        ], ['X-Telegram-Bot-Api-Secret-Token' => $this->theBot->webhook_secret])->assertOk();
    }

    private function feedOn(): User
    {
        $owner = $this->staff('owner', '+9607820288', 'Ahmed');
        $this->link($this->theBot, $owner, '5550001');
        $this->groupMessage('5550001', '/feed@BakeGrillStaffBot');

        return $owner;
    }

    private function paidOnlineOrder(string $type = 'delivery'): Order
    {
        $factory = Order::factory();
        $factory = $type === 'delivery' ? $factory->delivery() : $factory->onlinePickup();
        $order = $factory->create([
            'status' => 'pending',
            'payment_status' => 'paid',
            'paid_at' => now(),
            'user_id' => null,
            'total' => 245.00,
            'customer_notes' => 'No onions please',
            'delivery_location_link' => $type === 'delivery' ? 'https://maps.google.com/?q=4.17,73.51' : null,
        ]);
        OrderItem::query()->create(['order_id' => $order->id, 'item_name' => 'Chicken kottu', 'variant_name' => 'Large', 'quantity' => 2, 'unit_price' => 100, 'total_price' => 200]);
        Payment::query()->create(['order_id' => $order->id, 'method' => 'bml', 'amount' => 245.00, 'status' => 'paid']);

        event(new OrderPaid(OrderPaidData::fromOrder($order)));
        DeferAfterResponse::flushTestingCallbacks();

        return $order;
    }

    /** @return array<string, mixed> */
    private function card(): array
    {
        $cards = array_values(array_filter($this->sent(self::GROUP), fn (array $m) => str_contains((string) $m['text'], 'Online order')));

        return end($cards) ?: [];
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

    public function test_the_owner_turns_the_feed_on_in_a_group(): void
    {
        $owner = $this->feedOn();

        $group = TelegramGroup::query()->firstOrFail();
        $this->assertSame(self::GROUP, $group->chat_id);
        $this->assertSame('Bake & Grill kitchen', $group->title);
        $this->assertSame(['online_orders'], $group->feeds);
        $this->assertTrue($group->is_enabled);
        $this->assertSame($owner->id, $group->added_by);
        $this->assertStringContainsString('This group now gets online orders', $this->lastText(self::GROUP));
        $this->assertTrue(AuditLog::query()->where('action', 'telegram.group_feed_on')->exists());
    }

    public function test_someone_without_access_cannot_turn_it_on(): void
    {
        $cashier = $this->staff('staff', '+9607001001', 'Ali');
        $this->link($this->theBot, $cashier, '5550002');

        $this->groupMessage('5550002', '/feed');
        $this->groupMessage('5550999', '/feed'); // not linked at all

        $this->assertSame(0, TelegramGroup::query()->count());
        $this->assertStringContainsString('Only the owner', $this->lastText(self::GROUP));
    }

    public function test_the_bot_says_how_to_start_when_added_and_is_quiet_otherwise(): void
    {
        $this->groupMessage('5550001', '', ['new_chat_members' => [['id' => 777000111, 'is_bot' => true]]]);
        $this->assertStringContainsString('/feed@BakeGrillStaffBot', $this->lastText(self::GROUP));

        $before = count($this->sent(self::GROUP));
        $this->groupMessage('5550001', 'is the oven on?');
        $this->groupMessage('5550001', '/feed@SomeOtherBot');
        $this->assertCount($before, $this->sent(self::GROUP));
    }

    public function test_a_paid_online_order_arrives_as_a_card(): void
    {
        $this->feedOn();
        $order = $this->paidOnlineOrder();

        $card = $this->card();
        $text = (string) $card['text'];
        $this->assertStringContainsString('Online order #' . $order->order_number, $text);
        $this->assertStringContainsString('Delivery', $text);
        $this->assertStringContainsString('MVR 245.00', $text);
        $this->assertStringContainsString('paid, BML online', $text);
        $this->assertStringContainsString('2 × Chicken kottu (Large)', $text);
        $this->assertStringContainsString((string) $order->delivery_contact_phone, $text);
        $this->assertStringContainsString('maps.google.com', $text);
        $this->assertStringContainsString('No onions please', $text);
        $this->assertStringContainsString('Waiting to start', $text);
        $labels = array_column($card['reply_markup']['inline_keyboard'][0], 'text');
        $this->assertSame(['👨‍🍳 Start', '✅ Ready'], $labels);
        $this->assertSame(1, TelegramGroupPost::query()->where('order_id', $order->id)->count());

        // Paid twice (a retry): one card.
        event(new OrderPaid(OrderPaidData::fromOrder($order)));
        DeferAfterResponse::flushTestingCallbacks();
        $this->assertSame(1, TelegramGroupPost::query()->count());
    }

    public function test_till_orders_and_switched_off_groups_get_nothing(): void
    {
        $owner = $this->feedOn();
        $before = count($this->sent(self::GROUP));

        // Rung up at the till: not an online order.
        $till = Order::factory()->delivery()->create(['status' => 'pending', 'payment_status' => 'paid', 'paid_at' => now(), 'user_id' => $owner->id]);
        event(new OrderPaid(OrderPaidData::fromOrder($till)));
        DeferAfterResponse::flushTestingCallbacks();
        $this->assertCount($before, $this->sent(self::GROUP));

        $this->groupMessage('5550001', '/stopfeed');
        $this->assertFalse(TelegramGroup::query()->firstOrFail()->is_enabled);
        $before = count($this->sent(self::GROUP));
        $this->paidOnlineOrder();
        $this->assertCount($before, $this->sent(self::GROUP));
    }

    public function test_start_and_ready_by_a_linked_cashier_show_who_did_it(): void
    {
        $this->feedOn();
        $order = $this->paidOnlineOrder('online_pickup');
        $messageId = TelegramGroupPost::query()->firstOrFail()->message_id;
        $cashier = $this->staff('staff', '+9607001001', 'Ali');
        $this->link($this->theBot, $cashier, '5550002');

        $this->groupButton('5550002', 'gp:s:' . $order->id, $messageId);
        $this->assertSame('in_progress', $order->fresh()->status);
        $this->assertStringContainsString('Cooking</b> by Ali', (string) $this->lastEdit()['text']);
        $this->assertSame([['text' => '✅ Ready', 'callback_data' => 'gp:r:' . $order->id]], $this->lastEdit()['reply_markup']['inline_keyboard'][0]);
        $this->assertTrue(AuditLog::query()->where('action', 'order.started')->where('user_id', $cashier->id)->exists());

        $this->groupButton('5550002', 'gp:r:' . $order->id, $messageId);
        $this->assertSame('ready', $order->fresh()->status);
        $this->assertStringContainsString('Ready</b> by Ali', (string) $this->lastEdit()['text']);

        $this->groupButton('5550002', 'gp:c:' . $order->id, $messageId);
        $this->assertSame('completed', $order->fresh()->status);
        $this->assertStringContainsString('collected by Ali', (string) $this->lastEdit()['text']);
        $this->assertSame([], $this->lastEdit()['reply_markup']['inline_keyboard']);
    }

    public function test_presses_are_checked_against_the_person(): void
    {
        $this->feedOn();
        $order = $this->paidOnlineOrder();
        $messageId = TelegramGroupPost::query()->firstOrFail()->message_id;

        // Not linked.
        $this->groupButton('5550777', 'gp:s:' . $order->id, $messageId);
        $this->assertStringContainsString('Link your own Telegram', $this->lastAnswer());
        $this->assertSame('pending', $order->fresh()->status);

        // Linked, but not allowed to change orders.
        $cashier = $this->staff('staff', '+9607001003', 'Hassan');
        $cashier->revokePermission('pos.manage_order_status');
        $cashier->revokePermission('pos.active_orders'); // also satisfies it
        $this->link($this->theBot, $cashier, '5550003');
        $this->groupButton('5550003', 'gp:s:' . $order->id, $messageId);
        $this->assertStringContainsString('cannot change orders', $this->lastAnswer());
        $this->assertSame('pending', $order->fresh()->status);
    }

    public function test_a_move_made_on_the_till_updates_the_card(): void
    {
        $this->feedOn();
        $order = $this->paidOnlineOrder();

        $order->update(['status' => 'in_progress']);
        DeferAfterResponse::flushTestingCallbacks();

        $this->assertStringContainsString('Cooking', (string) $this->lastEdit()['text']);
        $this->assertStringNotContainsString(' by ', (string) $this->lastEdit()['text']);
    }

    public function test_a_card_cannot_skip_the_order_rules(): void
    {
        $this->feedOn();
        $order = $this->paidOnlineOrder();
        $messageId = TelegramGroupPost::query()->firstOrFail()->message_id;
        $order->update(['status' => 'cancelled']);
        DeferAfterResponse::flushTestingCallbacks();

        $this->groupButton('5550001', 'gp:r:' . $order->id, $messageId);
        $this->assertSame('cancelled', $order->fresh()->status);
        $this->assertStringContainsString('cannot be done', $this->lastAnswer());
    }

    public function test_a_group_that_becomes_a_supergroup_keeps_its_feed(): void
    {
        $this->feedOn();
        $this->groupMessage('5550001', '', ['migrate_to_chat_id' => -1009999999999]);

        $this->assertSame('-1009999999999', TelegramGroup::query()->firstOrFail()->chat_id);
    }

    public function test_admin_lists_switches_tests_and_removes_groups(): void
    {
        $owner = $this->feedOn();
        $group = TelegramGroup::query()->firstOrFail();
        Sanctum::actingAs($owner, ['staff']);

        $this->getJson('/api/admin/telegram')->assertOk()
            ->assertJsonPath('groups.0.title', 'Bake & Grill kitchen')
            ->assertJsonPath('groups.0.added_by', 'Ahmed')
            ->assertJsonPath('groups.0.feeds', ['online_orders']);

        $this->patchJson('/api/admin/telegram/groups/' . $group->id, ['is_enabled' => false])->assertOk()
            ->assertJsonPath('group.is_enabled', false);
        $this->postJson('/api/admin/telegram/groups/' . $group->id . '/test')->assertOk();
        $this->assertStringContainsString('Test from Admin', $this->lastText(self::GROUP));

        $this->deleteJson('/api/admin/telegram/groups/' . $group->id)->assertOk();
        $this->assertSame(0, TelegramGroup::query()->count());
        $this->assertContains('leaveChat', array_column($this->telegramCalls, 'method'));
    }

    public function test_a_cashier_cannot_manage_groups(): void
    {
        $this->feedOn();
        $group = TelegramGroup::query()->firstOrFail();
        Sanctum::actingAs($this->staff('staff', '+9607001001'), ['staff']);

        $this->patchJson('/api/admin/telegram/groups/' . $group->id, ['is_enabled' => false])->assertForbidden();
        $this->deleteJson('/api/admin/telegram/groups/' . $group->id)->assertForbidden();
    }
}

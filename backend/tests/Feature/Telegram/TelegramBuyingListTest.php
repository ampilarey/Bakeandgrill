<?php

declare(strict_types=1);

namespace Tests\Feature\Telegram;

use App\Domains\Telegram\Services\TelegramBuyingList;
use App\Models\InventoryItem;
use App\Models\PurchaseRequest;
use App\Models\TelegramBot;
use App\Models\TelegramGroup;
use App\Models\TelegramMessage;
use App\Models\User;
use App\Services\PurchaseRequestService;
use App\Support\DeferAfterResponse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The buying list on Telegram (owner, 2026-10-07: "Next"): add by typing,
 * Approve / Reject, the buyer ticks items off with the price paid, the
 * person who asked is told, a group can follow, every card follows.
 */
class TelegramBuyingListTest extends TestCase
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

    private function say(string $chatId, string $text): void
    {
        $this->telegramText($this->theBot, $chatId, $text)->assertOk();
        DeferAfterResponse::flushTestingCallbacks();
    }

    private function press(string $chatId, string $data): void
    {
        $this->telegramButton($this->theBot, $chatId, $data)->assertOk();
        DeferAfterResponse::flushTestingCallbacks();
    }

    /** @return array<string, mixed> */
    private function lastSent(string $chatId): array
    {
        $all = $this->sent($chatId);

        return end($all) ?: [];
    }

    private function lastEdit(?string $chatId = null): array
    {
        $edits = array_values(array_filter($this->telegramCalls, fn (array $c) => $c['method'] === 'editMessageText'
            && ($chatId === null || (string) $c['params']['chat_id'] === $chatId)));

        return end($edits)['params'] ?? [];
    }

    private function lastAnswer(): string
    {
        $answers = array_values(array_filter($this->telegramCalls, fn (array $c) => $c['method'] === 'answerCallbackQuery'));

        return (string) (end($answers)['params']['text'] ?? '');
    }

    private function cashierAsks(string $text = '5 kg onions, 2 l milk'): PurchaseRequest
    {
        $this->say('5550002', '🛒 Buying list');
        $this->say('5550002', $text);

        return PurchaseRequest::query()->latest('id')->firstOrFail();
    }

    public function test_typing_is_read_as_lines(): void
    {
        [$lines, $urgent] = TelegramBuyingList::parse('need 5 kg onions, 2l milk, tissue; 3 trays eggs, 10 lemons urgent');

        $this->assertTrue($urgent);
        $this->assertSame([
            ['qty' => 5.0, 'unit' => 'kg', 'name' => 'onions'],
            ['qty' => 2.0, 'unit' => 'l', 'name' => 'milk'],
            ['qty' => 1.0, 'unit' => 'pcs', 'name' => 'tissue'],
            ['qty' => 3.0, 'unit' => 'tray', 'name' => 'eggs'],
            ['qty' => 10.0, 'unit' => 'pcs', 'name' => 'lemons'],
        ], $lines);
    }

    public function test_a_cashier_adds_by_typing_and_the_owner_gets_it_to_approve(): void
    {
        InventoryItem::query()->create(['name' => 'Milk', 'unit' => 'l', 'current_stock' => 0, 'is_active' => true]);

        $pr = $this->cashierAsks('5 kg onions, 2 l milk urgent');

        $this->assertSame('telegram', $pr->source);
        $this->assertSame('urgent', $pr->priority);
        $this->assertSame((int) $this->cashier->id, (int) $pr->requested_by);
        $this->assertCount(2, $pr->items);
        $this->assertNotNull($pr->items->firstWhere('free_text_name', null)?->inventory_item_id, 'milk matched the stock item');
        $this->assertStringContainsString('Added.', (string) $this->lastSent('5550002')['text']);
        $this->assertStringContainsString('Waiting for approval', (string) $this->lastSent('5550002')['text']);
        $this->assertSame([], $this->lastSent('5550002')['reply_markup']['inline_keyboard'] ?? [], 'the cashier gets no Approve button');

        $card = $this->lastSent('5550001');
        $this->assertStringContainsString('Buying list ' . $pr->request_no . '</b> · ⚡ Urgent', $card['text']);
        $this->assertStringContainsString('Asked by Mariyam', $card['text']);
        $this->assertStringContainsString('• 5 kg onions', $card['text']);
        $this->assertStringContainsString('• 2 l Milk', $card['text']);
        $this->assertSame(['✅ Approve', '✖ Reject'], array_column($card['reply_markup']['inline_keyboard'][0], 'text'));
    }

    public function test_approve_tells_the_cashier_and_updates_every_card(): void
    {
        $pr = $this->cashierAsks();

        $this->press('5550001', 'bl:a:' . $pr->id);

        $this->assertSame('approved', $pr->fresh()->status);
        $this->assertSame((int) $this->owner->id, (int) $pr->fresh()->approved_by);
        $this->assertStringContainsString('was approved by Ahmed', $this->lastText('5550002'));
        $this->assertStringContainsString('Approved</b> by Ahmed', (string) $this->lastEdit('5550001')['text']);
        $this->assertSame([], $this->lastEdit('5550001')['reply_markup']['inline_keyboard']);
        // The cashier's own "Added" card follows too.
        $this->assertStringContainsString('Approved</b> by Ahmed', (string) $this->lastEdit('5550002')['text']);
    }

    public function test_reject_asks_why_and_the_cashier_is_told(): void
    {
        $pr = $this->cashierAsks();

        $this->press('5550001', 'bl:r:' . $pr->id);
        $this->assertStringContainsString('Type the reason', $this->lastText('5550001'));
        $this->say('5550001', 'We have plenty in the store room');

        $this->assertSame('rejected', $pr->fresh()->status);
        $this->assertSame('We have plenty in the store room', $pr->fresh()->rejection_reason);
        $this->assertStringContainsString('rejected by Ahmed: We have plenty in the store room', $this->lastText('5550002'));
    }

    public function test_a_cashier_cannot_approve(): void
    {
        $pr = $this->cashierAsks();

        $this->press('5550002', 'bl:a:' . $pr->id);

        $this->assertSame('requested', $pr->fresh()->status);
        $this->assertStringContainsString('cannot approve', $this->lastAnswer());
    }

    public function test_the_buyer_ticks_items_off_with_what_they_paid(): void
    {
        $pr = $this->cashierAsks();
        $this->press('5550001', 'bl:a:' . $pr->id);
        app(PurchaseRequestService::class)->assign($pr->fresh(), $this->cashier, $this->owner, Request::create('/'));
        DeferAfterResponse::flushTestingCallbacks();

        $card = $this->lastSent('5550002');
        $this->assertStringContainsString('You are buying this', $card['text']);
        $onions = $pr->items()->where('free_text_name', 'onions')->firstOrFail();
        $milk = $pr->items()->where('free_text_name', 'milk')->firstOrFail();
        $this->assertSame('bl:b:' . $onions->id, $card['reply_markup']['inline_keyboard'][0][0]['callback_data']);
        $messageId = (int) TelegramMessage::query()->where('kind', 'buyer')->value('message_id');

        $this->telegramButton($this->theBot, '5550002', 'bl:b:' . $onions->id)->assertOk();
        $this->assertStringContainsString('What did you pay for onions', $this->lastText('5550002'));
        $this->say('5550002', 'MVR 120');

        $onions->refresh();
        $this->assertSame('bought', $onions->status);
        $this->assertSame(2400, (int) $onions->actual_unit_cost_laar, 'MVR 120 for 5 kg');
        $this->assertSame(12000, (int) $onions->actual_total_laar);
        $this->assertStringContainsString('onions bought, MVR 120.00', $this->lastText('5550002'));

        $this->press('5550002', 'bl:n:' . $milk->id);
        $this->assertSame('not_available', $milk->fresh()->status);

        $edit = $this->lastEdit('5550002');
        $this->assertStringContainsString('onions ✅ MVR 120.00', (string) $edit['text']);
        $this->assertStringContainsString('milk ❌ not there', (string) $edit['text']);
        $this->assertNotSame(0, $messageId);
    }

    public function test_a_request_made_in_admin_reaches_the_approvers_too(): void
    {
        Sanctum::actingAs($this->cashier, ['staff']);

        $this->postJson('/api/purchase-requests', [
            'source' => 'pos',
            'items' => [['free_text_name' => 'Gas cylinder', 'requested_qty' => 1, 'requested_unit' => 'pcs', 'reason' => 'gas']],
        ])->assertCreated();
        DeferAfterResponse::flushTestingCallbacks();

        $this->assertStringContainsString('Gas cylinder', $this->lastText('5550001'));
    }

    public function test_a_group_can_follow_the_buying_list(): void
    {
        $this->theBot->forceFill(['bot_user_id' => 777000111])->save();
        $group = '-100555';
        $this->postJson('/api/telegram/webhook/' . $this->theBot->id, [
            'update_id' => 880001,
            'message' => ['message_id' => 1, 'chat' => ['id' => (int) $group, 'type' => 'supergroup', 'title' => 'Store room'], 'from' => ['id' => 5550001], 'text' => '/feed@BakeGrillStaffBot buying'],
        ], ['X-Telegram-Bot-Api-Secret-Token' => $this->theBot->webhook_secret])->assertOk();
        $this->assertSame(['buying_list'], TelegramGroup::query()->firstOrFail()->feeds);
        $this->assertStringContainsString('follows the buying list', $this->lastText($group));

        $pr = $this->cashierAsks('3 trays eggs');
        $card = $this->lastSent($group);
        $this->assertStringContainsString('• 3 trays eggs', $card['text']);
        $this->assertSame('gb:a:' . $pr->id, $card['reply_markup']['inline_keyboard'][0][0]['callback_data']);

        $press = fn (string $from, string $data) => $this->postJson('/api/telegram/webhook/' . $this->theBot->id, [
            'update_id' => random_int(900000, 999999),
            'callback_query' => ['id' => 'g1', 'from' => ['id' => (int) $from], 'data' => $data, 'message' => ['message_id' => 9, 'chat' => ['id' => (int) $group, 'type' => 'supergroup']]],
        ], ['X-Telegram-Bot-Api-Secret-Token' => $this->theBot->webhook_secret])->assertOk();

        $press('5550777', 'gb:a:' . $pr->id); // not linked
        $this->assertSame('requested', $pr->fresh()->status);
        $this->assertStringContainsString('Link your own Telegram', $this->lastAnswer());

        $press('5550001', 'gb:a:' . $pr->id);
        DeferAfterResponse::flushTestingCallbacks();
        $this->assertSame('approved', $pr->fresh()->status);
        $this->assertStringContainsString('Approved</b> by Ahmed', (string) $this->lastEdit($group)['text']);
    }
}

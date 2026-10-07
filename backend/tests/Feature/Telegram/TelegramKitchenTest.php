<?php

declare(strict_types=1);

namespace Tests\Feature\Telegram;

use App\Models\Item;
use App\Models\KitchenProductionBatch;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\ProductionPlanRecord;
use App\Models\PurchaseRequest;
use App\Models\PurchaseRequestItem;
use App\Models\TelegramBot;
use App\Models\User;
use App\Support\DeferAfterResponse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The kitchen level (owner, 2026-10-07: "Next"): the prep list with Made,
 * the kitchen board read only, and checking in bought items.
 */
class TelegramKitchenTest extends TestCase
{
    use FakesTelegram;
    use RefreshDatabase;

    private TelegramBot $theBot;

    private User $cook;

    protected function setUp(): void
    {
        parent::setUp();
        $this->roles();
        $this->fakeTelegram();
        $this->theBot = $this->bot();
        $this->cook = $this->staff('kitchen_staff', '+9607003003', 'Hassan');
        $this->link($this->theBot, $this->cook, '5550003');
    }

    private function job(float $planned = 40, ?int $assignee = null, ?string $date = null): ProductionPlanRecord
    {
        $item = Item::factory()->create(['name' => 'Bajiya']);

        return ProductionPlanRecord::query()->create([
            'plan_date' => $date ?? now()->toDateString(), 'slot_start' => 14, 'slot_end' => 16, 'slot_label' => 'Afternoon',
            'item_id' => $item->id, 'variant_id' => 0, 'forecast_qty' => $planned, 'planned_qty' => $planned,
            'assigned_to' => $assignee ?? $this->cook->id, 'due_time' => '16:00',
        ]);
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

    public function test_a_cooks_menu(): void
    {
        $this->telegramText($this->theBot, '5550003', '/help')->assertOk();
        $sent = $this->sent('5550003');
        $buttons = array_merge(...array_map(fn (array $row) => array_column($row, 'text'), end($sent)['reply_markup']['keyboard']));

        foreach (['📋 Prep list', '🍳 Kitchen', '📦 To check in', '🛒 Buying list'] as $b) {
            $this->assertContains($b, $buttons);
        }
        foreach (['📊 Today', '📥 Online orders', '💵 Shifts'] as $b) {
            $this->assertNotContains($b, $buttons);
        }
    }

    public function test_the_prep_list_and_made(): void
    {
        $record = $this->job();
        $this->job(10, $this->staff('kitchen_staff', '+9607003004', 'Ali')->id); // someone else's

        $this->telegramText($this->theBot, '5550003', '📋 Prep list')->assertOk();

        // The "your jobs" message for the new job may arrive in between.
        $sent = array_values(array_filter($this->sent('5550003'), fn (array $m) => !str_contains($m['text'], 'Your jobs')));
        $this->assertStringContainsString('Today</b> · 2 jobs (1 yours), 0 done', $sent[0]['text']);
        $this->assertStringContainsString('Bajiya</b> · 40 to make · by 4:00 pm', $sent[1]['text'], 'their own job first');
        $this->assertStringContainsString('for Ali', $sent[2]['text']);
        $this->assertSame(['✅ Made 40', '✏️ Other amount'], array_column($sent[1]['reply_markup']['inline_keyboard'][0], 'text'));

        $this->telegramButton($this->theBot, '5550003', 'kp:o:' . $record->id)->assertOk();
        $this->assertStringContainsString('How many did you make', $this->lastText('5550003'));
        $this->telegramText($this->theBot, '5550003', '15')->assertOk();
        $this->assertSame(15.0, (float) $record->fresh()->made_qty);
        $this->assertStringContainsString('15 sent to the counter', $this->lastText('5550003'));

        $this->telegramButton($this->theBot, '5550003', 'kp:a:' . $record->id)->assertOk();
        $this->assertSame(40.0, (float) $record->fresh()->made_qty);
        $this->assertSame((int) $this->cook->id, (int) $record->fresh()->made_by);
        $this->assertSame(2, KitchenProductionBatch::query()->count(), 'each Made is a batch for the counter');
        $this->assertStringContainsString('25 made</b> by Hassan', (string) $this->lastEdit()['text']);
        $this->assertSame([], $this->lastEdit()['reply_markup']['inline_keyboard']);
    }

    public function test_saving_a_plan_tells_the_cook_their_jobs(): void
    {
        $item = Item::factory()->create(['name' => 'Samosa']);
        $manager = $this->staff('manager', '+9607001002', 'Ariya');
        $manager->grantPermission('kitchen.production.plan');
        Sanctum::actingAs($manager, ['staff']);

        $this->postJson('/api/production-plan/commit', [
            'date' => now()->addDay()->toDateString(),
            'lines' => [['item_id' => $item->id, 'slot_start' => 9, 'slot_end' => 11, 'forecast_qty' => 30, 'planned_qty' => 30, 'assigned_to' => $this->cook->id, 'due_time' => '10:30']],
        ])->assertSuccessful();
        DeferAfterResponse::flushTestingCallbacks();

        $text = $this->lastText('5550003');
        $this->assertStringContainsString('Your jobs for tomorrow', $text);
        $this->assertStringContainsString('Samosa · 30 by 10:30 am', $text);
    }

    public function test_the_kitchen_board_is_read_only(): void
    {
        $waiting = Order::factory()->takeaway()->create(['status' => 'pending', 'fired_at' => now()->subMinutes(14), 'order_number' => 'BG-201']);
        OrderItem::query()->create(['order_id' => $waiting->id, 'item_name' => 'Kottu', 'quantity' => 2, 'unit_price' => 50, 'total_price' => 100]);
        $cooking = Order::factory()->takeaway()->create(['status' => 'in_progress', 'fired_at' => now()->subMinutes(5), 'order_number' => 'BG-202']);
        OrderItem::query()->create(['order_id' => $cooking->id, 'item_name' => 'Rice', 'quantity' => 1, 'unit_price' => 50, 'total_price' => 50]);

        $this->telegramText($this->theBot, '5550003', '🍳 Kitchen')->assertOk();

        $text = $this->lastText('5550003');
        $this->assertStringContainsString('Kitchen now</b> · 1 to start · 1 cooking · 0 ready', $text);
        $this->assertStringContainsString('#BG-201</b> · 14m', $text);
        $this->assertStringContainsString('Start and Done stay on the kitchen screen', $text);
        $sent = $this->sent('5550003');
        $this->assertArrayNotHasKey('reply_markup', end($sent));
    }

    public function test_checking_in_a_bought_item_but_not_your_own(): void
    {
        $buyer = $this->staff('staff', '+9607001001', 'Mariyam');
        $pr = PurchaseRequest::query()->create(['request_no' => 'PR-1', 'source' => 'telegram', 'status' => 'bought_pending_verification', 'priority' => 'normal', 'requested_by' => $buyer->id, 'assigned_to' => $buyer->id]);
        $item = PurchaseRequestItem::query()->create(['purchase_request_id' => $pr->id, 'free_text_name' => 'onions', 'requested_qty' => 5, 'requested_unit' => 'kg',
            'actual_qty' => 5, 'actual_total_laar' => 12000, 'status' => 'bought', 'bought_by' => $buyer->id, 'bought_at' => now()]);

        $this->telegramText($this->theBot, '5550003', '📦 To check in')->assertOk();
        $sent = $this->sent('5550003');
        $card = end($sent);
        $this->assertStringContainsString('5 kg onions', $card['text']);
        $this->assertStringContainsString('Bought by Mariyam', $card['text']);
        $this->assertStringContainsString('MVR 120.00', $card['text']);

        $this->telegramButton($this->theBot, '5550003', 'kc:r:' . $item->id)->assertOk();
        $this->assertSame('received', $item->fresh()->status);
        $this->assertStringContainsString('Checked in</b> by Hassan', (string) $this->lastEdit()['text']);

        // The buyer cannot check in their own purchase.
        $item2 = PurchaseRequestItem::query()->create(['purchase_request_id' => $pr->id, 'free_text_name' => 'milk', 'requested_qty' => 2, 'requested_unit' => 'l',
            'status' => 'bought', 'bought_by' => $buyer->id, 'bought_at' => now()]);
        $this->link($this->theBot, $buyer, '5550002');
        $this->telegramButton($this->theBot, '5550002', 'kc:r:' . $item2->id)->assertOk();
        $this->assertSame('bought', $item2->fresh()->status);
        $this->assertNotSame('Checked in.', $this->lastAnswer());
    }
}

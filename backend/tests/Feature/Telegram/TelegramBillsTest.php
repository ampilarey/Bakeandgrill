<?php

declare(strict_types=1);

namespace Tests\Feature\Telegram;

use App\Domains\Inventory\Bills\BillUnreadable;
use App\Domains\Inventory\Bills\BillVision;
use App\Models\InventoryItem;
use App\Models\Purchase;
use App\Models\PurchaseBill;
use App\Models\PurchaseReceipt;
use App\Models\TelegramBot;
use App\Models\User;
use App\Support\DeferAfterResponse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Owner, 2026-11-15: "Can I upload and approve slip via Telegram". A photo of a
 * supplier's bill sent to the staff bot is read and comes back with Approve.
 */
class TelegramBillsTest extends TestCase
{
    use FakesTelegram;
    use RefreshDatabase;

    private TelegramBot $theBot;

    private User $owner;

    private InventoryItem $flour;

    protected function setUp(): void
    {
        parent::setUp();
        $this->roles();
        $this->fakeTelegram();
        Storage::fake('local');
        $this->theBot = $this->bot();
        $this->owner = $this->staff('owner', '+9607820288', 'Ahmed');
        $this->link($this->theBot, $this->owner, '5550001');
        $this->flour = InventoryItem::create(['name' => 'Flour', 'unit' => 'kg', 'unit_cost' => 10, 'is_active' => true]);
    }

    /** Each photo is a different file. */
    public static int $n = 0;

    private function reader(array|BillUnreadable $answer, bool $enabled = true): void
    {
        $this->app->instance(BillVision::class, new class($answer, $enabled) extends BillVision
        {
            public function __construct(private array|BillUnreadable $answer, private bool $on) {}

            public function enabled(): bool
            {
                return $this->on;
            }

            public function read(string $bytes, string $mime, string $context, ?string $provider = null): array
            {
                if ($this->answer instanceof BillUnreadable) {
                    throw $this->answer;
                }

                return $this->answer;
            }
        });
    }

    private function answer(array $lines = [], array $over = []): array
    {
        return array_merge([
            'is_bill' => true, 'shop' => 'Agora', 'bill_no' => 'INV-77', 'date' => now()->subDay()->toDateString(),
            'total' => 110.0, 'gst_total' => 0, 'note' => '',
            'lines' => $lines ?: [
                ['name' => 'WHEAT FLOUR 1KG', 'item_id' => $this->flour->id, 'new_name' => '', 'new_unit' => '', 'quantity' => 5, 'unit' => '', 'unit_price' => 22, 'amount' => 110, 'gst' => false, 'unsure' => false],
            ],
        ], $over);
    }

    private function photo(string $chat = '5550001'): void
    {
        self::$n++;
        $this->postJson('/api/telegram/webhook/' . $this->theBot->id, [
            'update_id' => 900000 + self::$n,
            'message' => [
                'message_id' => 7000 + self::$n,
                'chat' => ['id' => (int) $chat, 'type' => 'private'],
                'from' => ['id' => (int) $chat, 'first_name' => 'Tester'],
                'photo' => [['file_id' => 'small', 'file_size' => 900], ['file_id' => 'big-' . self::$n, 'file_size' => 90000]],
            ],
        ], ['X-Telegram-Bot-Api-Secret-Token' => $this->theBot->webhook_secret])->assertOk();
        DeferAfterResponse::flushTestingCallbacks();
    }

    private function press(string $data, string $chat = '5550001'): void
    {
        $this->telegramButton($this->theBot, $chat, $data)->assertOk();
        DeferAfterResponse::flushTestingCallbacks();
    }

    public function test_a_photo_is_read_and_comes_back_with_approve(): void
    {
        $this->reader($this->answer());
        $this->photo();

        $bill = PurchaseBill::firstOrFail();
        $this->assertSame('ready', $bill->status);
        $this->assertNotNull($bill->telegram_told_at);
        // The largest size of the photo was the one fetched.
        $this->assertContains('big-' . self::$n, array_map(fn ($c) => $c['params']['file_id'] ?? null, $this->telegramCalls));

        $sent = $this->sent('5550001');
        $this->assertStringContainsString('Got the bill', $sent[count($sent) - 2]['text']);
        $card = end($sent);
        $this->assertStringContainsString('<b>Agora</b>', $card['text']);
        $this->assertStringContainsString('1. Flour: 5 kg × MVR 22.00 = MVR 110.00', $card['text']);
        $this->assertStringContainsString('the bill says MVR 110.00', $card['text']);
        $buttons = collect($card['reply_markup']['inline_keyboard'])->flatten(1);
        $this->assertSame('pba:' . $bill->id, $buttons->firstWhere('text', '✅ Approve: paid in cash')['callback_data']);
        $this->assertNotNull($buttons->firstWhere('text', 'Open in Admin')['url']);
    }

    public function test_approve_makes_the_purchase_received_and_paid_with_the_bill_as_its_receipt(): void
    {
        $this->reader($this->answer());
        $this->photo();
        $bill = PurchaseBill::firstOrFail();

        $this->press('pba:' . $bill->id);

        $purchase = Purchase::with('items')->firstOrFail();
        $this->assertSame('received', $purchase->status);
        $this->assertEquals(110, $purchase->total);
        $this->assertEquals(110, $purchase->paid_amount);
        $this->assertSame('INV-77', $purchase->supplier_invoice_no);
        $this->assertSame($this->owner->id, $purchase->user_id);
        $this->assertEquals(5, $this->flour->fresh()->current_stock);
        $this->assertSame('done', $bill->fresh()->status);
        $this->assertSame($bill->file_path, PurchaseReceipt::where('purchase_id', $purchase->id)->value('file_path'));
        $edit = collect($this->telegramCalls)->last(fn ($c) => $c['method'] === 'editMessageText');
        $this->assertStringContainsString('made and received', $edit['params']['text']);

        // A second press makes nothing more.
        $this->press('pba:' . $bill->id);
        $this->assertSame(1, Purchase::count());
    }

    public function test_not_paid_yet_leaves_it_owed(): void
    {
        $this->reader($this->answer());
        $this->photo();
        $this->press('pbn:' . PurchaseBill::firstOrFail()->id);

        $purchase = Purchase::firstOrFail();
        $this->assertSame('received', $purchase->status);
        $this->assertEquals(0, (float) $purchase->paid_amount);
    }

    public function test_a_bill_that_needs_a_person_has_no_approve_and_a_forged_press_is_refused(): void
    {
        $this->reader($this->answer([
            ['name' => 'WHEAT FLOUR 1KG', 'item_id' => $this->flour->id, 'new_name' => '', 'new_unit' => '', 'quantity' => 5, 'unit' => 'sack', 'unit_price' => 22, 'amount' => 110, 'gst' => false, 'unsure' => false],
            ['name' => 'C/COLA CTN', 'item_id' => 0, 'new_name' => 'Cola', 'new_unit' => 'bottle', 'quantity' => 1, 'unit' => 'carton', 'unit_price' => 180, 'amount' => 180, 'gst' => false, 'unsure' => false],
        ], ['total' => 300]));
        $this->photo();

        $card = $this->sent('5550001');
        $card = end($card);
        $this->assertStringContainsString('needs checking in Admin', $card['text']);
        $this->assertStringContainsString('1 line is not in your inventory.', $card['text']);
        $this->assertStringContainsString('1 line is in a pack that has no size yet.', $card['text']);
        $this->assertStringContainsString('The lines do not add up to the bill', $card['text']);
        $this->assertStringNotContainsString('pba:', json_encode($card['reply_markup']));

        $this->press('pba:' . PurchaseBill::firstOrFail()->id);
        $this->assertSame(0, Purchase::count());
    }

    public function test_a_bill_that_cannot_be_read_says_so_and_remove_takes_it_away(): void
    {
        $this->reader(new BillUnreadable('Nothing on this could be read as a bill.'));
        $this->photo();
        $bill = PurchaseBill::firstOrFail();
        $this->assertSame('failed', $bill->status);
        $this->assertStringContainsString('could not be read', $this->lastText('5550001'));

        $this->press('pbr:' . $bill->id);
        $this->assertSame(0, PurchaseBill::count());
        Storage::disk('local')->assertMissing($bill->file_path);
    }

    public function test_someone_who_cannot_enter_purchases_is_told_and_nothing_is_kept(): void
    {
        $this->reader($this->answer());
        $cashier = $this->staff('staff', '+9607001001', 'Mariyam');
        $this->link($this->theBot, $cashier, '5550002');

        $this->photo('5550002');
        $this->assertSame(0, PurchaseBill::count());
        $this->assertStringContainsString('cannot enter purchases', $this->lastText('5550002'));

        // Nor can they press a button on someone else's bill.
        $this->photo();
        $this->press('pba:' . PurchaseBill::firstOrFail()->id, '5550002');
        $this->assertSame(0, Purchase::count());
    }

    public function test_without_a_key_the_bot_says_where_to_set_one(): void
    {
        $this->reader($this->answer(), enabled: false);
        $this->photo();
        $this->assertSame(0, PurchaseBill::count());
        $this->assertStringContainsString('Purchasing → Settings → Reading bills', $this->lastText('5550001'));
    }
}

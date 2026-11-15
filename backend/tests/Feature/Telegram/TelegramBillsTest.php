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
                ['name' => 'WHEAT FLOUR 1KG', 'item_id' => $this->flour->id, 'new_name' => '', 'new_unit' => '', 'quantity' => 5, 'unit' => '', 'pack_size' => 0, 'unit_price' => 22, 'amount' => 110, 'gst' => false, 'unsure' => false],
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
        // Laid out as the manual order's form: who, when, the lines, the total, Did you pay?
        $this->assertStringContainsString('<b>Bought from:</b> Agora', $card['text']);
        $this->assertStringContainsString('<b>Purchase date:</b> ' . now()->subDay()->format('D j M Y'), $card['text']);
        $this->assertStringContainsString('<b>Bill no.:</b> INV-77', $card['text']);
        $this->assertStringContainsString('<b>1. Flour</b>', $card['text']);
        $this->assertStringContainsString('5 kg × MVR 22.00 = <b>MVR 110.00</b>', $card['text']);
        $this->assertStringContainsString('On the bill: WHEAT FLOUR 1KG', $card['text']);
        $this->assertStringContainsString('<b>Order total: MVR 110.00</b>', $card['text']);
        $this->assertStringContainsString('The same as the bill', $card['text']);
        $this->assertStringContainsString('<b>Did you pay?</b>', $card['text']);
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
            ['name' => 'WHEAT FLOUR 1KG', 'item_id' => $this->flour->id, 'new_name' => '', 'new_unit' => '', 'quantity' => 5, 'unit' => '', 'pack_size' => 0, 'unit_price' => 22, 'amount' => 110, 'gst' => false, 'unsure' => true],
        ], ['total' => 300]));
        $this->photo();

        $card = $this->sent('5550001');
        $card = end($card);
        $this->assertStringContainsString('needs checking in Admin', $card['text']);
        $this->assertStringContainsString('1 line was hard to read.', $card['text']);
        $this->assertStringContainsString('The lines do not add up to the bill', $card['text']);
        $this->assertStringNotContainsString('pba:', json_encode($card['reply_markup']));

        $this->press('pba:' . PurchaseBill::firstOrFail()->id);
        $this->assertSame(0, Purchase::count());
    }

    /** Owner, 2026-11-15: a bill for a product not in the inventory sent them to Admin. */
    public function test_a_new_product_in_a_pack_the_bill_sizes_is_added_and_approved_in_one_tap(): void
    {
        $this->reader($this->answer([
            ['name' => 'Microwave PP Round Container 525ml -50pcs', 'item_id' => 0, 'new_name' => 'Microwave container 525ml', 'new_unit' => 'piece', 'quantity' => 1, 'unit' => 'bundle', 'pack_size' => 50, 'unit_price' => 135, 'amount' => 135, 'gst' => false, 'unsure' => false],
        ], ['shop' => 'Guest Box', 'total' => 135]));
        $this->photo();
        $bill = PurchaseBill::firstOrFail();

        $card = $this->sent('5550001');
        $card = end($card);
        $this->assertStringContainsString('Approving also sets up', $card['text']);
        $this->assertStringContainsString('New item in your inventory: <b>Microwave container 525ml</b>, counted in piece', $card['text']);
        $this->assertStringContainsString('1 bundle of Microwave container 525ml = 50 piece', $card['text']);
        $this->assertStringContainsString('<b>1. Microwave container 525ml</b> · 🆕 not in inventory', $card['text']);
        $this->assertStringContainsString('Pack: 1 bundle = 50 piece, so 50 piece at MVR 2.70 each', $card['text']);
        $this->assertSame('pba:' . $bill->id, collect($card['reply_markup']['inline_keyboard'])->flatten(1)->firstWhere('text', '✅ Add and approve: paid in cash')['callback_data']);
        // Nothing is added until the press.
        $this->assertSame(1, InventoryItem::count());

        $this->press('pba:' . $bill->id);

        $item = InventoryItem::where('name', 'Microwave container 525ml')->firstOrFail();
        $this->assertSame('piece', $item->unit);
        $this->assertEquals(50, $item->purchaseUnits()->where('name', 'Bundle')->value('base_units'));
        $purchase = Purchase::firstOrFail();
        $this->assertSame('received', $purchase->status);
        $this->assertEquals(135, $purchase->total);
        $this->assertEquals(50, $item->fresh()->current_stock);
        $this->assertSame('done', $bill->fresh()->status);
    }

    public function test_a_pack_the_bill_does_not_size_is_asked_for_and_then_approved(): void
    {
        $this->reader($this->answer([
            ['name' => 'WHEAT FLOUR SACK', 'item_id' => $this->flour->id, 'new_name' => '', 'new_unit' => '', 'quantity' => 2, 'unit' => 'sack', 'pack_size' => 0, 'unit_price' => 500, 'amount' => 1000, 'gst' => false, 'unsure' => false],
        ], ['total' => 1000]));
        $this->photo();
        $bill = PurchaseBill::firstOrFail();

        $card = $this->sent('5550001');
        $card = end($card);
        $this->assertStringContainsString('how many kg are in one <b>sack</b> of Flour?', $card['text']);
        $this->assertStringNotContainsString('pba:', json_encode($card['reply_markup']));
        // Approve before the size is said makes nothing.
        $this->press('pba:' . $bill->id);
        $this->assertSame(0, Purchase::count());

        $this->press('pbs:' . $bill->id . '.0');
        $this->assertStringContainsString('Send just the number', $this->lastText('5550001'));
        $this->telegramText($this->theBot, '5550001', 'fifty')->assertOk();
        $this->assertStringContainsString('Just the number, please', $this->lastText('5550001'));
        $this->telegramText($this->theBot, '5550001', '25')->assertOk();

        $card = $this->sent('5550001');
        $card = end($card);
        $this->assertStringContainsString('1 sack of Flour = 25 kg', $card['text']);
        $this->press('pba:' . $bill->id);

        $this->assertEquals(25, $this->flour->purchaseUnits()->where('name', 'Sack')->value('base_units'));
        $this->assertEquals(50, $this->flour->fresh()->current_stock);
        $this->assertEquals(1000, Purchase::firstOrFail()->total);
    }

    public function test_someone_who_may_not_add_inventory_items_is_sent_to_admin_for_a_new_product(): void
    {
        $this->reader($this->answer([
            ['name' => 'CONTAINER', 'item_id' => 0, 'new_name' => 'Container', 'new_unit' => 'piece', 'quantity' => 1, 'unit' => '', 'pack_size' => 0, 'unit_price' => 135, 'amount' => 135, 'gst' => false, 'unsure' => false],
        ], ['total' => 135]));
        $buyer = $this->staff('staff', '+9607001009', 'Buyer');
        $buyer->grantPermission('suppliers.purchases');
        $this->link($this->theBot, $buyer, '5550009');

        $this->photo('5550009');

        $card = $this->lastText('5550009');
        $this->assertStringContainsString('needs checking in Admin', $card);
        $this->assertStringContainsString('1 line is not in your inventory.', $card);
        $this->press('pba:' . PurchaseBill::firstOrFail()->id, '5550009');
        $this->assertSame(0, Purchase::count());
        $this->assertSame(1, InventoryItem::count());
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

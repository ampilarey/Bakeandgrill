<?php

declare(strict_types=1);

namespace Tests\Feature\Procurement;

use App\Domains\Inventory\Bills\BillReader;
use App\Domains\Inventory\Bills\BillUnreadable;
use App\Domains\Inventory\Bills\BillVision;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\InventoryItem;
use App\Models\Purchase;
use App\Models\PurchaseBill;
use App\Models\PurchaseReceipt;
use App\Models\Supplier;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Owner, 2026-11-15: "I have a pile of bills to enter. But I have no time. Can you add
 * … OCR so when I send an invoice it automatically reads the items, price, quantity
 * and fills the manual PO. So admin just needs to check and approve."
 */
class PurchaseBillsTest extends TestCase
{
    use RefreshDatabase;

    private InventoryItem $flour;

    /** What the fake reader was handed last. */
    public static array $asked = [];

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Storage::fake('local');
        $this->flour = InventoryItem::create(['name' => 'Flour', 'unit' => 'kg', 'unit_cost' => 10, 'is_active' => true]);
        Supplier::create(['name' => 'Agora']);
        self::$asked = [];
    }

    /** A reader that answers with this instead of calling Claude. */
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
                PurchaseBillsTest::$asked = ['mime' => $mime, 'context' => $context, 'size' => strlen($bytes)];
                if ($this->answer instanceof BillUnreadable) {
                    throw $this->answer;
                }

                return $this->answer;
            }
        });
        $this->app->forgetInstance(BillReader::class);
    }

    private function answer(array $over = []): array
    {
        return array_merge([
            'is_bill' => true, 'shop' => 'Agora', 'bill_no' => 'INV-77', 'date' => now()->subDay()->toDateString(),
            'total' => 290.0, 'gst_total' => 0, 'note' => '',
            'lines' => [
                ['name' => 'WHEAT FLOUR 1KG', 'item_id' => $this->flour->id, 'new_name' => '', 'new_unit' => '', 'quantity' => 5, 'unit' => '', 'unit_price' => 22, 'amount' => 110, 'gst' => false, 'unsure' => false],
                ['name' => 'C/COLA 500ML CTN', 'item_id' => 0, 'new_name' => 'Cola 500ml', 'new_unit' => 'bottle', 'quantity' => 1, 'unit' => 'Carton', 'unit_price' => 180, 'amount' => 180, 'gst' => true, 'unsure' => false],
            ],
        ], $over);
    }

    /** Each call a different picture: the same file twice is refused. */
    private function send(string $name = 'bill.jpg'): \Illuminate\Testing\TestResponse
    {
        static $n = 0;
        $n++;

        return $this->post('/api/purchases/bills', ['file' => UploadedFile::fake()->image($name, 600 + $n, 800)], ['Accept' => 'application/json']);
    }

    public function test_a_bill_is_kept_read_and_listed_with_its_lines_matched(): void
    {
        $this->reader($this->answer());
        Sanctum::actingAs($this->makeManager(), ['staff']);

        $id = $this->send()->assertCreated()->assertJsonPath('bill.status', 'queued')->json('bill.id');
        $read = $this->postJson("/api/purchases/bills/{$id}/read")->assertOk();

        $read->assertJsonPath('bill.status', 'ready')
            ->assertJsonPath('bill.data.shop', 'Agora')
            ->assertJsonPath('bill.data.bill_no', 'INV-77')
            ->assertJsonPath('bill.data.lines.0.item.name', 'Flour')
            ->assertJsonPath('bill.data.lines.0.quantity', 5)
            ->assertJsonPath('bill.data.lines.1.item_id', null)
            ->assertJsonPath('bill.data.lines.1.new_name', 'Cola 500ml')
            ->assertJsonPath('bill.data.lines.1.unit', 'carton')
            ->assertJsonPath('bill.data.lines_total', 290);
        // The reader is told what is on file, and gets a JPEG.
        $this->assertSame('image/jpeg', self::$asked['mime']);
        $this->assertStringContainsString($this->flour->id . ' | Flour | kg', self::$asked['context']);
        $this->assertStringContainsString('Agora', self::$asked['context']);

        $this->getJson('/api/purchases/bills')->assertOk()->assertJsonPath('enabled', true)->assertJsonCount(1, 'bills');
    }

    public function test_an_item_the_reader_made_up_is_dropped_and_a_line_that_does_not_add_up_is_marked(): void
    {
        $answer = $this->answer();
        $answer['lines'][0]['item_id'] = 99999;
        $answer['lines'][1]['amount'] = 250;
        $this->reader($answer);
        Sanctum::actingAs($this->makeManager(), ['staff']);

        $id = $this->send()->json('bill.id');
        $this->postJson("/api/purchases/bills/{$id}/read")
            ->assertJsonPath('bill.data.lines.0.item_id', null)
            ->assertJsonPath('bill.data.lines.0.unsure', false)
            ->assertJsonPath('bill.data.lines.1.unsure', true);
    }

    public function test_a_future_date_is_left_for_the_person_to_fill(): void
    {
        $this->reader($this->answer(['date' => now()->addMonth()->toDateString()]));
        Sanctum::actingAs($this->makeManager(), ['staff']);

        $id = $this->send()->json('bill.id');
        $this->postJson("/api/purchases/bills/{$id}/read")->assertJsonPath('bill.data.date', null);
    }

    public function test_a_bill_that_cannot_be_read_says_why_and_can_be_tried_again(): void
    {
        $this->reader(new BillUnreadable('The reader is busy just now. Try this bill again in a minute.', retry: true));
        Sanctum::actingAs($this->makeManager(), ['staff']);
        $id = $this->send()->json('bill.id');
        $this->postJson("/api/purchases/bills/{$id}/read")
            ->assertJsonPath('bill.status', 'failed')
            ->assertJsonPath('bill.error', 'The reader is busy just now. Try this bill again in a minute.');

        $this->reader($this->answer());
        $this->postJson("/api/purchases/bills/{$id}/read")->assertJsonPath('bill.status', 'ready');
    }

    public function test_a_picture_that_is_not_a_bill_fails(): void
    {
        $this->reader($this->answer(['is_bill' => false, 'lines' => []]));
        Sanctum::actingAs($this->makeManager(), ['staff']);
        $id = $this->send()->json('bill.id');
        $this->postJson("/api/purchases/bills/{$id}/read")->assertJsonPath('bill.status', 'failed');
    }

    public function test_the_same_file_is_not_taken_twice(): void
    {
        $this->reader($this->answer());
        Sanctum::actingAs($this->makeManager(), ['staff']);
        $file = UploadedFile::fake()->image('bill.jpg', 600, 800);
        $this->post('/api/purchases/bills', ['file' => $file], ['Accept' => 'application/json'])->assertCreated();
        $this->post('/api/purchases/bills', ['file' => $file], ['Accept' => 'application/json'])
            ->assertStatus(422)->assertJsonPath('message', 'This bill is already on the list.');
    }

    public function test_without_a_key_nothing_is_taken_and_the_screen_is_told(): void
    {
        $this->reader($this->answer(), enabled: false);
        Sanctum::actingAs($this->makeManager(), ['staff']);
        $this->getJson('/api/purchases/bills')->assertOk()->assertJsonPath('enabled', false);
        $this->send()->assertStatus(422);
        $this->assertSame(0, PurchaseBill::count());
    }

    public function test_saving_the_order_makes_the_bill_its_receipt_and_takes_it_off_the_list(): void
    {
        $this->reader($this->answer());
        Sanctum::actingAs($this->makeManager(), ['staff']);
        $id = $this->send()->json('bill.id');
        $this->postJson("/api/purchases/bills/{$id}/read")->assertJsonPath('bill.status', 'ready');

        $purchase = $this->postJson('/api/purchases', [
            'supplier_name_text' => 'Agora',
            'purchase_date' => now()->subDay()->toDateString(),
            'supplier_invoice_no' => 'INV-77',
            'bill_id' => $id,
            'paid' => 'full', 'paid_method' => 'cash',
            'items' => [['inventory_item_id' => $this->flour->id, 'name' => 'Flour', 'quantity' => 5, 'unit_cost' => 22, 'gst_rate_bp' => 0]],
        ])->assertCreated()->json('purchase.id');

        $bill = PurchaseBill::findOrFail($id);
        $this->assertSame('done', $bill->status);
        $this->assertSame($purchase, $bill->purchase_id);
        $receipt = PurchaseReceipt::where('purchase_id', $purchase)->firstOrFail();
        $this->assertSame($bill->file_path, $receipt->file_path);
        $this->assertSame('INV-77', Purchase::findOrFail($purchase)->supplier_invoice_no);
        $this->getJson('/api/purchases/bills')->assertJsonCount(0, 'bills');

        // The same bill number read again is pointed out.
        $again = $this->send('again.jpg')->json('bill.id');
        $this->postJson("/api/purchases/bills/{$again}/read")->assertJsonPath('bill.data.seen_before.purchase_id', $purchase);
    }

    public function test_a_bill_is_removed_with_its_file_and_its_file_can_be_opened_before(): void
    {
        $this->reader($this->answer());
        Sanctum::actingAs($this->makeManager(), ['staff']);
        $id = $this->send()->json('bill.id');
        $path = PurchaseBill::findOrFail($id)->file_path;

        $this->get("/api/purchases/bills/{$id}/file")->assertOk();
        $this->deleteJson("/api/purchases/bills/{$id}")->assertOk();
        $this->assertSame(0, PurchaseBill::count());
        Storage::disk('local')->assertMissing($path);
    }

    public function test_the_scheduler_reads_a_bill_the_screen_left_and_frees_one_whose_reader_died(): void
    {
        $this->reader($this->answer());
        Sanctum::actingAs($this->makeManager(), ['staff']);
        $left = $this->send('a.jpg')->json('bill.id');
        $died = $this->send('b.jpg')->json('bill.id');
        PurchaseBill::whereKey($left)->update(['updated_at' => now()->subMinutes(3)]);
        PurchaseBill::whereKey($died)->update(['status' => 'reading', 'reading_at' => now()->subMinutes(10), 'updated_at' => now()->subMinutes(10)]);
        $fresh = $this->send('c.jpg')->json('bill.id');

        $this->artisan('purchases:read-bills')->assertSuccessful();

        $this->assertSame('ready', PurchaseBill::findOrFail($left)->status);
        $this->assertSame('ready', PurchaseBill::findOrFail($died)->status);
        // Just sent: the screen is reading it, the scheduler leaves it be.
        $this->assertSame('queued', PurchaseBill::findOrFail($fresh)->status);
    }

    public function test_someone_who_cannot_make_purchases_cannot_send_or_see_bills(): void
    {
        $this->reader($this->answer());
        Sanctum::actingAs($this->makeStaff(), ['staff']);
        $this->getJson('/api/purchases/bills')->assertForbidden();
        $this->send()->assertForbidden();
    }
}

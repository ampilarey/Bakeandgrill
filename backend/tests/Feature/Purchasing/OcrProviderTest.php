<?php

declare(strict_types=1);

namespace Tests\Feature\Purchasing;

use App\Domains\Ai\AiFeatures;
use App\Domains\Inventory\Bills\BillReader;
use App\Domains\Inventory\Bills\BillReaderSettings;
use App\Domains\Inventory\Bills\BillText;
use App\Models\InventoryItem;
use App\Models\PurchaseBill;
use App\Models\Role;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Owner, 2026-11-27: "I want to add Claude, Gemini, Tesseract switch option where OCR tool is used only. Because
 * Claude and Gemini API has other uses". What reads documents is its own pick; Tesseract reads in the browser.
 */
class OcrProviderTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $role = Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'description' => 'Owner']);
        Sanctum::actingAs(User::factory()->create(['role_id' => $role->id]), ['staff']);
        Storage::fake('local');
    }

    public function test_what_reads_documents_is_picked_apart_from_the_assistants_service(): void
    {
        $settings = app(BillReaderSettings::class);
        $settings->setKey('claude', 'sk-test-claude');
        $settings->setKey('google', 'g-test');
        $settings->setProvider('claude');

        // Until one is picked, documents are read by the same service as everything else.
        $this->assertSame('claude', $this->getJson('/api/purchasing/bill-reader')->assertOk()->json('ocr_provider'));
        $this->assertSame(['claude', 'google', 'tesseract'], $this->getJson('/api/purchasing/bill-reader')->json('ocr_choices'));

        $this->putJson('/api/purchasing/bill-reader', ['ocr_provider' => 'google'])->assertOk()
            ->assertJsonPath('ocr_provider', 'google')->assertJsonPath('provider', 'claude');
        $this->assertSame('claude', $settings->provider(), 'the assistant keeps its own');
        $this->assertSame('google', $settings->ocrProvider());

        $this->putJson('/api/purchasing/bill-reader', ['ocr_provider' => 'tesseract'])->assertOk()->assertJsonPath('ocr_provider', 'tesseract');
        $this->putJson('/api/purchasing/bill-reader', ['ocr_provider' => 'abacus'])->assertStatus(422);

        // With Tesseract the server reads no scanned order (the browser does), and the assistant's other jobs go on.
        $features = app(AiFeatures::class);
        $this->assertFalse($features->on('po_scans'));
        $this->assertTrue($features->on('reply_drafts'));
    }

    public function test_tesseract_needs_no_key_and_a_bill_is_read_from_the_text_the_browser_sends(): void
    {
        app(BillReaderSettings::class)->setOcrProvider('tesseract');
        $cola = InventoryItem::create(['name' => 'Coca Cola 500ml', 'unit' => 'bottle', 'is_active' => true]);
        Supplier::create(['name' => 'Happy Market']);

        $list = $this->getJson('/api/purchases/bills')->assertOk();
        $this->assertTrue($list->json('enabled'), 'no key, and reading is still on');
        $this->assertTrue($list->json('in_browser'));

        $id = $this->post('/api/purchases/bills', ['file' => UploadedFile::fake()->image('bill.jpg', 600, 800)], ['Accept' => 'application/json'])
            ->assertCreated()->json('bill.id');
        // The server's own read leaves it waiting, and so does the scheduler.
        $this->postJson("/api/purchases/bills/{$id}/read")->assertOk()->assertJsonPath('bill.status', 'queued');
        $this->assertSame(0, app(BillReader::class)->readWaiting());

        $res = $this->postJson("/api/purchases/bills/{$id}/text", ['lines' => [
            'HAPPY MARKET PVT LTD',
            'Tel: 3331234  TIN 1000123GST501',
            'Invoice No: HM-4471   Date: 21/11/2026',
            'Coca Cola 500ml 24 x 12.50 300.00',
            'Garlic paste 1kg   2  45.00  90.00',
            'Bread loaf 25.00',
            'Sub Total 415.00',
            'GST 8% 33.20',
            'TOTAL 448.20',
            'Cash 500.00',
            'Change 51.80',
        ]])->assertOk();
        $res->assertJsonPath('bill.status', 'ready')
            ->assertJsonPath('bill.data.shop', 'Happy Market')
            ->assertJsonPath('bill.data.bill_no', 'HM-4471')
            ->assertJsonPath('bill.data.date', '2026-11-21')
            ->assertJsonPath('bill.data.total', 448.2);
        $lines = $res->json('bill.data.lines');
        $this->assertCount(3, $lines, 'the sums, the cash and the change are not goods');
        $this->assertSame($cola->id, $lines[0]['item_id']);
        $this->assertEqualsWithDelta(24, $lines[0]['quantity'], 0.001);
        $this->assertEqualsWithDelta(12.5, $lines[0]['unit_price'], 0.001);
        $this->assertFalse($lines[0]['unsure']);
        $this->assertNull($lines[1]['item_id'], 'a product not on file is left for the person');
        $this->assertSame('Garlic paste 1kg', $lines[1]['name']);
        $this->assertTrue($lines[2]['unsure'], 'one amount and no quantity: to check');
        $this->assertSame(PurchaseBill::READY, PurchaseBill::findOrFail($id)->status);
    }

    public function test_text_with_no_goods_fails_in_words_and_never_guesses(): void
    {
        app(BillReaderSettings::class)->setOcrProvider('tesseract');
        $id = $this->post('/api/purchases/bills', ['file' => UploadedFile::fake()->image('blur.jpg', 600, 800)], ['Accept' => 'application/json'])->json('bill.id');
        $this->postJson("/api/purchases/bills/{$id}/text", ['lines' => ['~~ ,, ..', 'Tel 7771234', 'Thank you']])->assertOk()
            ->assertJsonPath('bill.status', 'failed');
        $this->assertStringContainsString('type the bill', (string) PurchaseBill::findOrFail($id)->error);

        $read = app(BillText::class)->read(['Phone 3301122', 'Table 4', '12/13/2026']);
        $this->assertFalse($read['is_bill']);
        $this->assertSame('', $read['date'], 'a thirteenth month is no date');
    }
}

<?php

declare(strict_types=1);

namespace Tests\Feature\Labels;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Customer;
use App\Models\Item;
use App\Models\KitchenProductionBatch;
use App\Models\KitchenProductionItem;
use App\Models\LabelPrint;
use App\Models\TradeAccount;
use App\Models\TradeDelivery;
use App\Models\TradeDeliveryLine;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Label Hub, step 3: the A4 box label (box_label_template.py and
 * box_label_nh_kuda_rah.py), and the shortcuts from a wholesale delivery and
 * a production batch.
 */
class BoxLabelTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(), ['staff']);
    }

    public function test_the_blank_template_has_lines_to_write_on_and_eleven_empty_rows(): void
    {
        $res = $this->postJson('/api/labels/box/url', [])->assertOk();
        $html = (string) $this->get($res->json('view_url'))->assertOk()->getContent();
        $this->assertStringContainsString('BOAT / VESSEL', $html);
        $this->assertStringContainsString('DELIVERY DATE &amp; TIME', $html);
        $this->assertStringContainsString('Address / Resort:', $html);
        $this->assertStringNotContainsString('ARTICLE NAME', $html);
        $this->assertStringContainsString('size: 210mm 297mm', $html);
        $this->assertSame('box_label', LabelPrint::query()->value('kind'));

        $pdf = $this->get($res->json('pdf_url'))->assertOk();
        $this->assertSame(1, preg_match_all('#/Type\s*/Page[^s]#', (string) $pdf->getContent()));
        $this->assertStringContainsString('box-label-blank.pdf', (string) $pdf->headers->get('content-disposition'));
        $this->dump('box-blank', $html, (string) $pdf->getContent());
    }

    public function test_a_delivery_fills_the_shop_contact_lines_and_quantities_with_three_spare_rows(): void
    {
        [$delivery, $bajiya, $patties] = $this->delivery();

        $prefill = $this->getJson("/api/labels/deliveries/{$delivery->id}/box-label")->assertOk()
            ->assertJsonPath('data.fields.customer', 'NH Kuda Rah')
            ->assertJsonPath('data.fields.attn', 'Adam Firash Ali Hameed')
            ->assertJsonCount(2, 'data.lines')
            ->json('data');

        $res = $this->postJson('/api/labels/box/url', [
            'delivery' => $delivery->id,
            'lines' => $prefill['lines'],
            'customer' => $prefill['fields']['customer'],
            'attn' => $prefill['fields']['attn'],
            'contact' => 'Central Purchasing Coordinator  ·  +960 911 9368',
            'boat' => 'MGH 14', 'boat2' => 'Seamaster 17',
            'pickup' => 'T Jetty', 'pickup2' => 'Malé',
            'when' => 'Sun, 4 Oct 2026', 'when2' => '8:00 AM – 2:00 PM',
        ])->assertOk();

        $html = (string) $this->get($res->json('view_url'))->assertOk()->getContent();
        foreach (['NH Kuda Rah', 'Attn: Adam Firash Ali Hameed', 'MGH 14', 'Seamaster 17', 'T Jetty', 'Sun, 4 Oct 2026', 'ARTICLE NAME', 'FROZEN - SHORT EAT - BAJIYA-PIECE', 'FROZEN - SHORT EAT - PATTIES-PIECE'] as $needle) {
            $this->assertStringContainsString($needle, $html, $needle);
        }
        $this->assertMatchesRegularExpression('#f-j8[^>]*>40</div>#', $html, 'quantity sent');
        $this->assertMatchesRegularExpression('#f-j8[^>]*>65</div>#', $html, 'total');
        $this->assertSame(5, substr_count($html, 'width:4.4mm;height:4.4mm'), 'two lines and three spare rows, each with a tick box');

        $pdf = $this->get($res->json('pdf_url'))->assertOk();
        $this->assertStringContainsString('box-label-TD-LBL-1.pdf', (string) $pdf->headers->get('content-disposition'));
        $this->assertSame($delivery->id, LabelPrint::query()->value('trade_delivery_id'));
        $this->dump('box-delivery', $html, (string) $pdf->getContent());

        // Quantities left blank are lines to write on, and so is the total.
        $res = $this->postJson('/api/labels/box/url', ['lines' => [['id' => $bajiya->id, 'qty' => 0], ['id' => $patties->id, 'qty' => 0]], 'customer' => 'NH Kuda Rah'])->assertOk();
        $html = (string) $this->get($res->json('view_url'))->getContent();
        $this->assertDoesNotMatchRegularExpression('#f-j8[^>]*>\d+</div>#', $html);
    }

    public function test_too_many_lines_are_refused_and_the_permission_is_needed(): void
    {
        $lines = [];
        for ($i = 0; $i < 17; $i++) {
            $lines[] = ['id' => $this->makeItem()->id, 'qty' => 1];
        }
        $this->postJson('/api/labels/box/url', ['lines' => $lines])->assertUnprocessable();

        Sanctum::actingAs($this->makeManager(), ['staff']);
        $this->postJson('/api/labels/box/url', [])->assertForbidden();
    }

    public function test_a_production_line_prefills_its_stickers_with_batch_expiry_and_quantity(): void
    {
        $item = $this->makeItem(false, 0, ['name' => 'Bajiya', 'label_enabled' => true, 'label_shelf_life_days' => 90]);
        $batch = KitchenProductionBatch::create(['batch_no' => 'KP-77', 'status' => 'submitted', 'production_type' => 'prepared_stock', 'produced_by' => $this->makeKitchenStaff()->id, 'submitted_at' => now()]);
        $pi = KitchenProductionItem::create(['kitchen_production_batch_id' => $batch->id, 'item_id' => $item->id, 'produced_qty' => 200, 'unit' => 'pcs', 'status' => 'submitted', 'expires_at' => now()->addDays(60)]);

        $this->getJson("/api/labels/production-items/{$pi->id}")->assertOk()
            ->assertJsonPath('data.batch', 'KP-77')
            ->assertJsonPath('data.qty', 200)
            ->assertJsonPath('data.exp', now()->addDays(60)->toDateString())
            ->assertJsonPath('data.item.id', $item->id);

        // The batch's own expiry wins over the product's shelf life.
        $res = $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $item->id, 'copies' => 4]], 'fill' => true, 'pi' => $pi->id, 'batch' => 'KP-77'])->assertOk();
        $this->assertSame(now()->addDays(60)->toDateString(), $res->json('summary.products.0.exp'));
        $this->assertSame($pi->id, LabelPrint::query()->value('kitchen_production_item_id'));
    }

    /** @return array{0: TradeDelivery, 1: Item, 2: Item} */
    private function delivery(): array
    {
        $customer = Customer::factory()->create();
        $account = TradeAccount::create(['customer_id' => $customer->id, 'shop_name' => 'NH Kuda Rah', 'contact_name' => 'Adam Firash Ali Hameed', 'contact_phone' => '+960 911 9368', 'is_active' => true, 'missing_policy' => TradeAccount::MISSING_CHARGE]);
        $delivery = TradeDelivery::create(['trade_account_id' => $account->id, 'delivery_number' => 'TD-LBL-1', 'status' => TradeDelivery::STATUS_DISPATCHED, 'dispatched_at' => now(), 'idempotency_key' => 'lbl-1']);
        $bajiya = $this->makeItem(false, 0, ['name' => 'Bajiya']);
        $patties = $this->makeItem(false, 0, ['name' => 'Patties']);
        foreach ([[$bajiya, 40], [$patties, 25]] as [$item, $qty]) {
            TradeDeliveryLine::create(['trade_delivery_id' => $delivery->id, 'item_id' => $item->id, 'qty_sent' => $qty, 'unit_price_laar' => 500, 'unit_cost_laar' => 250]);
        }

        return [$delivery, $bajiya, $patties];
    }

    private function dump(string $name, string $html, string $pdf): void
    {
        $dir = getenv('LABEL_SHEET_DUMP');
        if (!$dir) {
            return;
        }
        @mkdir($dir, 0777, true);
        file_put_contents("{$dir}/{$name}.html", $html);
        file_put_contents("{$dir}/{$name}.pdf", $pdf);
    }
}

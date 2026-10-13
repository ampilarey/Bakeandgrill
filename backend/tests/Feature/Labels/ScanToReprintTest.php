<?php

declare(strict_types=1);

namespace Tests\Feature\Labels;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Item;
use App\Models\LabelJob;
use App\Models\LabelPrint;
use App\Models\SiteSetting;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Scan to reprint (round 11 of the usability work, owner, 2026-10-13: "scan
 * a pack's QR with the phone and reprint that exact label"): every sticker
 * print keeps the request that made it, narrowed to its own product; the
 * code on a pack gives it back, with the pack's dates and who printed it,
 * and printing it again is a new print logged as a reprint of that pack.
 */
class ScanToReprintTest extends TestCase
{
    use RefreshDatabase;

    private Item $bajiya;

    private Item $masroshi;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(['name' => 'Aminath']), ['staff']);
        CarbonImmutable::setTestNow('2026-10-13 09:00:00');
        SiteSetting::set('business_phone', '+960 912 0011');
        Cache::flush();
        $this->bajiya = $this->makeItem(false, 0, ['name' => 'Bajiya', 'label_enabled' => true, 'label_shelf_life_days' => 90]);
        $this->masroshi = $this->makeItem(false, 0, ['name' => 'Masroshi', 'label_enabled' => true, 'label_shelf_life_days' => 30]);
    }

    protected function tearDown(): void
    {
        CarbonImmutable::setTestNow();
        parent::tearDown();
    }

    public function test_a_scanned_code_gives_back_the_exact_label_and_printing_it_again_is_a_new_print_marked_as_a_reprint(): void
    {
        $res = $this->postJson('/api/labels/stickers/url', [
            'items' => [
                ['id' => $this->bajiya->id, 'copies' => 2, 'batch' => 'A1', 'qty' => 6, 'mfg' => '2026-10-10'],
                ['id' => $this->masroshi->id, 'copies' => 1],
            ],
            'layout' => 'a4-custom', 'w' => 40, 'h' => 60, 'lang' => 'dv', 'fill' => true, 'batch' => 'SHEET', 'qty' => 12,
            'rounded' => true, 'for' => 'NH Kuda Rah', 'promo' => 'text', 'promo_text' => 'NEW',
        ])->assertOk();
        $code = (string) $res->json('summary.products.0.code');
        $other = (string) $res->json('summary.products.1.code');

        // The code, typed in any case, gives the pack and the request that prints its sticker again.
        $look = $this->getJson('/api/labels/prints/' . strtolower($code))->assertOk();
        $look->assertJsonPath('data.code', $code)
            ->assertJsonPath('data.product.name', 'Bajiya')->assertJsonPath('data.product.kind', 'item')->assertJsonPath('data.product.id', $this->bajiya->id)
            ->assertJsonPath('data.copies', 2)->assertJsonPath('data.batch_code', 'A1')->assertJsonPath('data.pack_qty', 6)
            ->assertJsonPath('data.mfg_date', '2026-10-10')->assertJsonPath('data.exp_date', '2027-01-08')
            ->assertJsonPath('data.status', 'fresh')->assertJsonPath('data.days_left', 87)
            ->assertJsonPath('data.for', 'NH Kuda Rah')->assertJsonPath('data.printed_by', 'Aminath')->assertJsonPath('data.reprint_of', null)
            ->assertJsonPath('data.batch_url', '/b/' . $code)
            ->assertJsonPath('data.request.items.0.id', $this->bajiya->id)->assertJsonPath('data.request.items.0.copies', 2)->assertJsonPath('data.request.items.0.kind', 'item')
            ->assertJsonPath('data.request.items.0.batch', 'A1')->assertJsonPath('data.request.items.0.qty', 6)->assertJsonPath('data.request.items.0.mfg', '2026-10-10')
            ->assertJsonPath('data.request.lang', 'dv')->assertJsonPath('data.request.layout', 'a4-custom')->assertJsonPath('data.request.fill', true)
            ->assertJsonPath('data.request.rounded', true)->assertJsonPath('data.request.for', 'NH Kuda Rah')->assertJsonPath('data.request.for2', null)
            ->assertJsonPath('data.request.promo', 'text')->assertJsonPath('data.request.promo_text', 'NEW')
            ->assertJsonPath('data.request.batch', 'SHEET')->assertJsonPath('data.request.qty', 12)->assertJsonPath('data.request.mfg', '2026-10-13')->assertJsonPath('data.request.exp', null);
        $this->assertStringContainsString('40 × 60', (string) $look->json('data.stock'));
        $this->assertEquals(40, $look->json('data.request.w'));
        $this->assertEquals(60, $look->json('data.request.h'));
        $this->assertCount(1, $look->json('data.request.items'), 'the other product on the sheet is not part of this pack');
        $this->getJson('/api/labels/prints/' . $other)->assertOk()
            ->assertJsonPath('data.product.name', 'Masroshi')->assertJsonPath('data.request.items.0.id', $this->masroshi->id)->assertJsonPath('data.batch_code', 'SHEET')->assertJsonPath('data.request.items.0.batch', null);

        // Printing it again: the same sticker with the same details, a new code, logged as a reprint of that pack.
        $again = $this->postJson('/api/labels/stickers/url', $look->json('data.request') + ['reprint' => strtolower($code)])->assertOk();
        $new = (string) $again->json('summary.products.0.code');
        $this->assertNotSame($code, $new, 'a reprint is a print of its own');
        $again->assertJsonPath('summary.products.0.name', 'Bajiya')->assertJsonPath('summary.products.0.copies', 2)
            ->assertJsonPath('summary.products.0.batch', 'A1')->assertJsonPath('summary.products.0.qty', 6)
            ->assertJsonPath('summary.products.0.mfg', '2026-10-10')->assertJsonPath('summary.products.0.exp', '2027-01-08')->assertJsonPath('summary.products.0.for', 'NH Kuda Rah');
        $this->assertCount(1, $again->json('summary.products'));
        $html = (string) $this->get($again->json('view_url'))->assertOk()->getContent();
        $this->assertSame(2, substr_count($html, 'data-testid="sticker"'));
        $print = LabelPrint::query()->where('code', $new)->firstOrFail();
        $this->assertSame($code, $print->details['reprint_of']);
        $this->assertSame('A1', $print->batch_code);
        $this->assertSame(6, $print->pack_qty);
        $this->assertSame('2027-01-08', $print->exp_date?->toDateString());
        $this->assertSame($this->bajiya->id, $print->request['items'][0]['id'], 'the reprint keeps its request too');
        $this->getJson('/api/labels/prints')->assertOk()->assertJsonPath('data.0.code', $new)->assertJsonPath('data.0.reprint_of', $code)->assertJsonPath('data.0.reprintable', true);
        $this->getJson('/api/labels/prints/' . $new)->assertOk()->assertJsonPath('data.reprint_of', $code);
        // The saved label is the plain request: a reprint is not a label of its own kind.
        $this->assertArrayNotHasKey('reprint', (array) LabelJob::query()->latest('id')->firstOrFail()->request);
        // A code the sticker does not know is not kept as a reprint.
        $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $this->bajiya->id, 'copies' => 1]], 'layout' => 'a4-4', 'reprint' => 'PREVIEW'])->assertOk();
        $this->assertNull(LabelPrint::query()->latest('id')->firstOrFail()->details);
    }

    public function test_an_unknown_code_an_old_print_a_removed_product_and_a_pack_past_its_date_each_answer_as_they_should(): void
    {
        $this->getJson('/api/labels/prints/ZZZZ9999')->assertNotFound()
            ->assertJsonPath('message', 'No pack has the code ZZZZ9999. A code is eight letters and digits, none of 0, O, 1 or I.');
        $this->getJson('/api/labels/prints/PREVIEW')->assertNotFound();

        // A print logged before requests were kept is rebuilt from the log's columns, and prints.
        LabelPrint::create([
            'code' => 'OLDP2345', 'kind' => 'sticker_both', 'layout' => 'a4-custom', 'label_w_mm' => 40, 'label_h_mm' => 60, 'item_id' => $this->bajiya->id,
            'copies' => 3, 'mfg_date' => '2026-10-01', 'exp_date' => '2026-12-30', 'batch_code' => 'B7', 'pack_qty' => 4, 'details' => ['for' => 'Villa College'], 'output' => 'print',
        ]);
        $old = $this->getJson('/api/labels/prints/OLDP2345')->assertOk()
            ->assertJsonPath('data.request.items.0', ['id' => $this->bajiya->id, 'copies' => 3, 'kind' => 'item'])
            ->assertJsonPath('data.request.lang', 'both')->assertJsonPath('data.request.layout', 'a4-custom')->assertJsonPath('data.request.fill', true)
            ->assertJsonPath('data.request.mfg', '2026-10-01')->assertJsonPath('data.request.exp', '2026-12-30')
            ->assertJsonPath('data.request.batch', 'B7')->assertJsonPath('data.request.qty', 4)->assertJsonPath('data.request.for', 'Villa College')
            ->assertJsonPath('data.printed_by', null)->assertJsonPath('data.status', 'fresh');
        $this->assertEquals(40, $old->json('data.request.w'));
        $this->postJson('/api/labels/stickers/url', $old->json('data.request') + ['reprint' => 'OLDP2345'])->assertOk()
            ->assertJsonPath('summary.products.0.copies', 3)->assertJsonPath('summary.products.0.exp', '2026-12-30')->assertJsonPath('summary.products.0.batch', 'B7');
        $this->assertSame('OLDP2345', LabelPrint::query()->latest('id')->firstOrFail()->details['reprint_of']);

        // A pack whose product is gone is found, with nothing to print again.
        LabelPrint::query()->where('code', 'OLDP2345')->update(['item_id' => null]);
        $this->getJson('/api/labels/prints/OLDP2345')->assertOk()->assertJsonPath('data.product', null)->assertJsonPath('data.request', null);
        $this->getJson('/api/labels/prints?code=OLDP2345')->assertOk()->assertJsonPath('data.0.reprintable', false);

        // A pack past its date is found and says so; the admin asks for new dates before it prints.
        LabelPrint::create(['code' => 'EXPD2345', 'kind' => 'sticker_en', 'layout' => 'a4-4', 'item_id' => $this->masroshi->id, 'copies' => 2, 'mfg_date' => '2026-07-01', 'exp_date' => '2026-10-09', 'output' => 'print']);
        $this->getJson('/api/labels/prints/EXPD2345')->assertOk()->assertJsonPath('data.status', 'expired')->assertJsonPath('data.days_left', -4)->assertJsonPath('data.request.exp', '2026-10-09');
    }

    public function test_the_lookup_needs_print_labels_and_the_pack_page_offers_staff_the_reprint(): void
    {
        LabelPrint::create(['code' => 'PACK2345', 'kind' => 'sticker_en', 'layout' => 'a4-4', 'item_id' => $this->bajiya->id, 'copies' => 2, 'mfg_date' => '2026-10-10', 'exp_date' => '2027-01-08', 'output' => 'print']);
        $manager = $this->makeManager();
        Sanctum::actingAs($manager, ['staff']);
        $this->getJson('/api/labels/prints/PACK2345')->assertForbidden();
        $manager->grantPermission('labels.print');
        Sanctum::actingAs($manager->fresh(), ['staff']);
        $this->getJson('/api/labels/prints/PACK2345')->assertOk()->assertJsonPath('data.product.name', 'Bajiya');

        // The pack page, which a phone's camera opens from the QR, offers staff the way to this label.
        $this->get('/b/PACK2345')->assertOk()->assertSee('Staff: print this sticker again')->assertSee('/admin/labels/stickers?code=PACK2345');
        LabelPrint::query()->where('code', 'PACK2345')->update(['item_id' => null]);
        $this->get('/b/PACK2345')->assertOk()->assertDontSee('Staff: print this sticker again');
    }
}

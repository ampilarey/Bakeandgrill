<?php

declare(strict_types=1);

namespace Tests\Feature\Labels;

use App\Domains\Labels\BatchLink;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Item;
use App\Models\LabelPrint;
use App\Models\SiteSetting;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The batch QR (2026-10-12): every print gets a code, the sticker carries it
 * as a QR in the header, and the code opens the pack's public page with the
 * dates, batch, ingredients and allergens.
 */
class LabelBatchTest extends TestCase
{
    use RefreshDatabase;

    private Item $bajiya;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(['name' => 'Zebedee Printsalot']), ['staff']);
        CarbonImmutable::setTestNow('2026-10-12 09:00:00');
        SiteSetting::set('business_phone', '+960 912 0011');
        Cache::flush();
        $this->bajiya = $this->makeItem(false, 0, [
            'name' => 'Bajiya', 'name_dv' => 'ބާޖިޔާ', 'base_price' => 3.5, 'label_enabled' => true, 'label_shelf_life_days' => 90,
            'label_ingredients_source' => 'manual',
            'label_ingredients' => 'Flour, salt, oil, egg, onion, smoked tuna',
            'allergens' => ['egg', 'tree-nuts'],
            'spice_level' => 'hot',
        ]);
    }

    protected function tearDown(): void
    {
        CarbonImmutable::setTestNow();
        parent::tearDown();
    }

    /** @return array{0: string, 1: array<string, string>} the sheet and the link's query */
    private function sheetWithQuery(array $body): array
    {
        $res = $this->postJson('/api/labels/stickers/url', $body)->assertOk();
        parse_str((string) parse_url((string) $res->json('view_url'), PHP_URL_QUERY), $query);

        return [(string) $this->get($res->json('view_url'))->assertOk()->getContent(), $query];
    }

    public function test_every_print_gets_a_code_the_sticker_carries_as_a_qr_that_opens_the_packs_page(): void
    {
        $res = $this->postJson('/api/labels/stickers/url', [
            'items' => [['id' => $this->bajiya->id, 'copies' => 2]], 'layout' => 'a4-4', 'fill' => true, 'batch' => '261012', 'qty' => 10,
        ])->assertOk();
        $code = (string) $res->json('summary.products.0.code');
        $this->assertMatchesRegularExpression('/^[A-HJ-NP-Z2-9]{8}$/', $code, 'eight letters and digits, none that read alike');
        $print = LabelPrint::query()->where('code', $code)->firstOrFail();
        $this->assertSame($this->bajiya->id, $print->item_id);
        $this->assertSame('2027-01-10', $print->exp_date?->toDateString());

        // The link names the code per product and the sheet draws its QR in the header.
        parse_str((string) parse_url((string) $res->json('view_url'), PHP_URL_QUERY), $query);
        $this->assertSame('i' . $this->bajiya->id . ':' . $code, $query['b']);
        $html = (string) $this->get($res->json('view_url'))->assertOk()->getContent();
        $this->assertStringContainsString(BatchLink::qr($code), $html);
        $this->assertStringContainsString('left:84.5mm;top:12.5mm;width:13mm;height:13mm', $html, '13 mm at the header\'s end');

        // The code opens the pack's page: dates and whether it is still good, batch, pack size, ingredients, allergens.
        $page = $this->get('/b/' . $code)->assertOk();
        $page->assertSee('Bajiya')
            ->assertSee('ބާޖިޔާ')
            ->assertSee('12 / 10 / 2026')
            ->assertSee('10 / 01 / 2027')
            ->assertSee('Good for 90 more days')
            ->assertSee('261012')
            ->assertSee('10 PCS')
            ->assertSee('<strong>egg</strong>', false)
            ->assertSee('smoked tuna')
            ->assertSee('egg, tree nuts')
            ->assertSee('KEEP FROZEN')
            ->assertSee('complain?from=label&amp;order=Pack%20' . $code, false);
        $this->assertStringContainsString('name="robots" content="noindex"', (string) $page->getContent());
        $this->assertStringNotContainsString('Zebedee', (string) $page->getContent(), 'nothing about who printed it');

        // A phone that scans in lower case lands too.
        $this->get('/b/' . strtolower($code))->assertOk()->assertSee('Bajiya');
        // An unknown code gets a page that says so.
        $this->get('/b/ZZZZ9999')->assertNotFound()->assertSee('We could not find this pack')->assertSee('ZZZZ9999');
    }

    public function test_the_page_says_when_the_pack_is_past_its_date_or_due_today(): void
    {
        $print = LabelPrint::create(['code' => 'EXPD2345', 'kind' => 'sticker_en', 'layout' => 'a4-4', 'item_id' => $this->bajiya->id, 'copies' => 2, 'mfg_date' => '2026-07-01', 'exp_date' => '2026-10-09', 'output' => 'print']);
        $this->get('/b/EXPD2345')->assertOk()->assertSee('Past its date by 3 days');
        $print->forceFill(['exp_date' => '2026-10-12'])->save();
        $this->get('/b/EXPD2345')->assertOk()->assertSee('Use today');
        $print->forceFill(['exp_date' => '2026-10-13'])->save();
        $this->get('/b/EXPD2345')->assertOk()->assertSee('Use by tomorrow');
        // A product removed from the menu: the dates still stand.
        $print->forceFill(['item_id' => null])->save();
        $this->get('/b/EXPD2345')->assertOk()->assertSee('no longer on our list')->assertSee('Use by tomorrow');
    }

    public function test_a_preview_shows_the_qr_but_logs_nothing_and_its_code_opens_nothing(): void
    {
        [$html, $query] = $this->sheetWithQuery(['items' => [['id' => $this->bajiya->id, 'copies' => 1]], 'layout' => 'a4-4', 'preview' => true]);
        $this->assertSame('i' . $this->bajiya->id . ':PREVIEW', $query['b']);
        $this->assertStringContainsString(BatchLink::qr('PREVIEW'), $html, 'the preview looks as the print will');
        $this->assertSame(0, LabelPrint::query()->count());
        $this->get('/b/PREVIEW')->assertNotFound();
    }

    public function test_the_batch_qr_has_a_switch_and_prints_on_the_compact_sticker_only_where_it_is_wide_enough(): void
    {
        [$html, $query] = $this->sheetWithQuery(['items' => [['id' => $this->bajiya->id, 'copies' => 1]], 'layout' => 'a4-8']);
        $code = explode(':', $query['b'])[1];
        $this->assertStringContainsString(BatchLink::qr($code), $html, 'the 99 × 70 mm compact sticker carries it in its band');
        [$html, $query] = $this->sheetWithQuery(['items' => [['id' => $this->bajiya->id, 'copies' => 1]], 'layout' => 'a4-12']);
        $this->assertStringNotContainsString(BatchLink::qr(explode(':', $query['b'])[1]), $html, 'the 66 mm one has no room beside the heading');

        $this->putJson('/api/labels/settings', ['label_batch_qr' => '0'])->assertOk()->assertJsonPath('data.label_batch_qr', '0');
        [$html, $query] = $this->sheetWithQuery(['items' => [['id' => $this->bajiya->id, 'copies' => 1]], 'layout' => 'a4-4']);
        $this->assertStringNotContainsString(BatchLink::qr(explode(':', $query['b'])[1]), $html, 'off: the print is still logged with a code, the sticker just does not carry it');
        $this->assertSame(3, LabelPrint::query()->whereNotNull('code')->count());
    }

    public function test_the_print_log_lists_the_code_with_its_page_and_a_reprint_is_a_new_code(): void
    {
        $res = $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $this->bajiya->id, 'copies' => 1]], 'layout' => 'a4-4'])->assertOk();
        $code = (string) $res->json('summary.products.0.code');
        $this->getJson('/api/labels/prints')->assertOk()
            ->assertJsonPath('data.0.code', $code)
            ->assertJsonPath('data.0.batch_url', '/b/' . $code);
        $this->getJson('/api/labels/prints?code=' . strtolower($code))->assertOk()->assertJsonCount(1, 'data');
        $this->getJson('/api/labels/prints?code=NOPE1234')->assertOk()->assertJsonCount(0, 'data');

        $again = $this->postJson('/api/labels/jobs/' . $res->json('job.id') . '/print')->assertOk();
        $this->assertNotSame($code, $again->json('summary.products.0.code'), 'a label printed again is a new batch');
        $this->assertSame(2, LabelPrint::query()->count());
    }
}

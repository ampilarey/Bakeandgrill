<?php

declare(strict_types=1);

namespace Tests\Feature\Labels;

use App\Domains\Labels\StickerSheet;
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
 * Variable runs (round 10 of the usability work, owner, 2026-10-13: "one
 * label per line of a catering order or wholesale delivery, each with its
 * own name, date and batch, printed in one go"): a row of a sticker request
 * may carry its own batch, quantity, dates and packed-for, which print on
 * that product's stickers instead of the sheet's, reach the print log, the
 * sheet link and the saved label, and are checked as the sheet's are.
 */
class VariableRunsTest extends TestCase
{
    use RefreshDatabase;

    private Item $bajiya;

    private Item $masroshi;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(), ['staff']);
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

    public function test_each_row_prints_with_its_own_details_and_the_log_the_link_and_the_saved_label_keep_them(): void
    {
        $res = $this->postJson('/api/labels/stickers/url', [
            'items' => [
                ['id' => $this->bajiya->id, 'copies' => 2, 'batch' => 'A1', 'qty' => 6, 'mfg' => '2026-10-10'],
                ['id' => $this->masroshi->id, 'copies' => 1, 'batch' => 'B2', 'for' => 'NH Kuda Rah', 'for2' => 'Friday boat'],
            ],
            'layout' => 'a4-4', 'fill' => true, 'batch' => 'SHEET', 'qty' => 12,
        ])->assertOk();
        // Each product's own details, the sheet's where a row says nothing.
        $res->assertJsonPath('summary.products.0.batch', 'A1')->assertJsonPath('summary.products.0.qty', 6)->assertJsonPath('summary.products.0.mfg', '2026-10-10')->assertJsonPath('summary.products.0.exp', '2027-01-08')->assertJsonPath('summary.products.0.varied', true)
            ->assertJsonPath('summary.products.1.batch', 'B2')->assertJsonPath('summary.products.1.qty', 12)->assertJsonPath('summary.products.1.mfg', '2026-10-13')->assertJsonPath('summary.products.1.exp', '2026-11-12')->assertJsonPath('summary.products.1.for', 'NH Kuda Rah');
        $html = (string) $this->get($res->json('view_url'))->assertOk()->getContent();
        foreach (['BATCH NO: A1', 'BATCH NO: B2', 'QTY: 6', 'QTY: 12', '10 / 10 / 2026', '08 / 01 / 2027', 'NH Kuda Rah', 'Friday boat'] as $text) {
            $this->assertStringContainsString($text, $html, $text);
        }
        $this->assertStringNotContainsString('BATCH NO: SHEET', $html, 'every row had its own batch');
        $this->assertSame(3, substr_count($html, 'data-testid="sticker"'));
        $this->get($res->json('pdf_url'))->assertOk();

        // The print log keeps each product's own batch, quantity and packed-for.
        $logs = LabelPrint::query()->orderBy('id')->get();
        $this->assertSame(['A1', 'B2'], $logs->pluck('batch_code')->all());
        $this->assertSame([6, 12], $logs->pluck('pack_qty')->all());
        $this->assertNull($logs[0]->details);
        $this->assertSame(['for' => 'NH Kuda Rah', 'for2' => 'Friday boat'], $logs[1]->details);

        // The saved label replays the rows as they were.
        $job = $res->json('job.id');
        $this->postJson("/api/labels/jobs/{$job}/print")->assertOk()->assertJsonPath('summary.products.0.batch', 'A1')->assertJsonPath('summary.products.1.for', 'NH Kuda Rah');
        $this->assertSame('A1', $this->getJson("/api/labels/jobs/{$job}")->json('data.request.items.0.batch'));
    }

    public function test_a_rows_details_are_checked_as_the_sheets_are_and_dates_follow_the_fill_switch(): void
    {
        $row = fn (array $extra) => ['items' => [['id' => $this->bajiya->id, 'copies' => 1] + $extra], 'layout' => 'a4-4', 'fill' => true];
        $this->postJson('/api/labels/stickers/url', $row(['qty' => 0]))->assertUnprocessable();
        $this->postJson('/api/labels/stickers/url', $row(['mfg' => '2026-11-30']))->assertUnprocessable()->assertJsonPath('message', 'A made-on date is more than a week away. Check the dates.');
        $this->postJson('/api/labels/stickers/url', $row(['mfg' => '2026-10-12', 'exp' => '2026-10-11']))->assertUnprocessable()->assertJsonPath('message', 'An expiry date is before its made-on date.');
        $this->postJson('/api/labels/stickers/url', $row(['exp' => '2026-10-01']))->assertUnprocessable()->assertJsonPath('message', 'An expiry date has already passed.');
        $this->postJson('/api/labels/stickers/url', $row(['batch' => str_repeat('x', 31)]))->assertUnprocessable();
        // Dates not filled in: a row's dates are left out like the sheet's.
        $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $this->bajiya->id, 'copies' => 1, 'mfg' => '2026-10-10', 'batch' => 'A1']], 'layout' => 'a4-4', 'fill' => false, 'preview' => true])
            ->assertOk()->assertJsonPath('summary.products.0.mfg', null)->assertJsonPath('summary.products.0.batch', 'A1');
        // A row's own made-on date gives its own expiry from the shelf life, even when the sheet has an expiry typed.
        $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $this->bajiya->id, 'copies' => 1, 'mfg' => '2026-10-10']], 'layout' => 'a4-4', 'fill' => true, 'exp' => '2026-12-31', 'preview' => true])
            ->assertOk()->assertJsonPath('summary.products.0.exp', '2027-01-08');
    }

    public function test_a_sheet_link_carries_the_rows_and_a_plain_request_carries_none(): void
    {
        $req = StickerSheet::normalise(['items' => [['id' => $this->bajiya->id, 'copies' => 1, 'batch' => 'A1'], ['id' => $this->masroshi->id, 'copies' => 1]], 'layout' => 'a4-4']);
        $this->assertSame(['batch' => 'A1'], $req['items'][0]['run']);
        $this->assertSame([], $req['items'][1]['run']);
        $this->assertSame('[{"batch":"A1"},{}]', StickerSheet::runsParam($req['items']));
        $back = StickerSheet::normalise(['items' => StickerSheet::itemsParam($req['items']), 'runs' => StickerSheet::runsParam($req['items']), 'layout' => 'a4-4']);
        $this->assertSame(['batch' => 'A1'], $back['items'][0]['run']);
        $plain = StickerSheet::normalise(['items' => "{$this->bajiya->id}:2", 'layout' => 'a4-4']);
        $this->assertNull(StickerSheet::runsParam($plain['items']));
        $this->assertSame([], $plain['items'][0]['run']);
    }
}

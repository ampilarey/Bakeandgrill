<?php

declare(strict_types=1);

namespace Tests\Feature\Labels;

use App\Domains\Labels\LabelRaster;
use App\Domains\Labels\LabelSpots;
use App\Domains\Labels\StickerSheet;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Item;
use App\Models\SiteSetting;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Tap to edit on every label (round 3 of the usability work, owner,
 * 2026-10-13: "Still its v confusing and not user friendly"): every design
 * marks where each part lands, the sticker summary and the draft preview
 * carry the boxes (`spots`), and no marker ever reaches a renderer.
 */
class LabelSpotsTest extends TestCase
{
    use RefreshDatabase;

    private Item $bajiya;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        CarbonImmutable::setTestNow('2026-10-13 09:00:00');
        SiteSetting::set('business_phone', '+960 912 0011');
        SiteSetting::set('business_website', 'bakeandgrill.mv');
        Cache::flush();
        $this->bajiya = $this->makeItem(false, 0, [
            'name' => 'Bajiya', 'name_dv' => 'ބާޖިޔާ', 'label_enabled' => true, 'label_shelf_life_days' => 90,
            'label_ingredients_source' => 'manual',
            'label_ingredients' => 'Flour, salt, oil, onion, ginger, chilli, lemon, curry leaves, smoked tuna',
            'label_ingredients_dv' => 'ފުށް، ލޮނު، ތެޔޮ، ފިޔާ، އިނގުރު، މިރުސް، ލުނބޯ، ހިކަނދިފަތް، ވަޅޯމަސް',
            'label_note' => 'Contains gluten',
            'label_how_to_use' => 'Thaw 10 min. Deep fry 4 to 5 min until golden.',
            'label_barcode' => '5901234123457',
            'label_show_price' => true, 'label_price' => 12.5,
            'label_net_weight' => '250 g',
        ]);
    }

    protected function tearDown(): void
    {
        CarbonImmutable::setTestNow();
        parent::tearDown();
    }

    public function test_markers_become_boxes_and_never_reach_a_renderer(): void
    {
        $pieces = [
            ['t' => 'rect', 'x' => 0, 'y' => 0, 'w' => 10, 'h' => 10, 'fill' => '#fff'],
            LabelSpots::open('name'),
            ['t' => 'text', 'x' => 5, 'base' => 20, 'w' => 40, 'align' => 'c', 'font' => 'j8', 'pt' => 10, 'color' => '#000', 'text' => 'Bajiya'],
            ['t' => 'img', 'x' => 50, 'y' => 12, 'w' => 8, 'h' => 6, 'src' => 'x'],
            LabelSpots::close(),
            ['t' => 'line', 'x' => 0, 'y' => 30, 'w' => 10, 'color' => '#000', 'sw' => 0.2],
            LabelSpots::open('note'),
            ['t' => 'text', 'x' => 5, 'base' => 40, 'w' => 40, 'align' => 'c', 'font' => 'j7', 'pt' => 6, 'color' => '#000', 'text' => '   '],
            LabelSpots::at('batch', 1, 2, 3, 4),
            ['t' => 'text', 'x' => 90, 'base' => 90, 'w' => 5, 'align' => 'c', 'font' => 'j7', 'pt' => 6, 'color' => '#000', 'text' => 'not collected'],
            LabelSpots::open('dates'),
            ['t' => 'line', 'x' => 10, 'y' => 50, 'w' => 20, 'color' => '#000', 'sw' => 0.5],
        ];

        $this->assertSame(['rect', 'text', 'img', 'line', 'text', 'text', 'line'], array_column(LabelSpots::strip($pieces), 't'));

        $spots = LabelSpots::spots($pieces);
        $this->assertSame(['name', 'batch', 'dates'], array_column($spots, 'key'), 'a run with nothing drawn (the blank note) gives no box');
        // The name's box holds the text (its ascent and descent at 10 pt) and the picture (whose top is higher).
        $name = $spots[0];
        $this->assertSame(5.0, $name['x']);
        $this->assertSame(58.0, round($name['x'] + $name['w'], 2));
        $this->assertSame(12.0, $name['y']);
        $this->assertGreaterThan(20.0, round($name['y'] + $name['h'], 2));
        $this->assertSame(['key' => 'batch', 'x' => 1.0, 'y' => 2.0, 'w' => 3.0, 'h' => 4.0], $spots[1]);
        $this->assertSame(['key' => 'dates', 'x' => 10.0, 'y' => 49.5, 'w' => 20.0, 'h' => 1.0], $spots[2]);
    }

    public function test_every_design_says_where_its_parts_are_and_the_sheet_still_draws(): void
    {
        $sizes = [
            'full' => ['layout' => 'single-105x148', 'w' => null, 'h' => null, 'W' => 105.0, 'H' => 148.5],
            'mini' => ['layout' => 'single-custom', 'w' => 99, 'h' => 70.5, 'W' => 99.0, 'H' => 70.5],
            'small' => ['layout' => 'single-custom', 'w' => 60, 'h' => 40, 'W' => 60.0, 'H' => 40.0],
            'round' => ['layout' => 'single-round-custom', 'w' => 60, 'h' => null, 'W' => 60.0, 'H' => 60.0],
        ];
        $must = [
            'full' => ['brand', 'heading', 'name', 'barcode', 'photo', 'ingredients', 'how_to_use', 'note', 'dates', 'batch', 'qty', 'price', 'storage', 'footer'],
            'mini' => ['brand', 'heading', 'name', 'footer', 'storage', 'batch', 'qty', 'dates', 'ingredients'],
            'small' => ['brand', 'heading', 'name', 'dates', 'storage', 'footer'],
            'round' => ['brand', 'heading', 'name', 'ingredients', 'dates', 'storage', 'footer'],
        ];
        foreach ($sizes as $design => $size) {
            foreach (['en', 'dv'] as $lang) {
                $res = $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $this->bajiya->id, 'copies' => 2]], 'layout' => $size['layout'], 'w' => $size['w'], 'h' => $size['h'], 'fill' => true, 'lang' => $lang, 'preview' => true])->assertOk()->json();
                $this->assertSame($design, $res['summary']['design'], "$design $lang");
                $spots = $res['summary']['spots'];
                $keys = array_values(array_unique(array_column($spots, 'key')));
                // The Dhivehi sticker has no Dhivehi note or how-to-use typed here, and its batch line carries no price.
                $wanted = $lang === 'dv' ? array_diff($must[$design], ['how_to_use', 'note', 'price']) : $must[$design];
                foreach ($wanted as $key) {
                    $this->assertContains($key, $keys, "$design in $lang marks its $key");
                }
                foreach ($spots as $s) {
                    $this->assertContains($s['key'], LabelSpots::KEYS, "$design $lang: {$s['key']} is a known part");
                    $this->assertGreaterThan(0, $s['w'], "$design $lang: {$s['key']} has width");
                    $this->assertGreaterThan(0, $s['h'], "$design $lang: {$s['key']} has height");
                    $this->assertGreaterThanOrEqual(-1.0, $s['x'], "$design $lang: {$s['key']} starts on the label");
                    $this->assertGreaterThanOrEqual(-1.0, $s['y'], "$design $lang: {$s['key']} starts on the label");
                    $this->assertLessThanOrEqual($size['W'] + 1.0, $s['x'] + $s['w'], "$design $lang: {$s['key']} ends on the label");
                    $this->assertLessThanOrEqual($size['H'] + 1.0, $s['y'] + $s['h'], "$design $lang: {$s['key']} ends on the label");
                }
                // The sheet itself draws as before: no marker is a piece.
                $this->get($res['view_url'])->assertOk()->assertDontSee('"field"');
            }
        }
        // The full sticker in order of drawing: the header first, the footer last; the batch and the quantity each with a box of their own.
        $res = $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $this->bajiya->id, 'copies' => 1]], 'layout' => 'single-105x148', 'fill' => true, 'preview' => true])->assertOk()->json();
        $keys = array_column($res['summary']['spots'], 'key');
        $this->assertSame('brand', $keys[0]);
        $this->assertSame('footer', $keys[count($keys) - 1]);
        $this->assertLessThan(array_search('footer', $keys, true), array_search('storage', $keys, true));
        $byKey = array_column($res['summary']['spots'], null, 'key');
        $this->assertLessThan($byKey['qty']['x'], $byKey['price']['x'] + 1.0, 'the price sits before the quantity');
        $this->assertLessThan($byKey['price']['x'] + $byKey['price']['w'], $byKey['batch']['x'] + 1.0);

        // The thermal rasteriser reads every piece it is given: the markers are gone before it does.
        $req = StickerSheet::normalise(['items' => [['id' => $this->bajiya->id, 'copies' => 1]], 'layout' => 'single-custom', 'w' => 60, 'h' => 40, 'fill' => true]);
        $build = app(StickerSheet::class)->build($req);
        foreach ($build['pages'] as $page) {
            foreach ($page as $sticker) {
                $this->assertNotContains(LabelSpots::MARK, array_column($sticker, 't'));
            }
        }
        $this->assertSame(480, LabelRaster::page($build, 0, 203)['w']);
    }

    public function test_a_custom_draft_preview_says_where_its_parts_are_and_a_wrap_label_keeps_its_strips(): void
    {
        $draft = $this->postJson('/api/labels/custom/preview', ['name' => 'Garlic Sauce', 'label_ingredients' => 'Garlic, oil, lemon, salt', 'layout' => 'single-105x148'])->assertOk()->json();
        $this->assertSame('full', $draft['design']);
        $keys = array_column($draft['spots'], 'key');
        foreach (['brand', 'heading', 'name', 'ingredients', 'dates', 'storage', 'footer'] as $key) {
            $this->assertContains($key, $keys);
        }
        $this->assertNull($draft['wrap']);

        // A wrap-around label is touched by its strips (round 2); it has no spots of its own.
        $wrap = $this->postJson('/api/labels/custom/preview', ['name' => 'Lime Soda', 'label_barcode' => '96385074', 'layout' => 'single-custom', 'w' => 180, 'h' => 40])->assertOk()->json();
        $this->assertSame('wrap', $wrap['design']);
        $this->assertNotEmpty($wrap['wrap']['strips']);
        $this->assertSame([], $wrap['spots']);
    }
}

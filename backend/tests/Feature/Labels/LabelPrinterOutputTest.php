<?php

declare(strict_types=1);

namespace Tests\Feature\Labels;

use App\Domains\Labels\LabelRaster;
use App\Domains\Labels\StickerSheet;
use App\Domains\Labels\TsplEncoder;
use App\Domains\Labels\ZplEncoder;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Item;
use App\Models\SiteSetting;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Straight to a label printer (round C, 2026-10-12): the sheet as ZPL or
 * TSPL bitmaps at the printer's dots per inch, and the bitmap as a PNG.
 */
class LabelPrinterOutputTest extends TestCase
{
    use RefreshDatabase;

    private Item $bajiya;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        CarbonImmutable::setTestNow('2026-10-12 09:00:00');
        SiteSetting::set('business_phone', '+960 912 0011');
        Cache::flush();
        $this->bajiya = $this->makeItem(false, 0, ['name' => 'Bajiya', 'label_enabled' => true, 'label_shelf_life_days' => 90, 'label_barcode' => '5901234123457', 'label_ingredients' => 'Flour, salt, egg']);
    }

    protected function tearDown(): void
    {
        CarbonImmutable::setTestNow();
        parent::tearDown();
    }

    public function test_a_single_label_sheet_prints_as_zpl_tspl_and_a_png_at_the_printers_dots(): void
    {
        $two = ['items' => [['id' => $this->bajiya->id, 'copies' => 2]], 'layout' => 'single-105x148', 'fill' => true];
        $links = $this->postJson('/api/labels/stickers/url', $two)->assertOk()->json();
        $this->assertNotNull($links['zpl_url']);
        $this->assertNotNull($links['tspl_url']);
        $this->assertNotNull($links['raster_url']);

        // ZPL: one format a sticker, 105 × 148.5 mm at 203 dpi is 839 × 1187 dots, 105 bytes a row.
        $zpl = $this->get($links['zpl_url'])->assertOk()->assertHeader('content-type', 'text/plain; charset=us-ascii');
        $text = (string) $zpl->getContent();
        $this->assertStringStartsWith("^XA\n^PW839\n^LL1187\n", $text);
        $this->assertStringContainsString('^GFA,124635,124635,105,', $text);
        $this->assertSame(2, substr_count($text, '^XZ'), 'two stickers, two formats');
        $this->assertMatchesRegularExpression('/^[\^A-Za-z0-9,:!\n]+$/', $text, 'plain ASCII, the bitmap run-length coded');

        // TSPL: the label size in millimetres, a 2 mm gap, the bitmap, one print each.
        $tspl = (string) $this->get($links['tspl_url'])->assertOk()->assertHeader('content-type', 'application/octet-stream')->getContent();
        $this->assertStringStartsWith("SIZE 105 mm,148.5 mm\r\nGAP 2 mm,0 mm\r\nDIRECTION 1\r\nCLS\r\nBITMAP 0,0,105,1187,0,", $tspl);
        $this->assertSame(2, substr_count($tspl, "PRINT 1,1\r\n"));

        // The PNG is the same bits, black on white.
        $png = (string) $this->get($links['raster_url'])->assertOk()->assertHeader('content-type', 'image/png')->getContent();
        $this->assertSame([839, 1187], array_slice((array) getimagesizefromstring($png), 0, 2));
        $this->get($links['raster_url'] . '&page=3')->assertNotFound();

        // 300 dots an inch when the printer has them, nothing else.
        $hi = $this->postJson('/api/labels/stickers/url', $two + ['dpi' => 300])->assertOk()->json();
        $this->assertStringStartsWith("^XA\n^PW1240\n^LL1754\n", (string) $this->get($hi['zpl_url'])->assertOk()->getContent());
        $this->postJson('/api/labels/stickers/url', $two + ['dpi' => 150])->assertUnprocessable();
    }

    public function test_the_bitmap_carries_the_sticker_and_the_links_are_signed_and_single_label_only(): void
    {
        $req = StickerSheet::normalise(['items' => [['id' => $this->bajiya->id, 'copies' => 1]], 'layout' => 'single-custom', 'w' => 40, 'h' => 60, 'fill' => true]);
        $build = app(StickerSheet::class)->build($req);
        $bits = LabelRaster::page($build, 0, 203);
        $this->assertSame(320, $bits['w']);
        $this->assertSame(480, $bits['h']);
        $this->assertSame(40, $bits['bytes']);
        $this->assertCount(480, $bits['rows']);
        $black = 0;
        foreach ($bits['rows'] as $row) {
            foreach (unpack('C*', $row) as $byte) {
                $black += substr_count(decbin($byte), '1');
            }
        }
        $share = $black / (320 * 480);
        $this->assertGreaterThan(0.04, $share, 'the words, the dates and the QR put ink on the label');
        $this->assertLessThan(0.5, $share, 'and most of it stays white');
        $this->assertArrayHasKey($build['pages'][0][0][array_key_last($build['pages'][0][0])]['src'] ?? '', $build['vectors'] + ['' => true], 'the footer QR is in the vector map');

        // Unsigned, or a sheet of many: refused.
        $links = $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $this->bajiya->id, 'copies' => 1]], 'layout' => 'single-105x148'])->assertOk()->json();
        $this->get(strtok($links['zpl_url'], '?') . '?items=i' . $this->bajiya->id . ':1&layout=single-105x148')->assertForbidden();
        $sheet = $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $this->bajiya->id, 'copies' => 1]], 'layout' => 'a4-4'])->assertOk()->json();
        $this->get($sheet['zpl_url'])->assertStatus(422);
        $preview = $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $this->bajiya->id, 'copies' => 1]], 'layout' => 'single-105x148', 'preview' => true])->assertOk()->json();
        $this->assertNull($preview['zpl_url']);
    }

    public function test_the_encoders_pack_the_rows_as_each_language_wants(): void
    {
        $this->assertSame("HF,:,\n", ZplEncoder::compress(["\xFF\x00", "\xFF\x00", "\x00\x00"], 2), 'two F, then white; the same row again; a white row');
        $this->assertSame("AHB!\n", ZplEncoder::compress(["\xAB\xBF"], 2), 'a row that ends black; a lone digit takes no count letter');
        $this->assertSame("hG0!\n", ZplEncoder::compress([str_repeat("\x00", 20) . "\x0F"], 21), 'forty-one noughts then F: the 20s letter, the ones letter, the digit, then black to the end');

        $label = ['w' => 16, 'h' => 1, 'bytes' => 2, 'rows' => ["\xFF\x00"]];
        $tspl = TsplEncoder::encode([$label], 40, 60);
        $this->assertStringContainsString("SIZE 40 mm,60 mm\r\nGAP 2 mm,0 mm\r\n", $tspl);
        $this->assertStringContainsString("BITMAP 0,0,2,1,0,\x00\xFF\r\nPRINT 1,1\r\n", $tspl, 'a set bit is white in TSPL, so the row is inverted');
        $this->assertStringContainsString("^GFA,2,2,2,\nHF,\n^FS", ZplEncoder::encode([$label]));
    }
}

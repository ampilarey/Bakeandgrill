<?php

declare(strict_types=1);

namespace Tests\Feature\Labels;

use App\Domains\Labels\LabelRaster;
use App\Domains\Labels\StickerLayouts;
use App\Domains\Labels\StickerSheet;
use App\Domains\Labels\WrapConfig;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\CustomLabel;
use App\Models\Item;
use App\Models\SiteSetting;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Wrap-around labels (owner, 2026-10-12: a juice bottle's label "with 2, 3,
 * 4, 5 different parts"): a wide, short label whose parts sit side by side
 * with a flavour band along the bottom, from WrapConfig on the product.
 */
class WrapLabelTest extends TestCase
{
    use RefreshDatabase;

    private int $juice;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        CarbonImmutable::setTestNow('2026-10-12 09:00:00');
        SiteSetting::set('business_phone', '+960 912 0011');
        Cache::flush();
        $this->juice = $this->postJson('/api/labels/custom', [
            'name' => 'Cranberry Juice',
            'name_dv' => 'ކްރޭންބެރީ ޖޫސް',
            'label_ingredients' => 'Water, cranberry juice from concentrate (26%), aronia, lemon, sugar, natural flavouring',
            'label_net_weight' => '0.2 L',
            'label_barcode' => '5901234123457',
            'label_nutrition' => 'Energy 55 kcal · Fat <0.5 g · Carbs 12 g · Protein <0.5 g · Salt 0 g',
            'label_nutrition_per' => 'ml',
            'label_shelf_life_days' => 365,
            'label_wrap' => [
                'parts' => ['brand', 'legal', 'nutrition', 'dates', 'barcode', 'qr', 'marks', 'text', 'packed'],
                'band' => true,
                'band_text' => 'Cranberry',
                'band_text_dv' => 'ކްރޭންބެރީ',
                'marks' => ['recycle', 'pet', 'dispose'],
                'text_heading' => 'Fruit content 29%',
                'text' => 'Shake well before serving. Once opened, keep refrigerated and drink within 3 days.',
            ],
        ])->assertCreated()->json('data.id');
    }

    protected function tearDown(): void
    {
        CarbonImmutable::setTestNow();
        parent::tearDown();
    }

    private function sheet(array $extra = [], array $size = ['w' => 180, 'h' => 40]): array
    {
        $res = $this->postJson('/api/labels/stickers/url', array_merge(['items' => [['id' => $this->juice, 'kind' => 'custom', 'copies' => 1]], 'layout' => 'single-custom', 'fill' => true] + $size, $extra))->assertOk();

        return [(string) $this->get($res->json('view_url'))->assertOk()->getContent(), $res->json()];
    }

    public function test_a_wide_label_prints_every_part_side_by_side_with_the_flavour_band(): void
    {
        [$html, $res] = $this->sheet(['for' => 'NH Kuda Rah', 'for2' => 'Delivery TD-0042', 'promo' => 'text', 'promo_text' => 'New']);
        $this->assertSame('wrap', $res['summary']['design']);
        $this->assertSame('180 × 40 mm, label printer', $res['summary']['label']);
        foreach ([
            '>CRANBERRY<' => 'the band words',
            '>0.2 L<' => 'the net content at the end of the band',
            '>FRUIT CONTENT 29%<' => 'the free text heading',
            'Shake well before' => 'the free text (wrapped to the part)',
            '>NUTRITION PER 100 ml<' => 'the nutrition heading (plain: nine parts squeeze it), per 100 ml for a drink',
            'Energy 55 kcal' => 'the typed nutrition line',
            "\u{267B}" => 'the recycling loop glyph',
            '>RECYCLE<' => 'its caption',
            '>PET 1<' => 'the PET mark',
            '>DISPOSE PROPERLY<' => 'the tidy man caption',
            'Made by' => 'who made it',
            'SCAN FOR PACK INFO' => 'the batch QR caption',
            '>PACKED FOR<' => 'the packed-for box',
            '>NEW<' => 'the promotion flash',
            '5 901234 123457' => 'the barcode digits',
            '>MFG DATE<' => 'the made-on box',
            'I N G R E D I E N T S' => 'the ingredients heading',
        ] as $needle => $what) {
            $this->assertStringContainsString($needle, $html, $what);
        }
        $this->assertStringContainsString('class="pc tx f-sym"', $html, 'the recycling glyph sets in the symbol font');
        $this->assertStringContainsString('· wrap-around label', $html);
        $this->assertSame(1, substr_count($html, 'data-testid="sticker"'));

        // Where the strips land (round 2, 2026-10-13), for the editors' touch zones: every part, left to right, inside the label.
        $wrap = $res['summary']['wrap'];
        $this->assertSame(['brand', 'legal', 'nutrition', 'dates', 'barcode', 'qr', 'marks', 'text', 'packed'], array_column($wrap['strips'], 'part'));
        $x = 0.0;
        foreach ($wrap['strips'] as $strip) {
            $this->assertGreaterThanOrEqual($x, $strip['x'], 'the strips follow one another');
            $this->assertGreaterThan(5.0, $strip['w']);
            $x = $strip['x'] + $strip['w'];
        }
        $this->assertLessThanOrEqual(180.0, $x);
        $this->assertNotNull($wrap['band']);
        $this->assertSame([], $wrap['left_out']);

        // A draft previewed before it is saved says the same, so the editor's strips move as it is typed.
        $draft = $this->postJson('/api/labels/custom/preview', ['name' => 'Lime Soda', 'label_barcode' => '96385074', 'layout' => 'single-custom', 'w' => 120, 'h' => 40])->assertOk()->json();
        $this->assertSame('wrap', $draft['design']);
        $this->assertSame(['brand', 'legal', 'dates', 'barcode', 'qr', 'marks'], array_column($draft['wrap']['strips'], 'part'), 'no nutrition line: that part is left out');
        $this->assertSame(['nutrition' => 'empty'], $draft['wrap']['left_out']);
        // On 100 × 30 mm there is no room for every strip even squeezed: the last ones are reported as left out for want of room.
        $narrow = $this->postJson('/api/labels/custom/preview', ['name' => 'Lime Soda', 'label_barcode' => '96385074', 'layout' => 'single-custom', 'w' => 100, 'h' => 30])->assertOk()->json();
        $this->assertContains('narrow', $narrow['wrap']['left_out']);
        $this->assertSame('brand', $narrow['wrap']['strips'][0]['part']);
    }

    public function test_dhivehi_and_both_languages_and_a_narrow_label_that_gives_up_its_last_parts(): void
    {
        [$dv] = $this->sheet(['lang' => 'dv']);
        $this->assertStringContainsString('ހިމެނޭ ތަކެތި', $dv, 'the Dhivehi ingredients heading');
        $this->assertStringContainsString('>ކްރޭންބެރީ<', $dv, 'the Dhivehi band words');
        [$both] = $this->sheet(['lang' => 'both']);
        $this->assertStringContainsString('>CRANBERRY<', $both);
        $this->assertStringContainsString('>ކްރޭންބެރީ<', $both);

        // 100 × 30 mm is a wrap label too, but has no room for the free text and the packed-for box.
        [$narrow, $res] = $this->sheet([], ['w' => 100, 'h' => 30]);
        $this->assertSame('wrap', $res['summary']['design']);
        $this->assertStringContainsString('>CRANBERRY<', $narrow);
        $this->assertStringNotContainsString('FRUIT CONTENT', $narrow);
        $this->assertStringContainsString('N U T R I T I O N   P E R   1 0 0   m l', $narrow, 'with four parts the nutrition heading has the room to be letter-spaced');
        // 89 mm wide, or under 25 mm tall, is not a wrap label.
        $this->assertSame('small', StickerLayouts::design('rect', 89.0, 30.0));
        $this->assertSame('small', StickerLayouts::design('rect', 100.0, 24.0));
        $this->assertSame('wrap', StickerLayouts::design('rect', 90.0, 25.0));
    }

    public function test_the_parts_are_kept_as_typed_and_checked(): void
    {
        $this->getJson('/api/labels/custom')->assertOk()
            ->assertJsonPath('data.0.label_wrap.parts', ['brand', 'legal', 'nutrition', 'dates', 'barcode', 'qr', 'marks', 'text', 'packed'])
            ->assertJsonPath('data.0.label_wrap.marks', ['recycle', 'pet', 'dispose'])
            ->assertJsonPath('data.0.label_wrap.band_text', 'Cranberry')
            ->assertJsonPath('data.0.label_nutrition_per', 'ml');
        // The order typed is the order printed; an unknown part or mark is dropped; a part once only.
        $this->putJson("/api/labels/custom/{$this->juice}", ['label_wrap' => ['parts' => ['dates', 'brand', 'dates', 'bogus'], 'marks' => ['glass', 'nope'], 'band' => false]])->assertUnprocessable();
        $this->putJson("/api/labels/custom/{$this->juice}", ['label_wrap' => ['parts' => ['dates', 'brand', 'dates'], 'marks' => ['glass'], 'band' => false]])->assertOk()
            ->assertJsonPath('data.label_wrap.parts', ['dates', 'brand'])
            ->assertJsonPath('data.label_wrap.marks', ['glass'])
            ->assertJsonPath('data.label_wrap.band', false)
            ->assertJsonPath('data.label_wrap.band_text', '');
        $this->putJson("/api/labels/custom/{$this->juice}", ['label_wrap' => ['pictures' => [999999]]])->assertUnprocessable();
        $this->putJson("/api/labels/custom/{$this->juice}", ['label_nutrition_per' => 'oz'])->assertUnprocessable();
        // Nothing kept prints the usual set.
        $this->putJson("/api/labels/custom/{$this->juice}", ['label_wrap' => null])->assertOk()
            ->assertJsonPath('data.label_wrap.parts', WrapConfig::DEFAULT_PARTS)
            ->assertJsonPath('data.label_wrap.marks', WrapConfig::DEFAULT_MARKS)
            ->assertJsonPath('data.label_wrap.band', true);
        $this->assertNull(CustomLabel::query()->findOrFail($this->juice)->label_wrap);

        // A menu item keeps its own, through its Label tab.
        $item = $this->makeItem(false, 0, ['name' => 'Bajiya', 'label_enabled' => true]);
        $this->putJson("/api/items/{$item->id}/label", ['label_wrap' => ['parts' => ['brand', 'dates'], 'band_text' => 'Hot and spicy'], 'label_nutrition_per' => 'g'])->assertOk()
            ->assertJsonPath('data.label_wrap.parts', ['brand', 'dates'])
            ->assertJsonPath('data.label_wrap.band_text', 'Hot and spicy');
        $this->assertSame(['brand', 'dates'], Item::query()->findOrFail($item->id)->label_wrap['parts']);
    }

    public function test_the_layouts_endpoint_lists_the_parts_marks_and_wrap_sizes_and_the_bitmap_draws_a_wrap(): void
    {
        $layouts = $this->getJson('/api/labels/layouts')->assertOk()->json();
        $this->assertSame(WrapConfig::PARTS, array_column($layouts['wrap']['parts'], 'key'));
        $this->assertCount(12, $layouts['wrap']['marks']);
        $this->assertSame(4, $layouts['wrap']['max_pictures']);
        $wraps = collect($layouts['presets'])->where('design', 'wrap')->pluck('id')->all();
        $this->assertSame(['r200x50', 'r180x40', 'r150x35', 'r120x40'], $wraps);
        $this->assertSame(7, collect($layouts['presets'])->firstWhere('id', 'r180x40')['options'][0]['per_page'], 'seven 180 × 40 labels on an A4 sheet');

        $req = StickerSheet::normalise(['items' => [['id' => $this->juice, 'kind' => 'custom', 'copies' => 1]], 'layout' => 'single-custom', 'w' => 180, 'h' => 40, 'fill' => true]);
        $build = app(StickerSheet::class)->build($req);
        $bits = LabelRaster::page($build, 0, 203);
        $this->assertSame([1439, 320], [$bits['w'], $bits['h']]);
        $black = 0;
        foreach ($bits['rows'] as $row) {
            foreach (unpack('C*', $row) as $byte) {
                $black += substr_count(decbin($byte), '1');
            }
        }
        $this->assertGreaterThan(0.03, $black / (1439 * 320), 'the parts put ink on the label');
    }
}

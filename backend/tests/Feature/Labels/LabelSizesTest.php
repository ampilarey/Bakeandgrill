<?php

declare(strict_types=1);

namespace Tests\Feature\Labels;

use App\Domains\Labels\StickerLayouts;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Item;
use App\Models\SiteSetting;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Owner, 2026-10-11: "Enhance label page. Add label size. For example
 * rectangular 4 cm by 6 cm, circle 6 cm diameter ect."
 *
 * Sizes offered as one tap, each on A4 (as many as fit) or a label printer,
 * any size typed in down to 30 × 20 mm, and a small sticker design for the
 * sizes too small for the compact one.
 */
class LabelSizesTest extends TestCase
{
    use RefreshDatabase;

    private Item $bajiya;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        CarbonImmutable::setTestNow('2026-10-04 09:00:00');
        SiteSetting::set('business_phone', '+960 912 0011');
        SiteSetting::set('business_website', 'bakeandgrill.mv');
        \Illuminate\Support\Facades\Cache::flush();

        $this->bajiya = $this->makeItem(false, 0, [
            'name' => 'Bajiya', 'name_dv' => 'ބާޖިޔާ', 'label_enabled' => true, 'label_shelf_life_days' => 90,
            'label_ingredients_source' => 'manual',
            'label_ingredients' => 'Flour, salt, oil, onion, ginger, chilli, lemon, curry leaves, smoked tuna',
            'label_ingredients_dv' => 'ފުށް، ލޮނު، ތެޔޮ، ފިޔާ، އިނގުރު، މިރުސް، ލުނބޯ، ހިކަނދިފަތް، ވަޅޯމަސް',
        ]);
    }

    protected function tearDown(): void
    {
        CarbonImmutable::setTestNow();
        parent::tearDown();
    }

    /** @param array<string, mixed> $extra */
    private function sheet(string $layout, ?float $w, ?float $h, array $extra = []): string
    {
        $res = $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $this->bajiya->id, 'copies' => 1]], 'layout' => $layout, 'w' => $w, 'h' => $h, 'fill' => true] + $extra)->assertOk();

        return (string) $this->get($res->json('view_url'))->assertOk()->getContent();
    }

    public function test_the_owners_two_sizes_are_one_tap_each_on_a4_or_a_label_printer(): void
    {
        $presets = collect($this->getJson('/api/labels/layouts')->assertOk()->json('presets'))->keyBy('id');

        $rect = $presets['r40x60'];
        $this->assertSame('40 × 60 mm', $rect['name']);
        $this->assertSame('4 × 6 cm', $rect['cm']);
        $this->assertSame('small', $rect['design']);
        $this->assertSame(['sheet' => 21, 'printer' => 1], collect($rect['options'])->pluck('per_page', 'on')->all());

        $round = $presets['c60'];
        $this->assertSame('Round 60 mm', $round['name']);
        $this->assertSame('6 cm across', $round['cm']);
        $this->assertSame(['sheet' => 12, 'printer' => 1], collect($round['options'])->pluck('per_page', 'on')->all());

        // The A6 sticker keeps its four ways to print.
        $this->assertSame(['sheet' => 'a4-4', 'precut' => 'a4-4-precut', 'landscape' => 'a4-2', 'printer' => 'single-105x148'], collect($presets['r105x148']['options'])->pluck('layout', 'on')->all());
    }

    public function test_every_preset_prints_on_each_of_its_stocks(): void
    {
        foreach ($this->getJson('/api/labels/layouts')->json('presets') as $preset) {
            foreach ($preset['options'] as $option) {
                $res = $this->postJson('/api/labels/stickers/url', [
                    'items' => [['id' => $this->bajiya->id, 'copies' => $option['per_page']]],
                    'layout' => $option['layout'],
                    'w' => $preset['w'],
                    'h' => $preset['shape'] === 'rect' ? $preset['h'] : null,
                    'preview' => true,
                ])->assertOk()
                    ->assertJsonPath('summary.per_page', $option['per_page'])
                    ->assertJsonPath('summary.design', $preset['design']);
                $html = (string) $this->get($res->json('view_url'))->assertOk()->getContent();
                $this->assertSame($option['per_page'], substr_count($html, 'data-testid="sticker"'), "{$preset['id']} on {$option['on']}");
            }
        }
    }

    public function test_any_size_on_a4_fits_as_many_as_the_sheet_holds_inside_the_edge(): void
    {
        // 40 × 60 mm: 21 on landscape A4 beats 20 upright.
        $this->assertSame([297.0, 210.0, 7, 3], StickerLayouts::grid(40, 60));
        $this->assertSame([210.0, 297.0, 3, 4], StickerLayouts::grid(60, 60));
        $this->assertSame(36, StickerLayouts::resolve('a4-custom', 50, 30)['per_page']);

        $sheet = StickerLayouts::resolve('a4-custom', 40, 60);
        foreach ($sheet['slots'] as $slot) {
            $this->assertGreaterThanOrEqual(StickerLayouts::SHEET_MARGIN, $slot['x']);
            $this->assertGreaterThanOrEqual(StickerLayouts::SHEET_MARGIN, $slot['y']);
            $this->assertLessThanOrEqual($sheet['page_w'] - StickerLayouts::SHEET_MARGIN, $slot['x'] + $slot['w']);
            $this->assertLessThanOrEqual($sheet['page_h'] - StickerLayouts::SHEET_MARGIN, $slot['y'] + $slot['h']);
        }
        $html = $this->sheet('a4-custom', 40, 60);
        $this->assertStringContainsString('size: 297mm 210mm', $html);
        $this->assertSame(21, substr_count($html, 'class="cut"'), 'a dashed cut line round each label');

        $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $this->bajiya->id, 'copies' => 1]], 'layout' => 'a4-custom', 'w' => 260, 'h' => 210])
            ->assertUnprocessable()
            ->assertJsonPath('message', 'A label on an A4 sheet can be up to 200 × 287 mm (the sheet keeps a 5 mm edge); 260 × 210 mm is bigger.');
        $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $this->bajiya->id, 'copies' => 1]], 'layout' => 'a4-round-custom', 'w' => 205])
            ->assertUnprocessable();
    }

    public function test_a_small_label_keeps_the_essentials_and_adds_the_rest_as_it_fits(): void
    {
        // 4 × 6 cm: header, name, ingredients with the QR, dates, batch, storage, footer.
        $html = $this->sheet('single-custom', 40, 60, ['batch' => 'KP-7']);
        foreach (['B A K E   &amp;   G R I L L', 'FROZEN HEDHIKA', 'Bajiya', 'I N G R E D I E N T S', 'smoked tuna', 'data:image/svg+xml', 'MFG DATE', '04 / 10 / 2026', '02 / 01 / 2027', 'BATCH: KP-7', 'KEEP FROZEN', '+960 912 0011'] as $text) {
            $this->assertStringContainsString($text, $html, $text);
        }
        $this->assertStringContainsString('size: 40mm 60mm', $html);

        // Wide (6 × 4 cm): the dates in a column beside the name.
        $wide = $this->sheet('single-custom', 60, 40);
        $this->assertStringContainsString('EXP DATE', $wide);
        $this->assertStringContainsString('Bajiya', $wide);

        // 3 × 2 cm: a tinted brand line, the name, the two dates and the strip; no room for the rest.
        $tiny = $this->sheet('single-custom', 30, 20);
        $this->assertStringContainsString('BAKE &amp; GRILL  ·  FROZEN HEDHIKA', $tiny);
        $this->assertStringContainsString('EXP DATE', $tiny);
        $this->assertStringNotContainsString('I N G R E D I E N T S', $tiny);
        $this->assertStringNotContainsString('data:image/svg+xml', $tiny);

        // A list too long for its room ends in "…", it does not just stop.
        $this->bajiya->update(['label_ingredients' => str_repeat('Flour, salt, oil, onion, ginger, chilli, lemon, curry leaves, smoked tuna, ', 4) . 'water']);
        $this->assertStringContainsString('…', $this->sheet('single-custom', 50, 30));

        // Dhivehi, mirrored, with Thaana in stored order for the browser.
        $dv = $this->sheet('single-custom', 40, 60, ['lang' => 'dv']);
        $this->assertStringContainsString('ބާޖިޔާ', $dv);
        $this->assertStringContainsString('direction:rtl', $dv);
        // A date or temperature inside Dhivehi keeps its own order in the browser.
        $this->assertStringContainsString('.latin { font-size: 0.82em; direction: ltr; unicode-bidi: isolate; }', $dv);
    }

    public function test_small_labels_print_to_pdf_one_label_a_page(): void
    {
        foreach ([[40, 60, 'en'], [60, 40, 'dv'], [30, 20, 'en']] as [$w, $h, $lang]) {
            $res = $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $this->bajiya->id, 'copies' => 1]], 'layout' => 'single-custom', 'w' => $w, 'h' => $h, 'lang' => $lang, 'fill' => true])->assertOk();
            $pdf = (string) $this->get($res->json('pdf_url'))->assertOk()->getContent();
            $this->assertStringStartsWith('%PDF', $pdf);
            $this->assertSame(1, preg_match_all('#/Type\s*/Page[^s]#', $pdf), "{$w}x{$h} {$lang}");
        }
    }

    public function test_a_small_round_sticker_keeps_the_name_and_dates_big(): void
    {
        foreach ([30, 40] as $d) {
            $html = $this->sheet('single-round-custom', $d, null);
            $this->assertStringContainsString('Bajiya', $html);
            $this->assertStringContainsString('EXP DATE:', $html);
            $this->assertStringNotContainsString('I N G R E D I E N T S', $html, "{$d} mm leaves the ingredients off");
        }
        // From 45 mm the round design keeps its ingredients.
        $this->assertStringContainsString('I N G R E D I E N T S', $this->sheet('single-round-custom', 60, null));
        $this->assertSame(12, substr_count($this->sheet('a4-round-custom', 60, null), 'border-radius:50%'));
    }

    public function test_the_print_log_names_the_size(): void
    {
        $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $this->bajiya->id, 'copies' => 21]], 'layout' => 'a4-custom', 'w' => 40, 'h' => 60])->assertOk()
            ->assertJsonPath('summary.label', '40 × 60 mm, 21 on A4');
        $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $this->bajiya->id, 'copies' => 1]], 'layout' => 'single-round-custom', 'w' => 60])->assertOk();

        $stock = collect($this->getJson('/api/labels/prints')->assertOk()->json('data'))->pluck('stock')->all();
        $this->assertSame(['Round 60 mm, label printer', '40 × 60 mm, 21 on A4'], $stock);
    }
}

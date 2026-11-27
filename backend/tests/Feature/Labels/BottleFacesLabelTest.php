<?php

declare(strict_types=1);

namespace Tests\Feature\Labels;

use App\Domains\Labels\LabelTemplates;
use App\Domains\Labels\StickerLayouts;
use App\Domains\Labels\WrapConfig;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\LabelBrand;
use App\Models\SiteSetting;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * A wrap-around label for a bottle with flat sides (owner, 2026-11-11: Amma's
 * Theluli Rihaakuru in a four-sided bottle, 21.5 cm about and 4 cm tall): the
 * label in equal faces, a fold on each corner and never through a part, and
 * the built-in template that makes it.
 */
class BottleFacesLabelTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        CarbonImmutable::setTestNow('2026-11-11 09:00:00');
        SiteSetting::set('business_phone', '+960 912 0011');
        Cache::flush();
        Storage::fake('public');
    }

    protected function tearDown(): void
    {
        CarbonImmutable::setTestNow();
        parent::tearDown();
    }

    private function dump(string $name, string $html): void
    {
        $dir = getenv('LABEL_DUMP') ?: '';
        if ($dir !== '' && is_dir($dir)) {
            file_put_contents("{$dir}/{$name}.html", $html);
        }
    }

    /**
     * Owner, 2026-11-26: "Can u make a template for the Rihaakuru also like u did for teluli rihaakuru. I need name
     * in English and dhivehi also. Instead of mfd. put packing date… For the default photo can u put a tuna fish?
     * This size of the bottle" (a square jar about 6.5 cm a side).
     */
    public function test_the_rihaakuru_jar_template_is_in_both_languages_with_packed_on_and_a_tuna(): void
    {
        $t = collect($this->getJson('/api/labels/templates')->assertOk()->json('builtin'))->keyBy('id')['rihaakuru-jar'];
        $this->assertSame('Rihaakuru', $t['product']);
        $this->assertSame('ރިހާކުރު', $t['product_dv']);
        $this->assertSame('Amma', $t['brand_name']);
        $this->assertNotEmpty($t['photo']['id'], 'the drawn tuna');
        $this->assertFileExists(public_path('brand/photos/rihaakuru/tuna.png'));
        $this->assertSame('both', $t['fields']['label_lang']);
        $this->assertSame(4, $t['fields']['label_wrap']['faces']);
        $this->assertSame('Packed on', $t['fields']['label_wrap']['mfg_label']);
        // The main side is second, so the label's joint is not at its edge (owner, 2026-11-26); a saved label whose
        // brand part leads has its last part brought round, and any other order is left alone.
        $this->assertSame(['maker', 'brand', 'legal', 'marks', 'dates'], $t['fields']['label_wrap']['parts']);
        $this->assertSame(['dates', 'brand', 'legal'], WrapConfig::mainSecond(['brand', 'legal', 'dates']));
        $this->assertSame(['legal', 'brand'], WrapConfig::mainSecond(['legal', 'brand']));
        $this->assertSame(['brand'], WrapConfig::mainSecond(['brand']));
        // The QR strip is never beside the barcode strip, the label's two ends counted as neighbours (owner, same day:
        // "Dont keep barcode and any qr code nearby"); the brand and the barcode keep their places.
        $this->assertSame(['qr', 'brand', 'legal', 'nutrition', 'dates', 'barcode', 'marks'], WrapConfig::DEFAULT_PARTS);
        $this->assertSame(['qr', 'brand', 'legal', 'dates', 'barcode', 'marks'], WrapConfig::codesApart(['marks', 'brand', 'legal', 'dates', 'barcode', 'qr']));
        $this->assertSame(['legal', 'brand', 'qr', 'dates', 'barcode'], WrapConfig::codesApart(['qr', 'brand', 'legal', 'dates', 'barcode']));
        $this->assertSame(['brand', 'barcode', 'qr'], WrapConfig::codesApart(['brand', 'barcode', 'qr']), 'no other place: left as it is');
        $this->assertSame([240, 60], [(int) $t['size']['w'], (int) $t['size']['h']]);

        // A barcode typed for the shop's till prints on the dates side (owner: "will this template have shop barcode?").
        $id = $this->postJson('/api/labels/custom', ['name' => $t['product'], 'name_dv' => $t['product_dv'], 'label_photo_media_id' => $t['photo']['id'], 'label_barcode' => '200000012345'] + $t['fields'])->assertCreated()->json('data.id');
        $sheet = fn (string $lang, string $layout) => $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $id, 'kind' => 'custom', 'copies' => 1]], 'layout' => $layout, 'w' => 240, 'h' => 60, 'lang' => $lang, 'fill' => true])->assertOk();
        $res = $sheet('both', 'single-custom');
        $this->assertSame('wrap', $res->json('summary.design'));
        $html = (string) $this->get($res->json('view_url'))->assertOk()->getContent();
        $this->dump('jar-rihaakuru', $html);
        $this->assertStringContainsString('Rihaakuru', $html);
        $this->assertStringContainsString('PACKED ON', $html);
        // The Dhivehi name is set as large as the English one (owner, 2026-11-26: it was small beside it).
        $this->assertSame(1, preg_match('/font-size:([\d.]+)pt;[^>]*>Rihaakuru</', $html, $en));
        $this->assertSame(1, preg_match('/font-size:([\d.]+)pt;[^>]*>ރިހާކުރު/u', $html, $dv));
        $this->assertGreaterThanOrEqual((float) $en[1], (float) $dv[1]);
        $this->assertGreaterThanOrEqual(20.0, (float) $dv[1]);
        // In both languages the storage line has its Dhivehi under it, as the ingredients do (owner, 2026-11-27).
        $this->assertStringContainsString('Store in a cool, dry place', $html);
        $this->assertStringContainsString('ފިނި، ހިކި ތަނެއްގައި ބަހައްޓަވާ', $html);
        // The editor's picture carries the pack's code as the print does: both codes on the business's side.
        $draft = $this->postJson('/api/labels/custom/preview', ['name' => $t['product'], 'label_barcode' => '200000012345', 'layout' => 'single-custom', 'w' => 240, 'h' => 60, 'lang' => 'both'] + $t['fields'])->assertOk();
        $drawn = (string) $this->get($draft->json('one_url'))->assertOk()->getContent();
        $this->assertStringContainsString('PACK INFO', $drawn);
        $this->assertStringContainsString('FEEDBACK', $drawn);
        $this->assertStringContainsString('2 000000 12345', $html);
        $this->assertStringContainsString('>AMMA<', $html);
        $this->assertStringNotContainsString('MFG DATE', $html);
        $this->assertStringContainsString('BEST BEFORE', $html);
        $this->assertStringStartsWith('%PDF', (string) $this->get($res->json('pdf_url'))->assertOk()->getContent());
        // In Dhivehi alone the box says packed too, and the label fits an A4 sheet on its side.
        $this->assertStringNotContainsString('PACKED ON', (string) $this->get($sheet('dv', 'single-custom')->json('view_url'))->getContent());
        $this->assertGreaterThanOrEqual(2, $sheet('both', 'a4-custom')->json('summary.per_page'));
    }

    public function test_the_rihaakuru_template_brings_the_brand_the_photo_the_name_and_a_label_in_four_faces(): void
    {
        $builtin = collect($this->getJson('/api/labels/templates')->assertOk()->json('builtin'))->keyBy('id');
        $t = $builtin['rihaakuru-bottle'];
        $this->assertSame('Theluli Rihaakuru', $t['product']);
        $this->assertSame((int) LabelBrand::query()->where('name', 'Amma')->value('id'), $t['fields']['brand_id']);
        $this->assertSame('Amma', $t['brand_name']);
        $this->assertNotEmpty($t['photo']['id']);
        $this->assertSame(4, $t['fields']['label_wrap']['faces']);
        $this->assertSame(['shape' => 'rect', 'preset' => 'r215x40', 'on' => 'sheet', 'w' => 215, 'h' => 40], array_map(fn ($v) => is_float($v) ? (int) $v : $v, $t['size']));
        $this->assertNull($builtin['frozen-pack']['product']);
        $this->assertNotEmpty($builtin['momo-pouch']['photo']['id'], 'the momo templates keep theirs');

        $preset = collect($this->getJson('/api/labels/layouts')->assertOk()->json('presets'))->firstWhere('id', 'r215x40');
        $this->assertSame('wrap', $preset['design']);
        $sheet = collect($preset['options'])->firstWhere('on', 'sheet');
        $this->assertSame(5, $sheet['per_page'], 'five right-round labels on a landscape A4 sheet');
        $this->assertTrue($sheet['landscape']);

        $id = $this->postJson('/api/labels/custom', ['name' => $t['product'], 'label_photo_media_id' => $t['photo']['id'], 'label_net_weight' => '200 g', 'label_price' => 85, 'label_barcode' => '200000012345'] + $t['fields'])->assertCreated()->json('data.id');
        $res = $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $id, 'kind' => 'custom', 'copies' => 1]], 'layout' => 'single-custom', 'w' => 215, 'h' => 40, 'fill' => true])->assertOk();
        $html = (string) $this->get($res->json('view_url'))->assertOk()->getContent();
        $this->dump('bottle-rihaakuru', $html);
        $this->assertSame('wrap', $res->json('summary.design'));
        // Owner, 2026-11-14: the bottle carries the pack's own code beside its barcode, as the momo pouch does.
        $code = (string) \App\Models\LabelPrint::query()->latest('id')->value('code');
        $this->assertStringContainsString(\App\Domains\Labels\BatchLink::qr($code), $html, 'the pack code prints');
        $this->assertStringContainsString('>PACK INFO<', $html);
        $this->assertNotContains('Pack QR code', $res->json('summary.dropped'));
        $this->assertStringNotContainsString('EXP DATE', $html, 'the label says Best before');
        $this->assertStringNotContainsString('Made by', $html, 'the business has a side of its own, so no small line as well');
        $this->assertStringNotContainsString('QTY:', $html, 'no blank count on a bottle');
        foreach (['>Theluli<', '>Rihaakuru<', 'BY BAKE &amp; GRILL', '>AMMA<', 'Rihaakuru, onion', 'STORE IN A COOL, DRY PLACE', 'MFG DATE', '>BEST BEFORE<', '>MVR 85.00<', 'NET 200 g', '>FEEDBACK<', '+960 912 0011', '2 000000 12345'] as $needle) {
            $this->assertStringContainsStringIgnoringCase($needle, $html, $needle);
        }

        // A part to a face, the main one second (owner, 2026-11-26): the business, the brand, the ingredients with the marks, the dates.
        $strips = collect($res->json('summary.wrap.strips'))->keyBy('part');
        $this->assertSame(['maker', 'brand', 'legal', 'marks', 'dates'], $strips->keys()->all());
        $face = 215 / 4;
        foreach (['maker' => 0, 'brand' => 1, 'legal' => 2, 'marks' => 2, 'dates' => 3] as $part => $n) {
            $s = $strips[$part];
            // Three millimetres clear of each corner: a bottle's corners are rounded.
            $this->assertGreaterThanOrEqual($n * $face + 3.0 - 0.01, $s['x'], "{$part} starts clear of the corner before face " . ($n + 1));
            $this->assertLessThanOrEqual(($n + 1) * $face - 3.0 + 0.01, $s['x'] + $s['w'], "{$part} ends clear of the corner after face " . ($n + 1));
        }
        $this->assertGreaterThan(45, $strips['brand']['w']);
        $this->assertSame(3.0, (float) $t['fields']['label_wrap']['corner']);
        // The name is large on the front, on two lines, and stays clear of the picture beside it.
        $spots = collect($res->json('summary.spots'));
        $name = $spots->firstWhere('key', 'name');
        $photo = $spots->firstWhere('key', 'photo');
        if ($name !== null && $photo !== null) {
            $this->assertLessThanOrEqual($photo['x'] + 0.6, $name['x'] + $name['w'], 'the name does not run under the bowl');
            $this->assertGreaterThan(14.0, $name['h'], 'two large lines');
        }
        // The price is on the front face, with the name; the recycling marks share the last face.
        $price = collect($res->json('summary.spots'))->firstWhere('key', 'price');
        $this->assertNotNull($price);
        $this->assertGreaterThanOrEqual($face, $price['x'], 'the price sits on the front face, the second one');
        $this->assertLessThanOrEqual(2 * $face, $price['x'] + $price['w'], 'the price sits on the front face, the second one');
        $this->assertSame(1, substr_count($html, '>MVR 85.00<'));
        // The barcode has the dates side to itself: the pack's code stands on the business's side, with the complaints
        // code (owner, 2026-11-26: "Dont keep barcode and any qr code nearby").
        $pack = collect($res->json('summary.spots'))->firstWhere('key', 'batch_qr');
        $this->assertNotNull($pack);
        $this->assertLessThanOrEqual($face, $pack['x'] + $pack['w'], 'the pack code is on the first side, the business\'s');
        $this->assertStringContainsString('>RECYCLE<', $html);
        // The marks sit under the ingredients on the same face, and the business keeps its whole side.
        $this->assertEqualsWithDelta($strips['legal']['x'], $strips['marks']['x'], 0.01);
        $this->assertGreaterThanOrEqual($strips['legal']['y'] + $strips['legal']['h'], $strips['marks']['y']);
        $this->assertGreaterThan(45, $strips['maker']['w']);

        // A rounder corner: more room, typed on the label.
        $this->putJson("/api/labels/custom/{$id}", ['name' => $t['product'], 'label_wrap' => ['corner' => 6] + $t['fields']['label_wrap']])->assertOk()->assertJsonPath('data.label_wrap.corner', 6);
        $wide = collect($this->postJson('/api/labels/stickers/url', ['items' => [['id' => $id, 'kind' => 'custom', 'copies' => 1]], 'layout' => 'single-custom', 'w' => 215, 'h' => 40, 'fill' => true, 'preview' => true])->assertOk()->json('summary.wrap.strips'))->keyBy('part');
        $this->assertEqualsWithDelta(6.0, $wide['maker']['x'], 0.01);
        $this->assertEqualsWithDelta($face + 6.0, $wide['brand']['x'], 0.01);
        $this->assertSame([], $res->json('summary.dropped'));
        $this->assertGreaterThanOrEqual(2, substr_count($html, '<img'), 'the logo and the bowl on the front face');
        // The round Amma's logo ships as the brand's own.
        [$lw, $lh] = getimagesize(public_path('brand/amma-logo.png'));
        $this->assertSame($lw, $lh);
    }

    public function test_faces_are_kept_tidy_and_a_round_bottle_shares_the_width_as_before(): void
    {
        $this->assertSame(0, WrapConfig::clean(null)['faces']);
        $this->assertSame(4, WrapConfig::clean(['faces' => '4'])['faces']);
        $this->assertSame(0, WrapConfig::clean(['faces' => 7])['faces']);
        $this->assertSame([0, 2, 3, 4], $this->getJson('/api/labels/layouts')->json('wrap.faces'));

        $id = $this->postJson('/api/labels/custom', ['name' => 'Chilli Sauce', 'label_ingredients' => 'Chilli, vinegar, garlic, salt', 'label_wrap' => ['parts' => ['brand', 'legal', 'dates'], 'band' => true, 'faces' => 0]])->assertCreated()->json('data.id');
        $strips = fn () => collect($this->postJson('/api/labels/stickers/url', ['items' => [['id' => $id, 'kind' => 'custom', 'copies' => 1]], 'layout' => 'single-custom', 'w' => 180, 'h' => 40, 'fill' => true, 'preview' => true])->assertOk()->json('summary.wrap.strips'))->keyBy('part');
        $round = $strips();
        $this->assertNotEqualsWithDelta($round['brand']['w'], $round['legal']['w'], 2.0, 'a round bottle: the parts take what they need');

        // Three sides: a part each, equal faces of 60 mm. Two parts on three sides: the last takes two faces.
        $this->putJson("/api/labels/custom/{$id}", ['name' => 'Chilli Sauce', 'label_wrap' => ['parts' => ['brand', 'legal', 'dates'], 'band' => true, 'faces' => 3]])->assertOk()->assertJsonPath('data.label_wrap.faces', 3);
        $three = $strips();
        $this->assertLessThanOrEqual(60.0, $three['brand']['x'] + $three['brand']['w']);
        $this->assertGreaterThanOrEqual(60.0, $three['legal']['x']);
        $this->assertLessThanOrEqual(120.0, $three['legal']['x'] + $three['legal']['w']);
        $this->assertGreaterThanOrEqual(120.0, $three['dates']['x']);
        $this->putJson("/api/labels/custom/{$id}", ['name' => 'Chilli Sauce', 'label_wrap' => ['parts' => ['brand', 'legal'], 'band' => true, 'faces' => 3]])->assertOk();
        $two = $strips();
        $this->assertGreaterThan(100.0, $two['legal']['w'], 'the last part takes the faces left over');

        $this->putJson("/api/labels/custom/{$id}", ['name' => 'Chilli Sauce', 'label_wrap' => ['faces' => 5]])->assertStatus(422);
        foreach (LabelTemplates::BUILTIN as $b) {
            $this->assertArrayHasKey($b['size']['preset'], array_column(StickerLayouts::PRESETS, null, 'id'));
        }
    }

    /** Owner, 2026-11-14: "There is no border" on the Theluli Rihaakuru label, where the momo pouch has a frame. */
    public function test_a_wrap_label_has_a_border_unless_it_is_switched_off(): void
    {
        $this->assertTrue(WrapConfig::clean(null)['border']);
        $this->assertTrue(WrapConfig::clean(['faces' => 4])['border'], 'a label kept before the switch existed has it');
        $this->assertFalse(WrapConfig::clean(['border' => false])['border']);

        $id = $this->postJson('/api/labels/custom', ['name' => 'Chilli Sauce', 'label_ingredients' => 'Chilli, vinegar, garlic, salt', 'label_wrap' => ['parts' => ['brand', 'legal', 'dates'], 'faces' => 4]])->assertCreated()->json('data.id');
        $html = fn (): string => (string) $this->get($this->postJson('/api/labels/stickers/url', ['items' => [['id' => $id, 'kind' => 'custom', 'copies' => 1]], 'layout' => 'single-custom', 'w' => 215, 'h' => 40, 'fill' => true, 'preview' => true])->assertOk()->json('view_url'))->assertOk()->getContent();
        // The line is the label less half a millimetre each side, filled rust, with white inside it.
        $line = 'width:214mm;height:39mm';
        $with = $html();
        $this->dump('bottle-border', $with);
        $this->assertStringContainsString($line, $with);

        $this->putJson("/api/labels/custom/{$id}", ['name' => 'Chilli Sauce', 'label_wrap' => ['parts' => ['brand', 'legal', 'dates'], 'faces' => 4, 'border' => false]])->assertOk()->assertJsonPath('data.label_wrap.border', false);
        $this->assertStringNotContainsString($line, $html());
    }

    /** Owner, 2026-11-14: a colour laser printed the label "little low" in quality: dark browns are four toners, black is one. */
    public function test_words_print_in_pure_black_and_fills_keep_their_colour(): void
    {
        $out = \App\Domains\Labels\StickerSheet::crispInk([
            ['t' => 'text', 'pt' => 8.0, 'color' => '#2A1E0C', 'text' => 'Ingredients'],
            ['t' => 'text', 'pt' => 8.0, 'color' => '#1C1408', 'text' => '+960'],
            ['t' => 'text', 'pt' => 3.2, 'color' => '#8B7355', 'text' => 'PACK INFO'],
            ['t' => 'text', 'pt' => 7.0, 'color' => '#8B7355', 'text' => 'By Bake & Grill'],
            ['t' => 'text', 'pt' => 9.0, 'color' => '#B74B0C', 'text' => 'Contains fish'],
            ['t' => 'rect', 'fill' => '#1C1408'],
        ]);
        $this->assertSame(['#000000', '#000000', '#000000', '#8B7355', '#B74B0C'], array_column(array_slice($out, 0, 5), 'color'));
        $this->assertSame('#1C1408', $out[5]['fill']);

        $id = $this->postJson('/api/labels/custom', ['name' => 'Chilli Sauce', 'label_ingredients' => 'Chilli, vinegar, garlic, salt', 'label_wrap' => ['parts' => ['brand', 'legal', 'dates'], 'faces' => 4]])->assertCreated()->json('data.id');
        $html = (string) $this->get($this->postJson('/api/labels/stickers/url', ['items' => [['id' => $id, 'kind' => 'custom', 'copies' => 1]], 'layout' => 'single-custom', 'w' => 215, 'h' => 40, 'fill' => true, 'preview' => true])->assertOk()->json('view_url'))->assertOk()->getContent();
        $this->assertStringNotContainsString('color:#2A1E0C', $html);
        $this->assertStringContainsString('color:#000000', $html);
    }

    /** Owner, 2026-11-12: the brand typed as "Amma’s" was not picked by the template, and picked by hand it printed Bake & Grill's logo. */
    public function test_a_brand_typed_with_a_possessive_is_the_shipped_brand(): void
    {
        $this->assertSame('amma', LabelBrand::key('Amma’s'));
        $this->assertSame('amma', LabelBrand::key("AMMA'S"));
        $this->assertSame('bake-grill', LabelBrand::key('Bake & Grill'));
        LabelBrand::query()->where('name', 'Amma')->update(['name' => 'Amma’s']);
        $brand = LabelBrand::named('Amma');
        $this->assertNotNull($brand);

        $t = collect($this->getJson('/api/labels/templates')->assertOk()->json('builtin'))->keyBy('id')['rihaakuru-bottle'];
        $this->assertSame($brand->id, $t['fields']['brand_id'], 'the template still picks it');
        $row = collect($this->getJson('/api/labels/brands')->assertOk()->json('data'))->firstWhere('id', $brand->id);
        $this->assertSame('/brand/amma-logo.png', $row['logo_url'], 'and its shipped logo shows');
        $drawn = app(\App\Domains\Labels\LabelTypes::class)->brand($brand);
        $this->assertSame(\App\Domains\Labels\LabelImage::fromPublic('brand/amma-logo.png', 600), $drawn['logo'], 'on the label too, not the business logo');
    }
}

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
        $this->assertStringNotContainsString('EXP DATE', $html, 'the label says Best before');
        $this->assertStringNotContainsString('Made by', $html, 'the business has a side of its own, so no small line as well');
        $this->assertStringNotContainsString('QTY:', $html, 'no blank count on a bottle');
        foreach (['Theluli Rihaakuru', 'BY BAKE &amp; GRILL', 'A M M A', 'Rihaakuru, onion', 'STORE IN A COOL, DRY PLACE', 'MFG DATE', '>BEST BEFORE<', '>MVR 85.00<', 'NET 200 g', '>FEEDBACK &amp;<', '>COMPLAINTS<', '+960 912 0011', '2 000000 12345'] as $needle) {
            $this->assertStringContainsStringIgnoringCase($needle, $html, $needle);
        }

        // A part to a face: brand, ingredients and dates each inside their own quarter, the QR and marks sharing the last.
        $strips = collect($res->json('summary.wrap.strips'))->keyBy('part');
        $this->assertSame(['brand', 'legal', 'marks', 'dates', 'maker'], $strips->keys()->all());
        $face = 215 / 4;
        foreach (['brand' => 0, 'legal' => 1, 'marks' => 1, 'dates' => 2, 'maker' => 3] as $part => $n) {
            $s = $strips[$part];
            $this->assertGreaterThanOrEqual($n * $face, $s['x'], "{$part} starts inside face " . ($n + 1));
            $this->assertLessThanOrEqual(($n + 1) * $face, $s['x'] + $s['w'], "{$part} ends inside face " . ($n + 1) . ', clear of the fold');
        }
        $this->assertGreaterThan(45, $strips['brand']['w']);
        // The price is on the front face, with the name; the recycling marks share the last face.
        $price = collect($res->json('summary.spots'))->firstWhere('key', 'price');
        $this->assertNotNull($price);
        $this->assertLessThanOrEqual($face, $price['x'] + $price['w'], 'the price sits on the front face');
        $this->assertSame(1, substr_count($html, '>MVR 85.00<'));
        $this->assertStringContainsString('>RECYCLE<', $html);
        // The marks sit under the ingredients on the same face, and the business keeps its whole side.
        $this->assertEqualsWithDelta($strips['legal']['x'], $strips['marks']['x'], 0.01);
        $this->assertGreaterThanOrEqual($strips['legal']['y'] + $strips['legal']['h'], $strips['marks']['y']);
        $this->assertGreaterThan(45, $strips['maker']['w']);
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
}

<?php

declare(strict_types=1);

namespace Tests\Feature\Labels;

use App\Domains\Labels\LabelTemplates;
use App\Domains\Labels\PouchConfig;
use App\Domains\Labels\PouchDesign;
use App\Domains\Labels\StickerLayouts;
use App\Domains\Labels\StickerSheet;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\CustomLabel;
use App\Models\Media;
use App\Models\SiteSetting;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Pouch labels (owner, 2026-11-11: the frozen momo's zip pouch; "bake and
 * grill branding, complain… different type of background… steam, frying and
 * other types"): a product with `label_pouch` prints the pouch design on a
 * landscape label, in the look and with the cooking method it picked.
 */
class PouchLabelTest extends TestCase
{
    use RefreshDatabase;

    private int $momo;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        CarbonImmutable::setTestNow('2026-11-11 09:00:00');
        SiteSetting::set('business_phone', '9120011');
        Cache::flush();
        $this->momo = $this->postJson('/api/labels/custom', [
            'name' => 'Chicken Momo',
            'label_storage' => 'frozen',
            'label_ingredients' => 'Chicken, wheat flour, onion, coriander, ginger, vegetable oil, salt, MSG (E621).',
            'label_allergens' => 'Wheat',
            'label_note' => 'Best within 1 month of production.',
            'label_shelf_life_days' => 30,
            'label_pack_qty' => 8,
            'label_pack_unit' => 'PCS',
            'label_price' => 45,
            'label_pouch' => ['look' => 'gold', 'method' => 'microwave', 'tagline' => 'Steamed · Frozen · Handmade', 'size_word' => 'Medium', 'nonsense' => 'x'],
        ])->assertCreated()->assertJsonPath('data.label_pouch.look', 'gold')->assertJsonMissingPath('data.label_pouch.nonsense')->json('data.id');
    }

    protected function tearDown(): void
    {
        CarbonImmutable::setTestNow();
        parent::tearDown();
    }

    /** @return array{0: string, 1: array<string, mixed>} */
    private function sheet(array $extra = [], array $size = ['w' => 140, 'h' => 62]): array
    {
        $res = $this->postJson('/api/labels/stickers/url', array_merge(['items' => [['id' => $this->momo, 'kind' => 'custom', 'copies' => 1]], 'layout' => 'single-custom', 'fill' => true] + $size, $extra))->assertOk();

        return [(string) $this->get($res->json('view_url'))->assertOk()->getContent(), $res->json()];
    }

    private function dump(string $name, string $html): void
    {
        $dir = getenv('LABEL_DUMP') ?: '';
        if ($dir !== '' && is_dir($dir)) {
            file_put_contents("{$dir}/{$name}.html", $html);
        }
    }

    public function test_the_momo_pouch_prints_the_brand_the_pack_the_wording_and_the_complaints_code(): void
    {
        [$html, $res] = $this->sheet();
        $this->dump('pouch-gold-140', $html);
        $this->assertSame('pouch', $res['summary']['design']);
        foreach ([
            '>Chicken Momo<' => 'the name',
            'class="pc tx f-lob"' => 'set in the script face',
            '>STEAMED · FROZEN · HANDMADE<' => 'the tagline',
            '>Microwave &amp; Eat<' => 'the cooking pill',
            '>Call 9120011<' => 'the phone',
            '>MEDIUM<' => 'the size word',
            '>8<' => 'the count',
            '>PIECES<' => 'the unit in full',
            '>MVR 45.00<' => 'the price',
            '>INGREDIENTS<' => 'the ingredients heading',
            '<span class="f-j7">wheat</span> flour' => 'the allergen bold in the ingredients',
            'Open the zip slightly.' => 'the method\'s how to use, as the label typed none',
            '>STORAGE<' => 'the storage heading',
            'Mfg date: ' => 'the made-on date',
            'Exp date: ' => 'the expiry date',
            'Made by Bake' => 'who made it, always the business',
            '>FEEDBACK<' => 'the complaints QR\'s word',
            PouchConfig::LOOKS['gold']['border'] => 'the gold look\'s frame',
        ] as $needle => $what) {
            $this->assertStringContainsString($needle, $html, $what);
        }
        $this->assertSame([], $res['summary']['dropped'], 'nothing the label has is left out');
        $keys = array_column($res['summary']['spots'], 'key');
        foreach (['brand', 'name', 'heading', 'how_to_use', 'qty', 'price', 'ingredients', 'dates', 'storage', 'footer'] as $key) {
            $this->assertContains($key, $keys, "the {$key} part can be tapped");
        }
        // Nothing is drawn outside the label.
        foreach ($res['summary']['spots'] as $spot) {
            $this->assertGreaterThanOrEqual(-0.1, $spot['x']);
            $this->assertLessThanOrEqual(140.1, $spot['x'] + $spot['w'], $spot['key']);
            $this->assertLessThanOrEqual(62.1, $spot['y'] + $spot['h'], $spot['key']);
        }
    }

    public function test_every_look_and_method_draws_at_every_pouch_size_with_readable_type(): void
    {
        $label = CustomLabel::query()->findOrFail($this->momo);
        $sheets = app(StickerSheet::class);
        foreach ([[120.0, 53.0], [140.0, 62.0], [160.0, 70.0], [100.0, 50.0]] as [$w, $h]) {
            $this->assertTrue(PouchConfig::fits('rect', $w, $h));
            foreach (array_keys(PouchConfig::LOOKS) as $look) {
                foreach (array_keys(PouchConfig::METHODS) as $method) {
                    $label->label_pouch = ['look' => $look, 'method' => $method, 'tagline' => 'Frozen · Handmade'];
                    $data = $sheets->stickerData($label, ['batch' => 'B1', 'qty' => '', 'mfg' => '', 'exp' => '', 'for' => '', 'for2' => '', 'codes' => [], 'lang' => 'en', 'fill' => false, 'size' => null], $sheets->common());
                    $pieces = PouchDesign::pouch($data, false, $w, $h);
                    $texts = array_values(array_filter($pieces, fn ($p) => $p['t'] === 'text'));
                    $this->assertNotEmpty($texts);
                    foreach ($texts as $t) {
                        $this->assertGreaterThanOrEqual(3.2, $t['pt'], "{$look}/{$method} at {$w}×{$h}: \"{$t['text']}\" is too small to read");
                        $this->assertGreaterThanOrEqual(-0.01, $t['x']);
                        $this->assertLessThanOrEqual($w + 0.01, $t['x'] + $t['w'], "\"{$t['text']}\" runs off the label");
                    }
                    $words = implode(' ', array_column($texts, 'text'));
                    $pill = PouchConfig::METHODS[$method][0];
                    if ($pill !== '') {
                        $this->assertStringContainsString($pill, $words, "the {$method} pill");
                    }
                    foreach ($pieces as $p) {
                        $this->assertArrayNotHasKey('stroke', $p, 'filled shapes only: the label printer draws a rounded outline square');
                    }
                }
            }
        }
        // The body text on the smallest pouch label stays at a readable size.
        $label->label_pouch = ['look' => 'gold', 'method' => 'microwave'];
        $data = $sheets->stickerData($label, ['batch' => '', 'qty' => '', 'mfg' => '', 'exp' => '', 'for' => '', 'for2' => '', 'codes' => [], 'lang' => 'en', 'fill' => false, 'size' => null], $sheets->common());
        $body = array_filter(PouchDesign::pouch($data, false, 120.0, 53.0), fn ($p) => $p['t'] === 'text' && str_starts_with((string) $p['text'], 'Chicken, wheat'));
        $this->assertNotEmpty($body);
        $this->assertGreaterThanOrEqual(4.2, array_values($body)[0]['pt']);
    }

    public function test_a_label_too_small_or_upright_keeps_the_ordinary_design_and_null_clears_the_pouch(): void
    {
        [, $res] = $this->sheet([], ['w' => 60, 'h' => 40]);
        $this->assertNotSame('pouch', $res['summary']['design']);
        [, $res] = $this->sheet([], ['w' => 100, 'h' => 150]);
        $this->assertNotSame('pouch', $res['summary']['design']);
        $this->assertFalse(PouchConfig::fits('circle', 120, 120));

        $this->putJson("/api/labels/custom/{$this->momo}", ['name' => 'Chicken Momo', 'label_pouch' => null])->assertOk()->assertJsonPath('data.label_pouch', null);
        [, $res] = $this->sheet();
        $this->assertNotSame('pouch', $res['summary']['design'], 'an ordinary sticker again');

        $this->putJson("/api/labels/custom/{$this->momo}", ['name' => 'Chicken Momo', 'label_pouch' => ['look' => 'neon']])->assertStatus(422);
    }

    public function test_the_look_the_method_and_a_typed_how_to_use_change_what_prints(): void
    {
        $this->putJson("/api/labels/custom/{$this->momo}", ['name' => 'Chicken Momo', 'label_pouch' => ['look' => 'dark', 'method' => 'steam', 'method_text' => 'Steam or Fry']])
            ->assertOk()->assertJsonPath('data.label_pouch.method', 'steam');
        [$html] = $this->sheet();
        $this->dump('pouch-dark-140', $html);
        $this->assertStringContainsString('>Steam or Fry<', $html);
        $this->assertStringContainsString('Steam from', $html, 'the steam method\'s wording');
        $this->assertStringContainsString(PouchConfig::LOOKS['dark']['bg'], $html);
        $this->assertStringNotContainsString('Microwave', $html);

        $this->putJson("/api/labels/custom/{$this->momo}", ['name' => 'Chicken Momo', 'label_how_to_use' => 'Steam for 12 minutes.'])->assertOk();
        [$html] = $this->sheet();
        $this->assertStringContainsString('Steam for 12', $html);
        $this->assertStringNotContainsString('Do not thaw', $html, 'the label\'s own wording wins');
    }

    public function test_a_photo_is_cut_to_a_circle_and_the_label_printer_draws_it(): void
    {
        Storage::fake('public');
        $img = imagecreatetruecolor(300, 200);
        imagefill($img, 0, 0, imagecolorallocate($img, 200, 120, 40));
        ob_start();
        imagepng($img);
        Storage::disk('public')->put('labels/momo.png', (string) ob_get_clean());
        $media = Media::query()->create(['disk' => 'public', 'path' => 'labels/momo.png', 'media_type' => 'image', 'mime_type' => 'image/png']);
        $real = getenv('LABEL_DUMP_PHOTO') ?: '';
        if ($real !== '' && is_file($real)) {
            Storage::disk('public')->put('labels/momo.png', (string) file_get_contents($real));
        }
        $this->putJson("/api/labels/custom/{$this->momo}", ['name' => 'Chicken Momo', 'label_photo_media_id' => $media->id])->assertOk();
        foreach (['gold' => [140, 62], 'clear' => [120, 53], 'kraft' => [160, 70], 'mono' => [140, 62]] as $look => [$w, $h]) {
            $this->putJson("/api/labels/custom/{$this->momo}", ['name' => 'Chicken Momo', 'label_pouch' => ['look' => $look, 'method' => $look === 'kraft' ? 'pan_fry' : 'microwave', 'tagline' => 'Steamed · Frozen · Handmade', 'size_word' => 'Medium']])->assertOk();
            [$html, $res] = $this->sheet([], ['w' => $w, 'h' => $h]);
            $this->dump("pouch-photo-{$look}-{$w}", $html);
            $this->assertContains('photo', array_column($res['summary']['spots'], 'key'));
            $this->assertSame([], $res['summary']['dropped']);
        }

        // The circle: the middle square, the corners clear.
        $label = CustomLabel::query()->findOrFail($this->momo);
        $sheets = app(StickerSheet::class);
        $data = $sheets->stickerData($label, ['batch' => '', 'qty' => '', 'mfg' => '', 'exp' => '', 'for' => '', 'for2' => '', 'codes' => [], 'lang' => 'en', 'fill' => false, 'size' => null], $sheets->common());
        $round = imagecreatefromstring((string) base64_decode(substr(PouchDesign::circle((string) $data['photo']), 22)));
        $this->assertSame(imagesx($round), imagesy($round));
        $this->assertSame(127, (imagecolorat($round, 1, 1) >> 24) & 0x7F, 'a corner is clear');
        $this->assertSame(0, (imagecolorat($round, intdiv(imagesx($round), 2), intdiv(imagesy($round), 2)) >> 24) & 0x7F, 'the middle is the photo');

        // The PDF (what a phone prints) draws it, script face and all.
        $res = $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $this->momo, 'kind' => 'custom', 'copies' => 1]], 'layout' => 'single-custom', 'fill' => true, 'w' => 140, 'h' => 62])->assertOk();
        $pdf = (string) $this->get($res->json('pdf_url'))->assertOk()->getContent();
        $this->assertStringStartsWith('%PDF', $pdf);
        $dir = getenv('LABEL_DUMP') ?: '';
        if ($dir !== '' && is_dir($dir)) {
            file_put_contents("{$dir}/pouch.pdf", $pdf);
        }
    }

    public function test_the_built_in_pouch_templates_are_valid_and_their_size_is_offered(): void
    {
        $ids = array_column(LabelTemplates::BUILTIN, 'id');
        foreach (['momo-pouch', 'momo-pouch-steam', 'momo-pouch-fry', 'pouch-any'] as $id) {
            $this->assertContains($id, $ids);
        }
        $presets = array_column(StickerLayouts::PRESETS, null, 'id');
        foreach (LabelTemplates::BUILTIN as $b) {
            if (!isset($b['fields']['label_pouch'])) {
                continue;
            }
            $v = validator(['fields' => $b['fields']], LabelTemplates::rules());
            $this->assertTrue($v->passes(), $b['id'] . ': ' . implode(' ', $v->errors()->all()));
            $size = $presets[$b['size']['preset']];
            $this->assertTrue(PouchConfig::fits('rect', $size['w'], $size['h']), $b['id'] . ' prints at a size that draws the pouch design');
            $this->assertNotNull(LabelTemplates::normaliseSize($b['size']));
            $this->assertSame($b['fields']['label_pouch']['method'], LabelTemplates::normaliseFields($b['fields'])['label_pouch']['method']);
        }
        foreach (['r120x53', 'r140x62', 'r160x70'] as $preset) {
            $this->assertArrayHasKey($preset, $presets);
            $this->assertNotSame('wrap', StickerLayouts::design('rect', $presets[$preset]['w'], $presets[$preset]['h']), 'the size\'s own design is unchanged for other products');
        }
        $layouts = $this->getJson('/api/labels/layouts')->assertOk();
        $this->assertSame(array_keys(PouchConfig::LOOKS), array_column($layouts->json('pouch.looks'), 'key'));
        $this->assertSame(array_keys(PouchConfig::METHODS), array_column($layouts->json('pouch.methods'), 'key'));
    }
}

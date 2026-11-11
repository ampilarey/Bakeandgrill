<?php

declare(strict_types=1);

namespace Tests\Feature\Labels;

use App\Domains\Labels\LabelText;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\SiteSetting;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Label audit, 2026-11-11 (owner: "Audit the whole label generator and fix all
 * issues"): a long name and a full list on every size. The list prints whole
 * before anything optional does, a name too long for its box ends "…" and is
 * never drawn over what is beside it, and a list that had to be cut says so.
 */
class LabelAuditFitTest extends TestCase
{
    use RefreshDatabase;

    private const INGREDIENTS = 'Wheat flour, chicken, onion, curry leaves, chilli, ginger, garlic, coconut, lime, salt, vegetable oil, turmeric, cumin, pepper.';

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

    private function label(): int
    {
        return (int) $this->postJson('/api/labels/custom', [
            'name' => 'Chicken Kulhi Bajiya With Extra Filling', 'name_dv' => 'ކުކުޅު ކުޅި ބަޖިޔާ',
            'label_ingredients' => self::INGREDIENTS, 'label_ingredients_dv' => 'ފުށް، ކުކުޅު، ފިޔާ، ހިކަނދިފަތް، މިރުސް، އިނގުރު، ލޮނުމެދު، ކާށި، ލުނބޯ، ލޮނު',
            'label_storage' => 'frozen', 'label_shelf_life_days' => 90, 'label_pack_qty' => 12, 'label_pack_unit' => 'PCS', 'label_price' => 45,
            'label_barcode' => '2000000123455', 'label_net_weight' => '300 g', 'label_allergens' => 'wheat',
            'label_how_to_use' => 'Deep fry from frozen in hot oil for 4 to 5 minutes until golden.', 'label_note' => 'Made in a kitchen that handles nuts.',
        ])->assertCreated()->json('data.id');
    }

    /** @return array{0: string, 1: array<string, mixed>} the sticker's page and its summary */
    private function sticker(int $id, float $w, float $h, string $lang, string $layout = 'single-custom'): array
    {
        $res = $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $id, 'kind' => 'custom', 'copies' => 1]], 'layout' => $layout, 'w' => $w, 'h' => $h, 'lang' => $lang, 'fill' => true, 'preview' => true])->assertOk();

        return [(string) $this->get($res->json('view_url') ?? $res->json('url'))->assertOk()->getContent(), (array) $res->json('summary')];
    }

    public function test_the_big_sticker_prints_the_whole_list_with_a_barcode_how_to_use_and_a_note(): void
    {
        $id = $this->label();
        foreach (['en', 'both'] as $lang) {
            [$html, $summary] = $this->sticker($id, 105, 148.5, $lang, 'single-105x148');
            $this->assertSame('full', $summary['design']);
            // The end of the list: it was cut after "salt," with half the list gone.
            $this->assertStringContainsString('pepper.', $html, "the whole list prints ({$lang})");
            $this->assertNotContains('Part of the ingredients', $summary['dropped'] ?? []);
            $this->assertStringContainsString('2 000000 123455', $html, 'the barcode keeps its place');
            $this->assertStringContainsString('Made in a kitchen that handles nuts.', $html);
        }
    }

    public function test_a_name_too_long_for_a_small_label_ends_with_dots_and_a_cut_list_says_so(): void
    {
        $id = $this->label();
        [$html, $summary] = $this->sticker($id, 40, 30, 'en');
        $this->assertStringContainsString('…', $html);
        $this->assertStringNotContainsString('>Chicken Kulhi Bajiya With Extra Filling<', $html, 'the whole name does not fit 40 mm');
        [, $round] = $this->sticker($id, 60, 60, 'en', 'single-round-custom');
        $this->assertContains('Part of the ingredients', $round['dropped'] ?? [], 'a 6 cm round label cannot hold the list, and the screen is told');
    }

    public function test_a_narrow_sticker_breaks_its_storage_line_and_keeps_the_footer_apart(): void
    {
        $id = $this->label();
        [$html, $summary] = $this->sticker($id, 50, 80, 'en');
        $this->assertSame('mini', $summary['design']);
        $this->assertStringContainsString('>KEEP FROZEN AT -18°C OR BELOW<', $html, 'the storage line on two lines');
        $this->assertStringContainsString('>DO NOT REFREEZE ONCE THAWED<', $html);
        $this->assertStringContainsString('+960 912 0011', $html);
    }

    public function test_text_is_cut_to_its_box_with_dots(): void
    {
        $text = 'Chicken Kulhi Bajiya With Extra Filling';
        $this->assertSame($text, LabelText::clip($text, 6, 200, 'dsi'));
        $cut = LabelText::clip($text, 9, 30, 'dsi');
        $this->assertStringEndsWith('…', $cut);
        $this->assertLessThanOrEqual(30.0, LabelText::widthMm($cut, 9, 'dsi'));
        $lines = LabelText::cut(['one', 'two', 'three four five six seven eight nine ten'], 2, 6, 14, 'j4');
        $this->assertCount(2, $lines);
        $this->assertStringStartsWith('two three', $lines[1]);
        $this->assertStringEndsWith('…', $lines[1], 'a list cut short says so');
        $this->assertLessThanOrEqual(14.0, LabelText::widthMm($lines[1], 6, 'j4'));
        $this->assertSame(['one', 'two'], LabelText::cut(['one', 'two'], 2, 6, 14, 'j4'));
    }
}

<?php

declare(strict_types=1);

namespace Tests\Feature\Labels;

use App\Domains\Labels\LabelSettings;
use App\Domains\Labels\LabelText;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Item;
use App\Models\SiteSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Owner, 2026-10-12: "dhivehi font is not nice". Stickers set Dhivehi in
 * Noto Sans Thaana, headings in its true bold, unless Labels → Settings
 * picks Faruma (the classic face, thickened by hand) or the website's
 * uploaded font.
 */
class LabelDhivehiFontTest extends TestCase
{
    use RefreshDatabase;

    private Item $bajiya;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $this->bajiya = $this->makeItem(false, 0, [
            'name' => 'Bajiya', 'name_dv' => 'ބާޖިޔާ', 'label_enabled' => true, 'label_shelf_life_days' => 90,
            'label_ingredients_source' => 'manual', 'label_ingredients' => 'Flour, salt, oil',
            'label_ingredients_dv' => 'ފުށް، ލޮނު، ތެޔޮ',
        ]);
    }

    public function test_the_shipped_noto_files_exist_and_are_the_default_face(): void
    {
        foreach (['fonts/pdf/NotoSansThaana-Regular.ttf', 'fonts/pdf/NotoSansThaana-Bold.ttf', 'fonts/noto-sans-thaana-400.woff2', 'fonts/noto-sans-thaana-700.woff2', 'fonts/NOTO-SANS-THAANA-LICENSE.txt'] as $file) {
            $this->assertFileExists(public_path($file));
        }
        $face = LabelText::dvFace();
        $this->assertSame('noto', $face['key']);
        $this->assertStringEndsWith('NotoSansThaana-Regular.ttf', $face['pdf']);
        $this->assertStringEndsWith('NotoSansThaana-Bold.ttf', (string) $face['bold_pdf']);
        $this->assertTrue(LabelText::dvHasBold());
        // Text is measured in the bold, the wider of the two.
        $this->assertStringEndsWith('NotoSansThaana-Bold.ttf', LabelText::file('dv'));
        $this->assertGreaterThan(0, LabelText::widthMm('ބާޖިޔާ', 10, 'dv'));
        $this->assertEqualsWithDelta(1.069, LabelText::ascent('dv'), 0.001);
    }

    public function test_the_sheet_embeds_noto_with_its_bold_and_sets_dhivehi_headings_in_it(): void
    {
        $res = $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $this->bajiya->id, 'copies' => 1]], 'lang' => 'dv', 'layout' => 'a4-4'])->assertOk();
        $html = (string) $this->get($res->json('view_url'))->assertOk()->getContent();
        $this->assertStringContainsString("url('/fonts/noto-sans-thaana-400.woff2') format('woff2'); font-weight: normal", $html);
        $this->assertStringContainsString("url('/fonts/noto-sans-thaana-700.woff2') format('woff2'); font-weight: bold", $html);
        $this->assertStringContainsString('.f-dv.b { font-weight: bold; }', $html);
        // The rule that puts Dhivehi in the face at all: Blade once escaped
        // its quotes to &#039;, so browsers dropped it and drew a system font.
        $this->assertStringContainsString(".f-dv { font-family: 'LabelDV', 'LabelJ7'; font-weight: normal; font-style: normal; }", $html);
        $this->assertStringNotContainsString('&#039;', $html);
        $this->assertStringContainsString('class="pc tx f-dv b"', $html, 'the name is a true-bold heading');
        $this->assertStringContainsString('class="pc tx f-dv"', $html, 'the ingredients stay regular');
        $this->assertStringNotContainsString('a_faruma', $html);

        $pdf = (string) $this->get($res->json('pdf_url'))->assertOk()->getContent();
        $this->assertStringStartsWith('%PDF', $pdf);
    }

    public function test_faruma_can_be_picked_back_and_is_thickened_by_hand(): void
    {
        $this->putJson('/api/labels/settings', ['label_dhivehi_font' => 'faruma'])->assertOk()->assertJsonPath('data.label_dhivehi_font', 'faruma');
        $this->assertSame('faruma', LabelSettings::dhivehiFont());
        $this->assertFalse(LabelText::dvHasBold());
        $this->assertStringEndsWith('a_faruma.ttf', LabelText::file('dv'));
        $this->assertEqualsWithDelta(1.139, LabelText::ascent('dv'), 0.001);

        $res = $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $this->bajiya->id, 'copies' => 1]], 'lang' => 'dv', 'layout' => 'a4-4'])->assertOk();
        $html = (string) $this->get($res->json('view_url'))->assertOk()->getContent();
        $this->assertStringContainsString("url('/fonts/a_faruma.woff2')", $html);
        $this->assertStringNotContainsString('noto-sans-thaana', $html);
        $this->assertStringNotContainsString('f-dv b"', $html);
    }

    public function test_the_website_font_is_used_when_picked_and_the_pdf_falls_back_to_faruma_for_a_woff2(): void
    {
        SiteSetting::set('label_dhivehi_font', 'site');
        $face = LabelText::dvFace();
        $this->assertSame('site', $face['key']);
        $this->assertStringEndsWith('a_faruma.ttf', $face['pdf']);
        $this->assertSame('/fonts/a_faruma.woff2', $face['web']);
        $this->assertNull($face['bold_pdf']);
    }

    public function test_an_unknown_font_is_refused_and_a_bad_stored_value_falls_back_to_noto(): void
    {
        $this->putJson('/api/labels/settings', ['label_dhivehi_font' => 'comic'])->assertStatus(422);
        SiteSetting::set('label_dhivehi_font', 'comic');
        $this->assertSame('noto', LabelSettings::dhivehiFont());
        $this->assertSame('noto', LabelText::dvFace()['key']);
    }
}

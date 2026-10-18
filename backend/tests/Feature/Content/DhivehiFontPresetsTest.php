<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use App\Domains\Content\ContentWriter;
use App\Domains\Content\DhivehiFont;
use App\Domains\Labels\LabelSettings;
use App\Domains\Labels\LabelText;
use App\Models\SiteSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

/** The Dhivehi font is picked from shipped faces or uploaded (App\Domains\Content\DhivehiFont::PRESETS). */
class DhivehiFontPresetsTest extends TestCase
{
    use RefreshDatabase;

    public function test_every_shipped_face_has_its_files(): void
    {
        foreach (DhivehiFont::PRESETS as $key => $p) {
            foreach (['regular', 'bold'] as $w) {
                if ($p[$w] !== null) {
                    $this->assertFileExists(public_path(ltrim($p[$w], '/')), "{$key} {$w}");
                }
            }
            $this->assertFileExists(public_path($p['pdf']), "{$key} pdf");
        }
    }

    public function test_a_picked_face_is_what_the_stylesheet_points_every_stack_at(): void
    {
        $this->get('/css/dhivehi-font.css?app=website')->assertOk()->assertSee('default A_Faruma', false);

        SiteSetting::set('dhivehi_font', 'preset:noto', 'website', 'en');
        $css = (string) $this->get('/css/dhivehi-font.css?app=website')->assertOk()->getContent();
        $this->assertStringContainsString("font-family: 'BG Noto Sans Thaana'", $css);
        $this->assertStringContainsString("url('/fonts/noto-sans-thaana-700.woff2')", $css);
        $this->assertStringContainsString("--font-thaana: 'BG Noto Sans Thaana', 'A_Faruma'", $css);

        SiteSetting::set('dhivehi_font', 'preset:device', 'website', 'en');
        $this->assertStringContainsString("--font-thaana: 'Noto Sans Thaana', 'MV Faseyha'", DhivehiFont::stylesheet('order_app'));
        $this->assertStringNotContainsString('@font-face', DhivehiFont::stylesheet('order_app'));
    }

    public function test_only_offered_faces_and_uploads_can_be_saved(): void
    {
        $writer = app(ContentWriter::class);
        $writer->write('dhivehi_font', 'website', 'preset:freeserif');
        $this->assertSame('preset:freeserif', SiteSetting::getScoped('dhivehi_font', 'website', 'en'));

        $this->expectException(ValidationException::class);
        $writer->write('dhivehi_font', 'website', 'preset:comic-sans');
    }

    public function test_labels_and_the_menu_pdf_follow_the_websites_pick(): void
    {
        SiteSetting::set('dhivehi_font', 'preset:freeserif', 'website', 'en');
        $this->assertSame(public_path('fonts/pdf/FreeSerifThaana-400.ttf'), DhivehiFont::pdfFile());

        LabelSettings::save(['label_dhivehi_font' => 'site']);
        $face = LabelText::dvFace();
        $this->assertSame('freeserif', $face['key']);
        $this->assertNotNull($face['bold_pdf']);
    }

    public function test_the_link_changes_with_the_font_so_no_cache_keeps_the_old_one(): void
    {
        $before = DhivehiFont::href('website');
        $this->assertMatchesRegularExpression('#^/css/dhivehi-font\.css\?app=website&v=[0-9a-f]{12}$#', $before);
        $this->get('/')->assertSee(e($before), false);

        SiteSetting::set('dhivehi_font', 'preset:noto', 'website', 'en');
        $after = DhivehiFont::href('website');
        $this->assertNotSame($before, $after);
        $this->get('/')->assertSee(e($after), false);

        // The version in the link is the sheet's own: kept for a year; the bare address and
        // an old version are asked again every minute.
        $this->get($after)->assertHeader('Cache-Control', 'immutable, max-age=31536000, public');
        $this->get($before)->assertHeader('Cache-Control', 'max-age=60, must-revalidate, public');
        $this->get('/css/dhivehi-font.css?app=website')->assertHeader('Cache-Control', 'max-age=60, must-revalidate, public');

        $html = '<link rel="stylesheet" href="/css/dhivehi-font.css?app=order_app" />';
        $this->assertStringContainsString('href="' . DhivehiFont::href('order_app') . '"', DhivehiFont::versionLinks($html));
    }
}

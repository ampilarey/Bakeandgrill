<?php

declare(strict_types=1);

namespace Tests\Feature\Posters;

use App\Domains\Posters\PaperSize;
use App\Domains\Posters\Pdf\OutputIntent;
use App\Domains\Posters\Pdf\PdfX4Document;
use App\Domains\Posters\Pdf\PosterFonts;
use App\Domains\Posters\Spike\HeroPoster;
use App\Domains\Posters\Spike\SwatchCard;
use App\Domains\Posters\Spike\WhiteMask;
use Tests\TestCase;

/**
 * What a PDF/X-4 preflight reads from the file (docs/POSTER_PLAN.md
 * § 6.1, § 12.4): version, output intent, page boxes, XMP and Info keys,
 * every font embedded, every picture profiled. The press profile is not
 * in the repository, so TCPDF's sRGB stands in for the embedding check.
 */
class PdfX4DocumentTest extends TestCase
{
    private string $fontCache;

    protected function setUp(): void
    {
        parent::setUp();
        $this->fontCache = sys_get_temp_dir() . '/bg-poster-fonts-test';
        config()->set('posters.font_cache', $this->fontCache);
    }

    private function intent(bool $withProfile): OutputIntent
    {
        return new OutputIntent(
            'FOGRA39 (ISO 12647-2:2004)',
            'FOGRA39',
            'http://www.color.org',
            'Coated FOGRA39 (ISO 12647-2:2004)',
            $withProfile ? 3 : 4,
            $withProfile ? base_path('vendor/tecnickcom/tcpdf/include/sRGB.icc') : null,
        );
    }

    private function assertPdfX4(string $pdf, PaperSize $size): void
    {
        $k = 72 / 25.4;
        $box = static fn (float $x0, float $y0, float $x1, float $y1): string => sprintf('[%F %F %F %F]', $x0, $y0, $x1, $y1);

        $this->assertStringStartsWith('%PDF-1.6', $pdf);
        $this->assertStringContainsString('/S /GTS_PDFX', $pdf);
        $this->assertStringContainsString('/OutputConditionIdentifier', $pdf);
        $this->assertStringContainsString('/GTS_PDFXVersion (PDF/X-4)', $pdf);
        $this->assertStringContainsString('/Trapped /False', $pdf);
        $this->assertStringContainsString('<pdfxid:GTS_PDFXVersion>PDF/X-4</pdfxid:GTS_PDFXVersion>', $pdf);
        $this->assertStringContainsString('/MediaBox ' . $box(0, 0, $size->bleedWidth() * $k, $size->bleedHeight() * $k), $pdf);
        $this->assertStringContainsString('/BleedBox ' . $box(0, 0, $size->bleedWidth() * $k, $size->bleedHeight() * $k), $pdf);
        $this->assertStringContainsString('/TrimBox ' . $box($size->bleed * $k, $size->bleed * $k, ($size->bleed + $size->trimWidth) * $k, ($size->bleed + $size->trimHeight) * $k), $pdf);
        $this->assertStringNotContainsString('/Helvetica', $pdf, 'no non-embedded core font');
        $this->assertStringNotContainsString('/Encrypt', $pdf);
        $this->assertStringNotContainsString('/JavaScript', $pdf);
        $this->assertStringContainsString('/FontFile2', $pdf, 'TrueType fonts are embedded');
    }

    public function test_a_page_of_text_meets_the_pdf_x4_checks(): void
    {
        $size = PaperSize::named('A4');
        $pdf = new PdfX4Document($this->intent(true), 'Test');
        $pdf->SetCompression(false);
        $pdf->addPosterPage($size);
        PosterFonts::use($pdf, 'j7', 24);
        $pdf->SetTextColorArray([0, 0, 0, 100]);
        $pdf->SetXY(20, 20);
        $pdf->Cell(100, 10, 'Hello', 0, 0, 'L');
        $pdf->fillPath([['M', [10.0, 10.0]], ['L', [20.0, 10.0]], ['L', [20.0, 20.0]], ['Z', []]], [0, 59, 93, 28]);
        $bytes = $pdf->bytes();

        $this->assertPdfX4($bytes, $size);
        $this->assertStringContainsString('/DestOutputProfile', $bytes);
        $this->assertStringContainsString('/N 3', $bytes, 'the stand-in profile has three components');
        $this->assertSame(1, substr_count($bytes, '/Type /OutputIntent'));
        // The path is drawn in CMYK, scaled to points, y measured from the bottom.
        $this->assertMatchesRegularExpression('/0\.000000 0\.590000 0\.930000 0\.280000 k/', $bytes);
    }

    public function test_without_a_profile_the_intent_is_named_by_registry_only(): void
    {
        $size = PaperSize::named('A5');
        $pdf = new PdfX4Document($this->intent(false), 'Test');
        $pdf->addPosterPage($size);
        $bytes = $pdf->bytes();

        $this->assertPdfX4($bytes, $size);
        $this->assertStringContainsString('/RegistryName', $bytes);
        $this->assertStringNotContainsString('/DestOutputProfile', $bytes);
    }

    public function test_the_hero_poster_mask_and_swatch_card_render_as_pdf_x4(): void
    {
        $size = PaperSize::named('A5');
        $result = (new HeroPoster($size, [
            'eyebrow' => 'New',
            'headline' => 'Chicken Tikka',
            'headline_dv' => 'ޗިކަން ޓިކާ',
            'price' => 'From MVR 85.00',
            'gst_line' => 'Prices include GST',
            'gst_line_dv' => 'އަގުތަކުގައި ޖީއެސްޓީ ހިމެނޭ',
            'qr_url' => 'https://bakeandgrill.mv/menu',
        ], $this->intent(true)))->render();

        $this->assertPdfX4($result['pdf'], $size);
        $this->assertStringContainsString('/ColorSpace [/ICCBased', $result['pdf'], 'the photo carries its profile');
        $this->assertContains('dvb', $result['fonts'], 'the Dhivehi headline face is used');
        $this->assertNotEmpty($result['ink']['rects']);
        $this->assertNotEmpty($result['ink']['paths'], 'the logo paths count as ink');
        $this->assertEqualsWithDelta(HeroPoster::PPI['A5'], $result['photo']['ppi'], 1.0);

        $mask = WhiteMask::render($size, $result['ink'], $this->intent(true), 'Mask');
        $this->assertPdfX4($mask, $size);
        $this->assertStringNotContainsString('/Subtype /Image', $mask, 'a mask has no pictures');

        $card = SwatchCard::render($this->intent(true), '1 Jan 2026');
        $this->assertPdfX4($card, $size);
    }
}

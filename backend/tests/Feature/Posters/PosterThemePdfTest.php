<?php

declare(strict_types=1);

namespace Tests\Feature\Posters;

use App\Domains\Posters\BrandCmyk;
use App\Domains\Posters\PaperSize;
use App\Domains\Posters\PosterContent;
use App\Domains\Posters\PosterPdf;
use App\Domains\Posters\PosterPieces;
use App\Domains\Posters\PosterPreflight;
use App\Domains\Posters\PosterPurposes;
use App\Domains\Posters\PosterThemePieces;
use App\Domains\Posters\PosterThemes;
use Illuminate\Foundation\Testing\RefreshDatabase;
use RuntimeException;
use Tests\TestCase;

/**
 * The print file of a poster drawn on a template (docs/POSTER_THEMES_HANDOFF.md
 * § 5): the right page at every size with the PDF/X-4 marks, the artwork's
 * gradients, alpha, strokes, even-odd fills and photo clips in the content
 * stream, type never under the floor, and the words and prices the design
 * reads from the poster.
 */
class PosterThemePdfTest extends TestCase
{
    use RefreshDatabase;

    private string $fontCache;

    protected function setUp(): void
    {
        parent::setUp();
        $this->fontCache = sys_get_temp_dir() . '/bg-poster-fonts-test';
        config()->set('posters.font_cache', $this->fontCache);
    }

    /** @return array<string, mixed> */
    private function poster(string $theme, array $slots = [], array $bindings = []): array
    {
        return [
            'template_key' => PosterPurposes::THEMED, 'layout' => PosterPurposes::THEMED, 'theme' => $theme,
            'language' => 'en', 'slots' => $slots, 'bindings' => $bindings,
        ];
    }

    /** @return array{0: string, 1: array<string, mixed>} the PDF (uncompressed) and the built sheet */
    private function render(string $theme, string $size, array $slots = []): array
    {
        $poster = $this->poster($theme, $slots);
        $paper = PaperSize::named($size);
        $built = PosterPieces::build($poster, $paper, PosterContent::resolve($poster));
        $out = PosterPdf::render($paper, [[['ox' => 0.0, 'oy' => 0.0, 'scale' => 1.0, 'rotate' => 0, 'built' => $built]]], 'Test', ['compress' => false]);

        return [$out['pdf'], $built];
    }

    public function test_a_themed_poster_prints_at_every_size_as_pdf_x4(): void
    {
        $k = 72 / 25.4;
        $box = static fn (float $x0, float $y0, float $x1, float $y1): string => sprintf('[%F %F %F %F]', $x0, $y0, $x1, $y1);
        foreach (['A2' => [426, 600], 'A3' => [303, 426], 'A4' => [216, 303], 'A5' => [154, 216]] as $size => [$w, $h]) {
            [$pdf, $built] = $this->render('bg012-value-meals-menu', $size);
            $this->assertStringStartsWith('%PDF-1.6', $pdf, $size);
            $this->assertStringContainsString('/MediaBox ' . $box(0, 0, $w * $k, $h * $k), $pdf, $size);
            $this->assertStringContainsString('/TrimBox ' . $box(3 * $k, 3 * $k, ($w - 3) * $k, ($h - 3) * $k), $pdf, $size);
            $this->assertStringContainsString('/S /GTS_PDFX', $pdf, $size);
            $this->assertStringContainsString('/GTS_PDFXVersion (PDF/X-4)', $pdf, $size);
            $this->assertStringContainsString('/FontFile2', $pdf, $size . ' embeds its TrueType fonts');
            $this->assertStringNotContainsString('/Helvetica', $pdf, $size);
            $this->assertStringContainsString('/ColorSpace [/ICCBased', $pdf, $size . ' profiles its pictures');
            $this->assertSame($size === 'A2' || $size === 'A3' ? 'large' : 'small', $built['theme']['variant'], $size);
            $this->assertEqualsWithDelta($w, $built['w'], 1e-9);
            $this->assertEqualsWithDelta($h, $built['h'], 1e-9);
            $this->assertFalse($built['flags']['overflow'], $size);
            $this->assertFalse($built['flags']['shrunk'], $size . ' the designed words fit as they are');
        }
    }

    public function test_the_artwork_features_each_reach_the_content_stream(): void
    {
        // Gradient (the page's own fill), photo clips and the cream badge.
        [$pdf] = $this->render('bg012-value-meals-menu', 'A4');
        $this->assertStringContainsString('/ShadingType 2', $pdf, 'a linear gradient');
        $this->assertMatchesRegularExpression('/\/Sh\d+ sh/', $pdf, 'the gradient is painted');
        $this->assertMatchesRegularExpression('/ c h W n\n/', $pdf, 'a curved photo clip');
        $this->assertSame(3, substr_count($pdf, '/Subtype /Image'), 'three photo slots, one picture each');
        $this->assertStringContainsString('/Type /XObject', $pdf);

        // Radial gradient and alpha.
        [$pdf] = $this->render('bg001-flash-sale-pastries', 'A4');
        $this->assertStringContainsString('/ShadingType 3', $pdf, 'a radial gradient');
        $this->assertMatchesRegularExpression('/\/GS\d+ gs/', $pdf, 'an ExtGState for the alpha');
        $this->assertMatchesRegularExpression('/\/ca 0\.\d+/', $pdf, 'a non-stroking alpha under 1');

        // Strokes with a dash and a round cap.
        [$pdf] = $this->render('bg008-burger-combo-tag', 'A4');
        $this->assertMatchesRegularExpression('/\d+\.\d+ w \[\d+\.\d+ \d+\.\d+\] 0 d \d J \d j/', $pdf, 'a dashed stroke with its width and cap');
        $this->assertMatchesRegularExpression('/ S\n/', $pdf, 'a stroke-only path');

        // Even-odd: as a flat fill, and as the clip of a gradient.
        [$pdf] = $this->render('bg026-fries-friday', 'A4');
        $this->assertMatchesRegularExpression('/ h f\*\n/', $pdf, 'an even-odd fill');
        [$pdf] = $this->render('bg015-grill-combo-mvr99', 'A4');
        $this->assertMatchesRegularExpression('/ h W\* n\n/', $pdf, 'an even-odd clip under a gradient');

        // A rectangle clip on an item, and a bare QR in the design's ink.
        [$pdf, $built] = $this->render('bg087-order-online-15-off', 'A4');
        $this->assertMatchesRegularExpression('/ re W n\n/', $pdf, 'a clip_rect');
        $qr = array_values(array_filter($built['pieces'], static fn (array $p): bool => $p['type'] === 'qr'));
        $this->assertCount(1, $qr);
        $this->assertTrue($qr[0]['bare']);
        $this->assertSame(BrandCmyk::chosen('brown'), $qr[0]['cmyk']);
        $this->assertStringEndsWith('/menu', (string) $qr[0]['url'], 'an unsaved poster\'s QR points straight at the menu');

        // A polaroid turns its photo about the slot's centre.
        [$pdf, $built] = $this->render('bg043-short-eats-polaroid', 'A3');
        $photo = array_values(array_filter($built['pieces'], static fn (array $p): bool => $p['type'] === 'photo'))[0];
        $this->assertEqualsWithDelta(-3.5, $photo['rotation'], 1e-9);
        $this->assertMatchesRegularExpression('/0\.99813\d* 0\.0610\d* -0\.0610\d* 0\.99813\d* [-\d.]+ [-\d.]+ cm/', $pdf, 'a 3.5 degree rotation matrix');
    }

    public function test_the_poster_words_prices_and_photo_land_on_the_page(): void
    {
        $upload = $this->uploadedPhoto();
        $poster = $this->poster('bg012-value-meals-menu', [
            't2' => 'TIKKA DEALS',
            't3' => 'CHICKEN TIKKA',
            't18' => false,
            'p1' => ['photo_path' => $upload],
        ]);
        foreach (['A2', 'A5'] as $size) {
            $paper = PaperSize::named($size);
            $built = PosterPieces::build($poster, $paper, PosterContent::resolve($poster));
            $texts = [];
            foreach ($built['pieces'] as $piece) {
                if ($piece['type'] === 'text') {
                    $texts[$piece['slot']] = $piece;
                }
            }
            $this->assertSame('TIKKA DEALS', $texts['t2']['text'], $size);
            $this->assertSame('anton', $texts['t2']['font'], $size);
            $this->assertSame('CHICKEN TIKKA', $texts['t3']['text'], $size);
            $this->assertSame('MEAL DEALS' === $texts['t2']['text'], false);
            $this->assertArrayNotHasKey('t18', $texts, $size . ' a blanked line prints nothing');
            $this->assertSame('Terms & conditions apply', PosterThemes::get('bg012-value-meals-menu')['variants']['large']['text_slots'][17]['default']);
            $this->assertSame('center', $texts['t2']['align']);
            $this->assertEqualsWithDelta($texts['t2']['anchor'], $texts['t2']['x'] + $texts['t2']['w'] / 2, 0.01, $size . ' centred on its anchor');
            $this->assertNotNull($texts['t2']['shadow'], 'the headline keeps its hard shadow');
            $this->assertGreaterThan(0, $texts['t2']['tracking'], 'the headline keeps its tracking');
            $this->assertGreaterThanOrEqual($built['theme']['min_pt'] - 0.01, min(array_column($texts, 'pt')), $size . ' nothing under the floor');
            $expected = $size === 'A2' ? 170.1 : 59.9;
            $this->assertEqualsWithDelta($expected, $texts['t2']['pt'], 0.2, $size . ' headline size');

            $photos = [];
            foreach ($built['pieces'] as $piece) {
                if ($piece['type'] === 'photo') {
                    $photos[$piece['slot']] = $piece;
                }
            }
            $this->assertSame('upload', $photos['p1']['source'], $size);
            $this->assertSame($upload, $photos['p1']['photo_path']);
            $this->assertFileExists((string) $photos['p1']['path']);
            $this->assertSame('placeholder', $photos['p2']['source'], $size . ' an unchosen slot shows the design\'s placeholder');
            $this->assertFileExists((string) $photos['p2']['path']);
            $this->assertStringStartsWith('M ', $photos['p1']['clip_d']);
            $this->assertStringEndsWith('Z', $photos['p1']['clip_d']);
        }
    }

    public function test_long_words_shrink_to_the_slot_but_never_under_the_floor(): void
    {
        $poster = $this->poster('bg012-value-meals-menu', ['t2' => 'A VERY MUCH LONGER HEADLINE THAN THE DESIGN HAD IN MIND']);
        $paper = PaperSize::named('A5');
        $built = PosterPieces::build($poster, $paper, PosterContent::resolve($poster));
        $t2 = array_values(array_filter($built['pieces'], static fn (array $p): bool => $p['type'] === 'text' && $p['slot'] === 't2'))[0];
        $this->assertTrue($built['flags']['shrunk']);
        $this->assertLessThan(59.9, $t2['pt']);
        $this->assertGreaterThanOrEqual($built['theme']['min_pt'] - 0.01, $t2['pt']);
        $this->assertLessThanOrEqual($t2['max_w'] + 0.05, $t2['w']);
        $this->assertFalse($built['flags']['overflow']);

        $poster = $this->poster('bg012-value-meals-menu', ['t2' => str_repeat('WIDE ', 40)]);
        $built = PosterPieces::build($poster, $paper, PosterContent::resolve($poster));
        $t2 = array_values(array_filter($built['pieces'], static fn (array $p): bool => $p['type'] === 'text' && $p['slot'] === 't2'))[0];
        $this->assertTrue($built['flags']['overflow'], 'what cannot fit at the floor is flagged, not shrunk further');
        $this->assertEqualsWithDelta($built['theme']['min_pt'], $t2['pt'], 0.01);

        $checks = PosterPreflight::check($poster, PosterContent::resolve($poster), $built, $paper, ['material' => 'foam', 'white' => 'none']);
        $type = array_values(array_filter($checks, static fn (array $c): bool => $c['id'] === 'type'));
        $this->assertSame('ok', $type[0]['level'], 'the A5 variant clears the 9 pt floor');
    }

    public function test_dhivehi_in_a_slot_sets_in_noto_sans_thaana(): void
    {
        $poster = $this->poster('bg012-value-meals-menu', ['t2' => 'މީލް ޑީލްސް', 't18' => 'ޝަރުތުތައް ހިމެނޭ']);
        $built = PosterPieces::build($poster, PaperSize::named('A4'), PosterContent::resolve($poster));
        $texts = [];
        foreach ($built['pieces'] as $piece) {
            if ($piece['type'] === 'text') {
                $texts[$piece['slot']] = $piece;
            }
        }
        $this->assertSame('dvb', $texts['t2']['font'], 'the Anton headline takes the bold Thaana');
        $this->assertSame('dv', $texts['t18']['font'], 'the medium footer line takes the regular Thaana');
        $this->assertTrue($texts['t2']['dv']);
        $this->assertSame('j8', $texts['t16']['font'], 'an untouched Latin line keeps its face');
    }

    public function test_a_poster_without_a_known_template_is_not_drawn(): void
    {
        $poster = ['template_key' => PosterPurposes::THEMED, 'layout' => PosterPurposes::THEMED, 'theme' => 'bg999-nope', 'slots' => [], 'bindings' => []];
        $this->expectException(RuntimeException::class);
        PosterThemePieces::build($poster, PaperSize::named('A4'), []);
    }

    private function uploadedPhoto(): string
    {
        $dir = storage_path('app/posters/photos');
        if (!is_dir($dir)) {
            mkdir($dir, 0775, true);
        }
        $name = bin2hex(random_bytes(12)) . '.jpg';
        $im = imagecreatetruecolor(900, 900);
        imagefilledrectangle($im, 0, 0, 899, 899, (int) imagecolorallocate($im, 200, 90, 30));
        imagejpeg($im, $dir . '/' . $name, 85);
        imagedestroy($im);

        return 'posters/photos/' . $name;
    }
}

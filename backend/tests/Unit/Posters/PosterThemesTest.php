<?php

declare(strict_types=1);

namespace Tests\Unit\Posters;

use App\Domains\Posters\LogoVector;
use App\Domains\Posters\PaperSize;
use App\Domains\Posters\Pdf\PosterFonts;
use App\Domains\Posters\PosterThemes;
use InvalidArgumentException;
use RuntimeException;
use Tests\TestCase;

/**
 * The ready-made designs (docs/POSTER_THEMES_HANDOFF.md § 5): the catalogue
 * is whole, every theme parses with two matching variants, every font is one
 * we embed, every text box, logo and QR sits inside its variant's safe area,
 * no type is under the variant's floor, the artwork is M/L/C/Z only, and
 * the photo markers in the artwork match the photo slots.
 */
class PosterThemesTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        PosterThemes::reset();
    }

    public function test_the_catalogue_has_110_themes_in_13_categories(): void
    {
        $categories = PosterThemes::categories();
        $this->assertCount(13, $categories);
        $this->assertSame(110, array_sum(array_column($categories, 'count')));
        $this->assertSame('disc', $categories[0]['key']);
        $this->assertSame(7, $categories[0]['count']);
        $this->assertSame(['classic', 'colour', 'extra', 'photo'], array_keys(PosterThemes::styles()));

        $all = PosterThemes::all();
        $this->assertCount(110, $all);
        $this->assertSame('BG-001', $all[0]['id']);
        $this->assertSame('BG-110', $all[109]['id']);
        $this->assertCount(50, array_filter($all, static fn (array $row): bool => $row['style'] === 'photo'));
        $this->assertCount(50, array_filter($all, static fn (array $row): bool => $row['has_photo']));
        $this->assertCount(11, PosterThemes::inCategory('combo'));
        $this->assertSame([], PosterThemes::inCategory('nope'));

        $this->assertTrue(PosterThemes::has('bg012-value-meals-menu'));
        $this->assertFalse(PosterThemes::has('nope'));
        $this->assertNull(PosterThemes::get('nope'));
        $this->assertNull(PosterThemes::file('nope', 'preview-large.jpg'));
        $this->assertNull(PosterThemes::file('bg012-value-meals-menu', '../index.json'));
        $this->assertNull(PosterThemes::file('bg012-value-meals-menu', 'theme.json'));
        $this->assertFileExists((string) PosterThemes::file('bg012-value-meals-menu', 'preview-small.jpg'));
    }

    public function test_the_variant_follows_the_paper_size_and_refuses_landscape(): void
    {
        $theme = PosterThemes::get('bg012-value-meals-menu');
        $this->assertNotNull($theme);
        $this->assertSame('large', PosterThemes::variantFor($theme, PaperSize::named('A2'))['variant']);
        $this->assertSame('large', PosterThemes::variantFor($theme, PaperSize::named('A3'))['variant']);
        $this->assertSame('small', PosterThemes::variantFor($theme, PaperSize::named('A4'))['variant']);
        $this->assertSame('small', PosterThemes::variantFor($theme, PaperSize::named('A5'))['variant']);

        $this->expectException(InvalidArgumentException::class);
        PosterThemes::variantFor($theme, PaperSize::named('A4', landscape: true));
    }

    public function test_design_units_map_to_the_page_as_the_handoff_says(): void
    {
        $theme = PosterThemes::get('bg012-value-meals-menu');
        $large = PosterThemes::variantFor($theme, PaperSize::named('A2'));
        $map = PosterThemes::mapping($large, PaperSize::named('A2'));
        $this->assertEqualsWithDelta(1.0, $map['s'], 1e-9);
        $this->assertEqualsWithDelta(0.0, $map['dy'], 1e-9);
        // The design's trim is the page's trim (3 mm in from the page edge); its wider bleed overhangs the page.
        $this->assertSame([3.0, 3.0], PosterThemes::mapPoint($map, 4.25, 4.25));
        $this->assertSame([-1.25, -1.25], PosterThemes::mapPoint($map, 0.0, 0.0));
        [$x, $y] = PosterThemes::mapPoint($map, 4.25 + 420, 4.25 + 594);
        $this->assertEqualsWithDelta(PaperSize::named('A2')->bleedWidth() - 3, $x, 1e-9);
        $this->assertEqualsWithDelta(PaperSize::named('A2')->bleedHeight() - 3, $y, 1e-9);
        $this->assertEqualsWithDelta(170.1, PosterThemes::mapPoints($map, 60), 0.05);
        $this->assertSame([3.0, 3.0, 420.0, 594.0], PosterThemes::mapBox($map, [4.25, 4.25, 420, 594]));

        $small = PosterThemes::variantFor($theme, PaperSize::named('A5'));
        $map = PosterThemes::mapping($small, PaperSize::named('A5'));
        $this->assertEqualsWithDelta(148 / 420, $map['s'], 1e-9);
        $this->assertEqualsWithDelta(0.343, $map['dy'], 0.001);
        [$x, $y] = PosterThemes::mapPoint($map, 9.6, 9.6);
        $this->assertEqualsWithDelta(3.0, $x, 1e-9);
        $this->assertEqualsWithDelta(3.343, $y, 0.001);
        [$x, $y] = PosterThemes::mapPoint($map, 9.6 + 420, 9.6 + 594);
        $this->assertEqualsWithDelta(PaperSize::named('A5')->bleedWidth() - 3, $x, 1e-6);
        $this->assertEqualsWithDelta(PaperSize::named('A5')->bleedHeight() - 3 - 0.343, $y, 0.001);
        $this->assertEqualsWithDelta(9.1, PosterThemes::mapPoints($map, 9.1), 0.05);
        // The design's own bleed still covers the page's: its edge lies outside the page on every side.
        $this->assertLessThan(0.0, PosterThemes::mapPoint($map, 0.0, 0.0)[0]);
        $this->assertGreaterThan(PaperSize::named('A5')->bleedHeight(), PosterThemes::mapPoint($map, 0.0, 613.2)[1]);
    }

    public function test_every_theme_parses_and_its_variants_match_the_handoff(): void
    {
        $fonts = array_keys(PosterFonts::FILES);
        $aspect = LogoVector::fromFile()->aspect();
        foreach (PosterThemes::all() as $row) {
            $key = $row['key'];
            $theme = PosterThemes::get($key);
            $this->assertNotNull($theme, $key);
            $ids = [];
            foreach (PosterThemes::VARIANTS as $name) {
                $variant = $theme['variants'][$name];
                $canvas = $variant['canvas'];
                $inset = (float) $canvas['safe_inset_units'];
                $inside = static fn (array $box): bool => $box[0] >= $inset - 0.05 && $box[1] >= $inset - 0.05
                    && $box[0] + $box[2] <= $canvas['width'] - $inset + 0.05 && $box[1] + $box[3] <= $canvas['height'] - $inset + 0.05;
                $slotIds = [];
                foreach ($variant['text_slots'] as $slot) {
                    $where = "{$key} {$name} {$slot['id']}";
                    $this->assertGreaterThanOrEqual((float) $canvas['min_text_units'] - 0.001, (float) $slot['size_units'], $where . ' is under the floor');
                    $this->assertContains(PosterThemes::FONTS[$slot['font']], $fonts, $where . ' font');
                    $this->assertTrue($inside($slot['box']), $where . ' text box leaves the safe area');
                    $slotIds[] = $slot['id'];
                }
                $photoIds = [];
                foreach ($variant['photo_slots'] as $slot) {
                    $where = "{$key} {$name} {$slot['id']}";
                    $box = $slot['box'];
                    // A photo band may run to the bleed; otherwise it stays inside the safe area.
                    $bleeds = $box[0] <= 0.01 || $box[1] <= 0.01 || $box[0] + $box[2] >= $canvas['width'] - 0.01 || $box[1] + $box[3] >= $canvas['height'] - 0.01;
                    $this->assertTrue($bleeds || $inside($box), $where . ' photo box leaves the safe area without bleeding');
                    $this->assertGreaterThanOrEqual(0.0, $box[0], $where);
                    $this->assertLessThanOrEqual($canvas['width'] + 0.01, $box[0] + $box[2], $where);
                    $photoIds[] = $slot['id'];
                    $slotIds[] = $slot['id'];
                }
                $logo = $variant['logo'];
                $logoW = (float) $logo['height_mm'] * $aspect;
                $this->assertTrue($inside([(float) $logo['centre_x'] - $logoW / 2, (float) $logo['top_y'], $logoW, (float) $logo['height_mm']]), "{$key} {$name} logo leaves the safe area");
                if (is_array($variant['qr'])) {
                    $this->assertTrue($inside([(float) $variant['qr']['x'], (float) $variant['qr']['y'], (float) $variant['qr']['size_mm'], (float) $variant['qr']['size_mm']]), "{$key} {$name} QR leaves the safe area");
                }
                $markers = [];
                foreach (PosterThemes::drawList($theme, $name) as $item) {
                    if (isset($item['photo_slot'])) {
                        $markers[] = (string) $item['photo_slot'];
                    }
                }
                sort($markers);
                sort($photoIds);
                $this->assertSame($photoIds, $markers, "{$key} {$name} photo markers do not match its photo slots");
                sort($slotIds);
                $ids[$name] = $slotIds;
            }
            $this->assertSame($ids['large'], $ids['small'], $key . ' slot ids differ between variants');
            $this->assertSame((int) $row['text_slots'] + (int) $row['photo_slots'], count($ids['large']), $key . ' slot count');
        }
    }

    public function test_a_broken_theme_folder_is_refused_not_patched_over(): void
    {
        $dir = sys_get_temp_dir() . '/bg-poster-themes-' . bin2hex(random_bytes(4));
        mkdir($dir . '/01-Test/bg999-test', 0775, true);
        $real = PosterThemes::root();
        $index = json_decode((string) file_get_contents($real . '/index.json'), true);
        $index['themes'] = [[
            'id' => 'BG-999', 'key' => 'bg999-test', 'title' => 'Test', 'category' => 'disc', 'style' => 'colour',
            'has_photo' => false, 'photo_slots' => 0, 'text_slots' => 1, 'path' => '01-Test/bg999-test',
        ]];
        $index['count'] = 1;
        file_put_contents($dir . '/index.json', json_encode($index));
        $theme = json_decode((string) file_get_contents($real . '/02-Combos-and-Price-Deals/bg012-value-meals-menu/theme.json'), true);
        $theme['id'] = 'BG-999';
        $theme['key'] = 'bg999-test';
        $theme['style'] = 'colour';
        $theme['category']['key'] = 'disc';
        unset($theme['variants']['small']);
        file_put_contents($dir . '/01-Test/bg999-test/theme.json', json_encode($theme));

        config()->set('posters.themes_dir', $dir);
        PosterThemes::reset();
        try {
            $this->assertTrue(PosterThemes::has('bg999-test'));
            $this->expectException(RuntimeException::class);
            $this->expectExceptionMessage('small variant is missing');
            PosterThemes::get('bg999-test');
        } finally {
            config()->set('posters.themes_dir', $real);
            PosterThemes::reset();
            @unlink($dir . '/01-Test/bg999-test/theme.json');
            @unlink($dir . '/index.json');
            @rmdir($dir . '/01-Test/bg999-test');
            @rmdir($dir . '/01-Test');
            @rmdir($dir);
        }
    }
}

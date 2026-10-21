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
 * is whole, every theme parses with matching variants (two for print, two for
 * screens), every font is one we embed, every text box, logo and QR sits
 * inside its variant's safe area, no type is under the variant's floor, the
 * artwork is M/L/C/Z only, and the photo markers in the artwork match the
 * photo slots.
 */
class PosterThemesTest extends TestCase
{
    /** The print designs (BG-001 … BG-110) and the TV designs (TV-001 …). */
    public const PRINT = 110;

    public const SCREEN = 39;

    protected function setUp(): void
    {
        parent::setUp();
        PosterThemes::reset();
    }

    public function test_the_catalogue_has_the_print_and_tv_designs_in_13_categories(): void
    {
        $categories = PosterThemes::categories();
        $this->assertCount(13, $categories);
        $this->assertSame(self::PRINT + self::SCREEN, array_sum(array_column($categories, 'count')));
        $this->assertSame(self::PRINT, array_sum(array_map(static fn (array $c): int => $c['counts']['print'], $categories)));
        $this->assertSame(self::SCREEN, array_sum(array_map(static fn (array $c): int => $c['counts']['screen'], $categories)));
        $this->assertSame('disc', $categories[0]['key']);
        $this->assertSame(7, $categories[0]['counts']['print']);
        $this->assertSame(3, $categories[0]['counts']['screen']);
        $this->assertSame(10, $categories[0]['count']);
        $this->assertSame(['classic', 'colour', 'extra', 'photo'], array_keys(PosterThemes::styles()));

        $all = PosterThemes::all();
        $this->assertCount(self::PRINT + self::SCREEN, $all);
        $this->assertSame('BG-001', $all[0]['id']);
        $this->assertSame('BG-110', $all[self::PRINT - 1]['id']);
        $this->assertSame('print', $all[0]['kind']);
        $this->assertSame('TV-001', $all[self::PRINT]['id']);
        $this->assertSame('screen', $all[self::PRINT]['kind']);
        $this->assertCount(self::PRINT, PosterThemes::ofKind('print'));
        $this->assertCount(self::SCREEN, PosterThemes::ofKind('screen'));
        $this->assertCount(50, array_filter(PosterThemes::ofKind('print'), static fn (array $row): bool => $row['style'] === 'photo'));
        $this->assertCount(74, array_filter($all, static fn (array $row): bool => $row['has_photo']));
        $this->assertCount(14, PosterThemes::inCategory('combo'));
        $this->assertSame([], PosterThemes::inCategory('nope'));

        $this->assertTrue(PosterThemes::has('bg012-value-meals-menu'));
        $this->assertTrue(PosterThemes::has('tv007-donuts-buy1get1'));
        $this->assertFalse(PosterThemes::has('nope'));
        $this->assertNull(PosterThemes::get('nope'));
        $this->assertSame('screen', PosterThemes::kindOf(PosterThemes::get('tv007-donuts-buy1get1')));
        $this->assertSame('print', PosterThemes::kindOf(PosterThemes::get('bg012-value-meals-menu')));
        $this->assertNull(PosterThemes::file('nope', 'preview-large.jpg'));
        $this->assertNull(PosterThemes::file('bg012-value-meals-menu', '../index.json'));
        $this->assertNull(PosterThemes::file('bg012-value-meals-menu', 'theme.json'));
        $this->assertFileExists((string) PosterThemes::file('bg012-value-meals-menu', 'preview-small.jpg'));
        $this->assertFileExists((string) PosterThemes::file('tv007-donuts-buy1get1', 'preview-tv.jpg'));
        $this->assertFileExists((string) PosterThemes::file('tv007-donuts-buy1get1', 'preview-tvp.jpg'));
        $this->assertFileExists((string) PosterThemes::file('tv007-donuts-buy1get1', 'placeholder-tv-p1.png'));
    }

    public function test_the_variant_follows_the_page_and_a_design_is_drawn_only_for_its_kind(): void
    {
        $theme = PosterThemes::get('bg012-value-meals-menu');
        $this->assertNotNull($theme);
        $this->assertSame('large', PosterThemes::variantFor($theme, PaperSize::named('A2'))['variant']);
        $this->assertSame('large', PosterThemes::variantFor($theme, PaperSize::named('A3'))['variant']);
        $this->assertSame('small', PosterThemes::variantFor($theme, PaperSize::named('A4'))['variant']);
        $this->assertSame('small', PosterThemes::variantFor($theme, PaperSize::named('A5'))['variant']);

        $tv = PosterThemes::get('tv007-donuts-buy1get1');
        $this->assertSame('tv', PosterThemes::variantFor($tv, PaperSize::named('TV'))['variant']);
        $this->assertSame('tv', PosterThemes::variantFor($tv, PaperSize::named('TV4K'))['variant']);
        $this->assertSame('tvp', PosterThemes::variantFor($tv, PaperSize::named('TVP'))['variant']);
        $this->assertSame('tv', PosterThemes::variantNameFor(PaperSize::named('TV')));
        $this->assertSame('screen', PosterThemes::kindForSize(PaperSize::named('TVP')));
        $this->assertSame('print', PosterThemes::kindForSize(PaperSize::named('A4')));

        try {
            PosterThemes::variantFor($tv, PaperSize::named('A4'));
            $this->fail('a TV design is not drawn on paper');
        } catch (RuntimeException $e) {
            $this->assertStringContainsString('TV design', $e->getMessage());
        }
        try {
            PosterThemes::variantFor($theme, PaperSize::named('TV'));
            $this->fail('a print design is not drawn on a screen');
        } catch (RuntimeException $e) {
            $this->assertStringContainsString('print design', $e->getMessage());
        }

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

    public function test_a_tv_design_maps_pixel_for_pixel_at_full_hd_and_doubles_at_4k(): void
    {
        $theme = PosterThemes::get('tv007-donuts-buy1get1');
        $tv = PosterThemes::variantFor($theme, PaperSize::named('TV'));
        $this->assertSame([1920.0, 1080.0], PosterThemes::trimUnits($tv));
        $map = PosterThemes::mapping($tv, PaperSize::named('TV'));
        $this->assertSame(['s' => 1.0, 'dy' => 0.0, 'bleed_units' => 0.0, 'ox' => 0.0, 'oy' => 0.0], $map);
        $this->assertSame([0.0, 0.0], PosterThemes::mapPoint($map, 0.0, 0.0));
        $this->assertSame([1920.0, 1080.0], PosterThemes::mapPoint($map, 1920.0, 1080.0));
        // A point is 0.352778 page units, so 24 px of type is 68 pt on the page's scale.
        $this->assertEqualsWithDelta(24 / 0.352778, PosterThemes::mapPoints($map, 24), 0.01);

        $map4k = PosterThemes::mapping($tv, PaperSize::named('TV4K'));
        $this->assertSame(2.0, $map4k['s']);
        $this->assertSame([3840.0, 2160.0], PosterThemes::mapPoint($map4k, 1920.0, 1080.0));
        $this->assertSame([200.0, 100.0, 400.0, 600.0], PosterThemes::mapBox($map4k, [100, 50, 200, 300]));

        $portrait = PosterThemes::variantFor($theme, PaperSize::named('TVP'));
        $this->assertSame([1080.0, 1920.0], PosterThemes::trimUnits($portrait));
        $this->assertSame(1.0, PosterThemes::mapping($portrait, PaperSize::named('TVP'))['s']);
    }

    public function test_every_theme_parses_and_its_variants_match_the_handoff(): void
    {
        $fonts = array_keys(PosterFonts::FILES);
        $aspect = LogoVector::fromFile()->aspect();
        foreach (PosterThemes::all() as $row) {
            $key = $row['key'];
            $theme = PosterThemes::get($key);
            $this->assertNotNull($theme, $key);
            $this->assertSame($row['kind'], PosterThemes::kindOf($theme), $key);
            $variants = PosterThemes::KIND_VARIANTS[$row['kind']];
            $ids = [];
            foreach ($variants as $name) {
                $variant = $theme['variants'][$name];
                $canvas = $variant['canvas'];
                $this->assertSame(PosterThemes::VARIANT_TRIM[$name], PosterThemes::trimUnits($variant), "{$key} {$name} trim");
                if ($row['kind'] === 'screen') {
                    $this->assertSame(0, (int) $canvas['bleed_units'], "{$key} {$name} has no bleed");
                    $this->assertSame(24.0, (float) $canvas['min_text_units'], "{$key} {$name} type floor");
                    $this->assertSame(60.0, (float) $canvas['safe_inset_units'], "{$key} {$name} safe inset");
                    $this->assertNull($canvas['corner_keepout'], "{$key} {$name} has no stand-off corners");
                }
                $inset = (float) $canvas['safe_inset_units'];
                $inside = static fn (array $box): bool => $box[0] >= $inset - 0.05 && $box[1] >= $inset - 0.05
                    && $box[0] + $box[2] <= $canvas['width'] - $inset + 0.05 && $box[1] + $box[3] <= $canvas['height'] - $inset + 0.05;
                $slotIds = [];
                foreach ($variant['text_slots'] as $slot) {
                    $where = "{$key} {$name} {$slot['id']}";
                    $this->assertGreaterThanOrEqual((float) $canvas['min_text_units'] - 0.001, (float) $slot['size_units'], $where . ' is under the floor');
                    $this->assertContains(PosterThemes::FONTS[$slot['font']], $fonts, $where . ' font');
                    $this->assertTrue($inside($slot['box']), $where . ' text box leaves the safe area');
                    $this->assertContains($slot['role_hint'], PosterThemes::ROLES, $where . ' role');
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
                    $this->assertFileExists(PosterThemes::root() . '/' . $theme['path'] . '/' . $slot['placeholder_image'], $where . ' placeholder');
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
            $this->assertSame($ids[$variants[0]], $ids[$variants[1]], $key . ' slot ids differ between variants');
            $this->assertSame((int) $row['text_slots'] + (int) $row['photo_slots'], count($ids[$variants[0]]), $key . ' slot count');
        }
    }

    public function test_a_tv_design_keeps_each_slot_on_the_same_line_of_both_screens(): void
    {
        // The words typed for the TV land on the same line of the portrait design: same ids, same roles, same defaults.
        foreach (PosterThemes::ofKind('screen') as $row) {
            $theme = PosterThemes::get($row['key']);
            $tv = array_map(static fn (array $s): array => [$s['id'], $s['role_hint'], $s['default']], $theme['variants']['tv']['text_slots']);
            $tvp = array_map(static fn (array $s): array => [$s['id'], $s['role_hint'], $s['default']], $theme['variants']['tvp']['text_slots']);
            $this->assertSame($tv, $tvp, $row['key']);
            $this->assertSame(['TV' => 'tv', 'TV4K' => 'tv', 'TVP' => 'tvp'], $theme['size_to_variant'], $row['key']);
            foreach (['tv', 'tvp'] as $name) {
                $this->assertSame('backdrop-' . $name . '.json.gz', $theme['variants'][$name]['files']['backdrop_draw_list'], $row['key']);
                $this->assertNotEmpty(PosterThemes::drawList($theme, $name), $row['key'] . ' ' . $name);
                $this->assertNotNull(PosterThemes::backdropLayer($theme, $name, 0), $row['key'] . ' ' . $name);
            }
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

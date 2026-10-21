<?php

declare(strict_types=1);

namespace Tests\Feature\Posters;

use App\Domains\Posters\PaperSize;
use App\Domains\Posters\PosterContent;
use App\Domains\Posters\PosterPieces;
use App\Domains\Posters\PosterPreflight;
use App\Domains\Posters\PosterProof;
use App\Domains\Posters\PosterPurposes;
use App\Domains\Posters\PosterScreen;
use App\Domains\Posters\PosterThemeRaster;
use App\Models\Item;
use App\Models\Poster;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * A template poster's preflight and screens (docs/POSTER_THEMES_HANDOFF.md
 * § 5.8 and § 5.9): no mood contrast, the photos checked slot by slot, the
 * price against the menu, the keep-out on the wall sizes only, and the TV,
 * social and proof pictures drawn from the design itself.
 */
class PosterThemeScreensTest extends TestCase
{
    use RefreshDatabase;

    /** @return array<string, mixed> */
    private function poster(array $slots = [], array $bindings = [], string $theme = 'bg012-value-meals-menu'): array
    {
        return [
            'template_key' => PosterPurposes::THEMED, 'layout' => PosterPurposes::THEMED, 'theme' => $theme,
            'language' => 'en', 'slots' => $slots, 'bindings' => $bindings,
        ];
    }

    /** @return array<string, array{level: string, message: string}> the first row of each id */
    private function checks(array $poster, string $size, array $job = []): array
    {
        $paper = PaperSize::named($size)->mounted((string) ($job['mounting'] ?? 'none'));
        $content = PosterContent::resolve($poster);
        $built = PosterPieces::build($poster, $paper, $content);
        $rows = [];
        foreach (PosterPreflight::check($poster, $content, $built, $paper, $job + ['material' => 'foam', 'white' => 'none']) as $row) {
            $rows[$row['id']] ??= $row;
        }

        return $rows;
    }

    public function test_the_checks_follow_the_design_not_a_mood(): void
    {
        foreach (['A2', 'A5'] as $size) {
            $rows = $this->checks($this->poster(), $size);
            $this->assertArrayNotHasKey('contrast', $rows, $size . ' has no mood contrast');
            $this->assertSame('ok', $rows['type']['level'], $size . ' ' . $rows['type']['message']);
            $this->assertSame('ok', $rows['safe']['level'], $size . ' ' . $rows['safe']['message']);
            $this->assertSame('ok', $rows['fit']['level'], $size);
            $this->assertSame('ok', $rows['ink']['level'], $size . ' ' . $rows['ink']['message']);
            $this->assertArrayNotHasKey('language', $rows, $size);
            $this->assertStringContainsString('the design\'s own picture', $rows['photo']['message'], $size);
            $this->assertNotSame('red', $rows['photo']['level'], $size . ' ' . $rows['photo']['message']);
        }
    }

    public function test_the_keep_out_is_checked_on_the_wall_sizes_only(): void
    {
        $wall = $this->checks($this->poster(), 'A2', ['mounting' => 'standoffs']);
        $this->assertSame('ok', $wall['keepout']['level'], $wall['keepout']['message']);
        $this->assertStringContainsString('clear for the stand-offs', $wall['keepout']['message']);

        $card = $this->checks($this->poster(), 'A5', ['mounting' => 'eyelets']);
        $this->assertSame('amber', $card['keepout']['level']);
        $this->assertStringContainsString('no corners kept clear for eyelets', $card['keepout']['message']);
        $this->assertSame('ok', $card['safe']['level'], 'the mounting does not grow the design\'s own safe area');
    }

    public function test_each_photo_slot_is_checked_and_a_small_website_photo_is_red(): void
    {
        $item = Item::factory()->create(['name' => 'Chicken tikka', 'base_price' => 85, 'is_active' => true, 'image_url' => '/images/cafe/Bajiya.png']);
        $this->assertFileExists(public_path('images/cafe/Bajiya.png'));

        $rows = $this->checks($this->poster(['p2' => ['item_id' => $item->id, 'use' => 'main']]), 'A4');
        $messages = [];
        $paper = PaperSize::named('A4');
        $poster = $this->poster(['p2' => ['item_id' => $item->id, 'use' => 'main']]);
        $content = PosterContent::resolve($poster);
        foreach (PosterPreflight::check($poster, $content, PosterPieces::build($poster, $paper, $content), $paper, ['material' => 'foam']) as $row) {
            if ($row['id'] === 'photo') {
                $messages[] = $row['level'] . ': ' . $row['message'];
            }
        }
        $this->assertCount(3, $messages, 'one row per photo slot');
        $this->assertStringStartsWith('ok: Photo 1 (the design\'s own picture)', $messages[0]);
        $this->assertStringStartsWith('red: Photo 2 has only the dish\'s small website photo', $messages[1]);
        $this->assertStringStartsWith('ok: Photo 3', $messages[2]);
        $this->assertTrue(PosterPreflight::blocked(array_values($rows)));
    }

    public function test_a_typed_price_that_differs_from_the_menu_is_red_and_the_live_one_is_ok(): void
    {
        $item = Item::factory()->create(['name' => 'Chicken tikka', 'base_price' => 85, 'is_active' => true]);
        $live = $this->checks($this->poster([], ['item_id' => $item->id]), 'A4');
        $this->assertSame('ok', $live['price']['level'], $live['price']['message']);

        $typed = $this->checks($this->poster(['t6' => '99'], ['item_id' => $item->id]), 'A4');
        $this->assertSame('red', $typed['price']['level']);
        $this->assertStringContainsString('(99)', $typed['price']['message']);
        $this->assertStringContainsString('MVR 85.00', $typed['price']['message']);

        $same = $this->checks($this->poster(['t6' => '85.00'], ['item_id' => $item->id]), 'A4');
        $this->assertSame('ok', $same['price']['level']);

        $none = $this->checks($this->poster(['t6' => '99']), 'A4');
        $this->assertArrayNotHasKey('price', $none, 'no dish bound, nothing to compare');
    }

    public function test_the_raster_draws_the_design_into_any_picture(): void
    {
        $poster = $this->poster(['t2' => 'TIKKA DEALS']);
        $built = PosterPieces::build($poster, PaperSize::named('A4'), PosterContent::resolve($poster));
        $image = PosterThemeRaster::draw($built, 640, 360);
        $this->assertSame(640, imagesx($image));
        $this->assertSame(360, imagesy($image));
        // The page sits centred: the bars either side carry the page colour, the page itself many colours.
        $colours = [];
        for ($x = 0; $x < 640; $x += 7) {
            for ($y = 0; $y < 360; $y += 7) {
                $colours[imagecolorat($image, $x, $y)] = true;
            }
        }
        $this->assertGreaterThan(40, count($colours), 'the design is drawn, not a flat colour');
        $bar = imagecolorat($image, 4, 180);
        $this->assertSame($bar, imagecolorat($image, 635, 180), 'both bars are the page colour');
        imagedestroy($image);
    }

    public function test_tv_social_and_proof_pictures_are_the_design(): void
    {
        Storage::fake('public');
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $id = $this->postJson('/api/posters', [
            'name' => 'Meal deals',
            'template_key' => PosterPurposes::THEMED,
            'layout' => PosterPurposes::THEMED,
            'theme' => 'bg012-value-meals-menu',
            'sizes' => ['A2'],
            'slots' => ['t2' => 'TIKKA DEALS'],
            'take_down_on' => now()->addDays(3)->toDateString(),
        ])->assertCreated()->json('id');
        $poster = Poster::query()->findOrFail($id);

        $sent = $this->postJson("/api/posters/{$id}/tv")->assertOk();
        $path = Storage::disk('public')->path('posters/screens/' . $poster->code() . '-tv.png');
        $this->assertFileExists($path);
        $info = getimagesize($path);
        $this->assertSame([1920, 1080], [$info[0] ?? 0, $info[1] ?? 0]);
        $this->assertStringContainsString('-tv.png', (string) $sent->json('image_url'));
        $tv = imagecreatefrompng($path);
        $colours = [];
        for ($x = 560; $x < 1360; $x += 16) {
            for ($y = 0; $y < 1080; $y += 16) {
                $colours[imagecolorat($tv, $x, $y)] = true;
            }
        }
        $this->assertGreaterThan(60, count($colours), 'the TV picture carries the design');
        imagedestroy($tv);

        $cards = PosterScreen::social($poster);
        $this->assertSame(['1200x630', '1080', '1080x1350', '1080x1920'], array_map('strval', array_keys($cards)));
        $square = Storage::disk('public')->path('posters/cards/' . $poster->code() . '-1080.jpg');
        $this->assertFileExists($square);
        $this->assertSame([1080, 1080], array_slice(getimagesize($square) ?: [0, 0], 0, 2));

        $proof = PosterProof::jpeg($poster);
        $this->assertStringStartsWith("\xFF\xD8", $proof, 'a JPEG');
        $proofInfo = getimagesizefromstring($proof);
        $this->assertSame(1200, $proofInfo[1] ?? 0, '1200 px tall');
        $this->assertEqualsWithDelta(1200 * 426 / 600, $proofInfo[0] ?? 0, 1.0, 'the A2 page shape');
    }
}

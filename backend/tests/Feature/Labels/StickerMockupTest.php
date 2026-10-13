<?php

declare(strict_types=1);

namespace Tests\Feature\Labels;

use App\Domains\Labels\StickerMockup;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Item;
use App\Models\LabelPrint;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The mock-up preview (round 14 of the usability work, owner, 2026-10-13:
 * "a mock-up preview on a jar or bottle photo, so the wrap and round labels
 * are judged as they will be seen"): a preview carries a link per surface
 * that suits the label, and each draws the first sticker on it.
 */
class StickerMockupTest extends TestCase
{
    use RefreshDatabase;

    private Item $bajiya;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        Cache::flush();
        $this->bajiya = $this->makeItem(false, 0, ['name' => 'Bajiya', 'label_enabled' => true, 'label_shelf_life_days' => 90]);
    }

    private function preview(array $size): array
    {
        return $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $this->bajiya->id, 'copies' => 1]], 'preview' => true] + $size)->assertOk()->json();
    }

    public function test_each_shape_offers_its_surfaces_and_each_draws_the_sticker_on_it(): void
    {
        $wrap = $this->preview(['layout' => 'single-custom', 'w' => 180, 'h' => 40]);
        $this->assertSame(['bottle', 'jar', 'box'], array_keys($wrap['mock_urls']));
        $html = (string) $this->get($wrap['mock_urls']['bottle'])->assertOk()->getContent();
        $this->assertStringContainsString('data-testid="mockup" data-surface="bottle"', $html);
        $this->assertSame(StickerMockup::STRIPS, substr_count($html, 'data-testid="mockup-strip"'));
        $this->assertStringContainsString('Bajiya', $html);
        $this->assertStringNotContainsString('data-testid="labels-page"', $html);

        $round = $this->preview(['layout' => 'a4-round-custom', 'w' => 60]);
        $this->assertSame(['lid', 'jar', 'box'], array_keys($round['mock_urls']));
        $lid = (string) $this->get($round['mock_urls']['lid'])->assertOk()->getContent();
        $this->assertStringContainsString('data-surface="lid"', $lid);
        $this->assertSame(0, substr_count($lid, 'data-testid="mockup-strip"'), 'a lid is flat');
        $this->assertStringContainsString('border-radius:50%', $lid);

        $full = $this->preview(['layout' => 'a4-4']);
        $this->assertSame(['jar', 'bottle', 'box', 'lid'], array_keys($full['mock_urls']));
        $this->assertStringContainsString('data-surface="box"', (string) $this->get($full['mock_urls']['box'])->assertOk()->getContent());
        $this->assertStringContainsString('data-surface="jar"', (string) $this->get($full['mock_urls']['jar'])->assertOk()->getContent());

        // Nothing is logged for a mock-up, and a real print carries no mock links; an unknown surface draws the plain sticker.
        $this->assertSame(0, LabelPrint::query()->count());
        $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $this->bajiya->id, 'copies' => 1]], 'layout' => 'a4-4'])->assertOk()->assertJsonPath('mock_urls', null);
    }

    public function test_the_scene_wraps_a_label_round_a_bottle_and_curves_a_jar_label_over_a_third(): void
    {
        $bottle = StickerMockup::scene('bottle', 180.0, 40.0, 'rect', 'wrap');
        $r = 180 / (2 * M_PI);
        // The front half of the label shows: a quarter of it each side of the middle, across the bottle's width.
        $this->assertEqualsWithDelta(45.0, $bottle['strips'][0]['sx'], 0.01);
        $this->assertEqualsWithDelta(135.0, end($bottle['strips'])['sx'] + end($bottle['strips'])['sw'], 0.01);
        $this->assertEqualsWithDelta(2 * $r, $bottle['label']['w'], 0.01);
        // Middle strips are nearly flat, edge strips squeezed hard.
        $mid = $bottle['strips'][StickerMockup::STRIPS / 2];
        $edge = $bottle['strips'][0];
        $this->assertGreaterThan(0.99, $mid['pw'] / $mid['sw']);
        $this->assertLessThan(0.1, $edge['pw'] / $edge['sw']);

        $jar = StickerMockup::scene('jar', 60.0, 40.0, 'rect', 'small');
        $this->assertEqualsWithDelta(0.0, $jar['strips'][0]['sx'], 0.01);
        $this->assertEqualsWithDelta(60.0, end($jar['strips'])['sx'] + end($jar['strips'])['sw'], 0.01);
        $this->assertEqualsWithDelta(4 / 3, $jar['w'] / $jar['h'], 0.001, 'the scene is 4 : 3, as the frame');
        $this->assertNull(StickerMockup::valid('teapot'));
    }
}

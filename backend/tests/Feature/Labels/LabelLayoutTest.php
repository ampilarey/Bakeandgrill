<?php

declare(strict_types=1);

namespace Tests\Feature\Labels;

use App\Domains\Labels\LabelLayout;
use App\Domains\Labels\LabelSpots;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\LabelTemplate;
use App\Models\SiteSetting;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The drag designer (round 8 of the usability work, owner, 2026-10-13): a
 * product keeps the parts moved or resized by hand per design, the pieces
 * of those parts move and scale before anything draws, the spots report
 * where they landed, and Back to automatic (null) forgets it all.
 */
class LabelLayoutTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        CarbonImmutable::setTestNow('2026-10-13 09:00:00');
        SiteSetting::set('business_phone', '+960 912 0011');
        SiteSetting::set('business_website', 'bakeandgrill.mv');
        Cache::flush();
    }

    protected function tearDown(): void
    {
        CarbonImmutable::setTestNow();
        parent::tearDown();
    }

    public function test_a_layout_is_tidied_on_the_way_in(): void
    {
        $clean = LabelLayout::clean([
            'full' => ['name' => ['dx' => '3.14', 'dy' => -2.06, 's' => 1.25], 'dates' => ['dx' => 0, 'dy' => 0, 's' => 1], 'bogus' => ['dx' => 5], 'photo' => ['s' => 9], 'note' => 'nope'],
            'wrap' => ['name' => ['dx' => 5]],
            'small' => ['price' => ['dx' => -999]],
            'odd' => 5,
        ]);
        $this->assertSame(['full' => ['name' => ['dx' => 3.1, 'dy' => -2.1, 's' => 1.25], 'photo' => ['dx' => 0.0, 'dy' => 0.0, 's' => 2.0]], 'small' => ['price' => ['dx' => -300.0, 'dy' => 0.0, 's' => 1.0]]], $clean);
        $this->assertSame([], LabelLayout::clean(null));
        $this->assertSame([], LabelLayout::clean('not json'));
        $this->assertSame(['full' => ['name' => ['dx' => 1.0, 'dy' => 0.0, 's' => 1.0]]], LabelLayout::clean('{"full":{"name":{"dx":1}}}'));
    }

    public function test_a_moved_part_moves_its_pieces_and_a_fixed_one_stays(): void
    {
        $pieces = [
            LabelSpots::open('name'),
            ['t' => 'text', 'x' => 10.0, 'base' => 20.0, 'w' => 50.0, 'pt' => 10.0, 'font' => 'j7', 'align' => 'l', 'color' => '#000', 'text' => 'Bajiya'],
            ['t' => 'img', 'x' => 10.0, 'y' => 22.0, 'w' => 20.0, 'h' => 10.0, 'src' => 'data:,'],
            LabelSpots::close(),
            LabelSpots::open('note'),
            ['t' => 'line', 'x' => 10.0, 'y' => 40.0, 'w' => 50.0, 'sw' => 0.4, 'color' => '#000'],
            LabelSpots::close(),
            LabelSpots::at('batch', 5.0, 50.0, 30.0, 4.0),
            ['t' => 'text', 'x' => 5.0, 'base' => 53.0, 'w' => 60.0, 'pt' => 6.0, 'font' => 'j5', 'align' => 'l', 'color' => '#000', 'text' => 'BATCH'],
        ];
        $moved = LabelLayout::apply($pieces, ['name' => ['dx' => 5.0, 'dy' => -3.0, 's' => 2.0], 'batch' => ['dx' => 9.0, 'dy' => 9.0, 's' => 1.0]]);
        // The run's box starts at the text's ascent above its baseline; the scale is about that corner, then the shift.
        $top = 20.0 - \App\Domains\Labels\LabelText::ascent('j7') * 10.0 * \App\Domains\Labels\LabelText::PT;
        $text = $moved[1];
        $this->assertSame(15.0, $text['x']);
        $this->assertEqualsWithDelta($top + (20.0 - $top) * 2 - 3.0, $text['base'], 0.01);
        $this->assertSame(100.0, $text['w']);
        $this->assertSame(20.0, $text['pt']);
        $img = $moved[2];
        $this->assertSame(15.0, $img['x']);
        $this->assertEqualsWithDelta($top + (22.0 - $top) * 2 - 3.0, $img['y'], 0.01);
        $this->assertSame([40.0, 20.0], [$img['w'], $img['h']]);
        // The note was not overridden; the batch has a box of its own and no run, so its text stays.
        $this->assertSame(40.0, $moved[5]['y']);
        $this->assertSame(5.0, $moved[8]['x']);
        $this->assertSame(53.0, $moved[8]['base']);
        // Nothing to apply gives the pieces back as they were.
        $this->assertSame($pieces, LabelLayout::apply($pieces, []));
        // The spots say which part is fixed.
        $spots = LabelSpots::spots($moved);
        $this->assertSame('name', $spots[0]['key']);
        $this->assertSame(15.0, $spots[0]['x']);
        $this->assertTrue($spots[2]['fixed']);
        $this->assertArrayNotHasKey('fixed', $spots[0]);
    }

    public function test_a_custom_label_keeps_its_layout_per_design_and_prints_the_parts_where_they_were_put(): void
    {
        $id = $this->postJson('/api/labels/custom', ['name' => 'Garlic Sauce', 'label_ingredients' => 'Garlic, oil', 'label_shelf_life_days' => 14])->assertCreated()->assertJsonPath('data.label_layout', [])->json('data.id');
        $before = $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $id, 'kind' => 'custom', 'copies' => 1]], 'layout' => 'a4-4', 'preview' => true])->assertOk()->json('summary.spots');
        $name = collect($before)->firstWhere('key', 'name');
        $this->assertNotNull($name);

        $this->putJson("/api/labels/custom/{$id}", ['label_layout' => ['full' => ['name' => ['dx' => 10, 'dy' => 5, 's' => 1.5]], 'bogus' => ['name' => ['dx' => 1]]]])->assertOk()
            ->assertJsonPath('data.label_layout.full.name', ['dx' => 10, 'dy' => 5, 's' => 1.5])
            ->assertJsonMissingPath('data.label_layout.bogus');
        $res = $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $id, 'kind' => 'custom', 'copies' => 1]], 'layout' => 'a4-4', 'preview' => true])->assertOk();
        $after = collect($res->json('summary.spots'))->firstWhere('key', 'name');
        $this->assertEqualsWithDelta($name['x'] + 10, $after['x'], 0.05);
        $this->assertEqualsWithDelta($name['y'] + 5, $after['y'], 0.05);
        $this->assertEqualsWithDelta($name['w'] * 1.5, $after['w'], 0.1);
        $this->get($res->json('view_url'))->assertOk()->assertSee('Garlic Sauce');
        $this->get($res->json('pdf_url'))->assertOk();

        // The compact design keeps its own places; the batch there is a fixed part.
        $mini = $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $id, 'kind' => 'custom', 'copies' => 1]], 'layout' => 'a4-8', 'preview' => true])->assertOk()->json('summary.spots');
        $this->assertTrue(collect($mini)->firstWhere('key', 'batch')['fixed'] ?? false);

        // A draft preview takes a layout too, and the Admin's size and language with it.
        $draft = $this->postJson('/api/labels/custom/preview', ['name' => 'Draft', 'label_layout' => ['full' => ['name' => ['dx' => -4]]], 'layout' => 'a4-4'])->assertOk()->json('spots');
        $plain = $this->postJson('/api/labels/custom/preview', ['name' => 'Draft', 'layout' => 'a4-4'])->assertOk()->json('spots');
        $this->assertEqualsWithDelta(collect($plain)->firstWhere('key', 'name')['x'] - 4, collect($draft)->firstWhere('key', 'name')['x'], 0.05);

        // Back to automatic: null, or nothing left, forgets it; out of bounds is refused.
        $this->putJson("/api/labels/custom/{$id}", ['label_layout' => null])->assertOk()->assertJsonPath('data.label_layout', []);
        $this->putJson("/api/labels/custom/{$id}", ['label_layout' => ['full' => ['name' => ['dx' => 2]]]])->assertOk()->assertJsonPath('data.label_layout.full.name.dx', 2);
        $this->putJson("/api/labels/custom/{$id}", ['label_layout' => []])->assertOk()->assertJsonPath('data.label_layout', []);
        $this->putJson("/api/labels/custom/{$id}", ['label_layout' => ['full' => ['name' => ['s' => 9]]]])->assertUnprocessable();
        $this->putJson("/api/labels/custom/{$id}", ['label_layout' => ['full' => ['name' => ['dx' => 'far']]]])->assertUnprocessable();
    }

    public function test_a_menu_item_and_a_template_carry_a_layout(): void
    {
        $item = $this->makeItem(false, 0, ['name' => 'Bajiya', 'label_enabled' => true]);
        $this->putJson("/api/items/{$item->id}/label", ['label_layout' => ['small' => ['dates' => ['dy' => -1.5]]]])->assertOk()->assertJsonPath('data.label_layout.small.dates', ['dx' => 0, 'dy' => -1.5, 's' => 1]);
        $this->assertSame(['small' => ['dates' => ['dx' => 0.0, 'dy' => -1.5, 's' => 1.0]]], LabelLayout::of($item->fresh()));

        $tpl = $this->postJson('/api/labels/templates', ['name' => 'Moved', 'fields' => ['label_layout' => ['full' => ['photo' => ['s' => 1.3]], 'nope' => []]]])->assertCreated();
        $tpl->assertJsonPath('data.fields.label_layout.full.photo', ['dx' => 0, 'dy' => 0, 's' => 1.3])->assertJsonMissingPath('data.fields.label_layout.nope');
        // (assertEquals: JSON carries 0.0 as 0.)
        $this->assertEquals(['full' => ['photo' => ['dx' => 0, 'dy' => 0, 's' => 1.3]]], LabelTemplate::query()->sole()->fields['label_layout']);
    }
}

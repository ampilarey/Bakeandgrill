<?php

declare(strict_types=1);

namespace Tests\Feature\Labels;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\CustomLabel;
use App\Models\LabelJob;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Owner, 2026-11-16: "on the top of the container circular label with name and
 * photo. At the side rectangular label with other details."
 */
class TubSetTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        Cache::flush();
        Storage::fake('public');
    }

    /** @return array<int, array<string, mixed>> */
    private function make(array $over = []): array
    {
        return $this->postJson('/api/labels/tub-set', $over + [
            'name' => 'Frozen Jhol Momo', 'template' => 'jhol-momo-round', 'photo' => 'builtin', 'lid' => 'c80', 'side' => 'r100x50',
        ])->assertCreated()->json('data');
    }

    public function test_one_go_makes_a_lid_label_and_a_side_label(): void
    {
        $made = $this->make();
        $this->assertSame(['lid', 'side'], array_column($made, 'part'));
        $this->assertSame(['Frozen Jhol Momo (Lid)', 'Frozen Jhol Momo (Side)'], CustomLabel::query()->orderBy('id')->pluck('name')->all());
        $this->assertSame(2, LabelJob::query()->count(), 'a saved label for each, nothing printed');
        $this->assertSame('circle', $made[0]['label']['label_size']['shape']);
        $this->assertSame('rect', $made[1]['label']['label_size']['shape']);
        $this->assertNotNull($made[0]['label']['label_photo_media_id'], 'the template brings its photo');

        // The lid: the name without "(Lid)", the pack line and the photo; no ingredients, no dates, and nothing reported as left out.
        $lid = (string) $this->get($made[0]['view_url'])->assertOk()->getContent();
        $this->assertStringContainsString('>Frozen Jhol Momo<', $lid);
        $this->assertStringNotContainsString('(Lid)', $lid);
        $this->assertStringContainsString('MOMO IN SPICY JHOL', $lid);
        $this->assertStringContainsString('8 PCS', $lid);
        $this->assertStringNotContainsString('EXP DATE', $lid);
        $this->assertStringNotContainsString('wheat flour', $lid);
        $summary = $this->postJson('/api/labels/stickers/url', $made[0]['request'] + ['preview' => true])->assertOk()->json('summary');
        $this->assertSame([], $summary['dropped'] ?? [], 'the lid leaves the list and the pack code to the side label');

        // The side: the same name, with the list and the dates.
        $side = (string) $this->get($made[1]['view_url'])->assertOk()->getContent();
        $this->assertStringNotContainsString('(Side)', $side);
        $this->assertStringContainsString('Frozen Jhol Momo', $side);
        $this->assertStringContainsString('EXP', $side);
        $this->assertStringContainsString('wheat', $side);
        $this->assertStringContainsString('timur pepper.', $side, 'the whole list, momo and jhol, fits the side label');
    }

    public function test_typed_details_win_over_the_template_and_sizes_are_held_to_their_shape(): void
    {
        $made = $this->make(['name' => 'Chicken Curry', 'template' => null, 'photo' => null, 'label_ingredients' => 'Chicken, onion, chilli.', 'label_pack_qty' => 1, 'label_price' => 60]);
        $this->assertSame('Chicken, onion, chilli.', $made[1]['label']['label_ingredients']);
        $this->assertEquals(60.0, $made[0]['label']['label_price']);

        $this->postJson('/api/labels/tub-set', ['name' => 'X', 'lid' => 'r100x50', 'side' => 'r100x50'])->assertStatus(422)->assertJsonValidationErrors('lid');
        $this->postJson('/api/labels/tub-set', ['name' => 'X', 'lid' => 'c80', 'side' => 'c60'])->assertStatus(422)->assertJsonValidationErrors('side');
    }

    public function test_an_ordinary_round_label_becomes_a_lid_with_one_field(): void
    {
        $id = (int) $this->postJson('/api/labels/custom', ['name' => 'Garlic Sauce', 'label_ingredients' => 'Garlic, oil, salt.', 'label_part' => 'lid'])->assertCreated()->assertJsonPath('data.label_part', 'lid')->json('data.id');
        $res = $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $id, 'kind' => 'custom', 'copies' => 1]], 'layout' => 'single-round-custom', 'w' => 60, 'h' => 60, 'lang' => 'en', 'fill' => true, 'preview' => true])->assertOk();
        $html = (string) $this->get($res->json('view_url') ?? $res->json('url'))->assertOk()->getContent();
        $this->assertStringContainsString('>Garlic Sauce<', $html);
        $this->assertStringNotContainsString('Garlic, oil', $html);
        $this->putJson("/api/labels/custom/{$id}", ['label_part' => null])->assertOk()->assertJsonPath('data.label_part', null);
    }

    /** Owner, 2026-11-16: "Need it in menu items also". A menu item prints as its lid or its side, picked at the print. */
    public function test_a_menu_item_prints_as_a_lid_or_a_side_label(): void
    {
        $item = \App\Models\Item::factory()->create(['name' => 'Chicken Curry', 'label_enabled' => true, 'label_ingredients' => 'Chicken, onion, chilli, coconut.']);
        $body = ['items' => [['id' => $item->id, 'kind' => 'item', 'copies' => 1]], 'lang' => 'en', 'fill' => true, 'preview' => true];

        $lid = $this->postJson('/api/labels/stickers/url', $body + ['layout' => 'single-round-custom', 'w' => 80, 'h' => 80, 'part' => 'lid'])->assertOk();
        $html = (string) $this->get($lid->json('view_url') ?? $lid->json('url'))->assertOk()->getContent();
        $this->assertStringContainsString('>Chicken Curry<', $html);
        $this->assertStringNotContainsString('Chicken, onion', $html);
        $this->assertStringNotContainsString('EXP DATE', $html);
        $this->assertSame([], $lid->json('summary.dropped') ?? []);

        // The same round size with no part is the full round label, list and dates and all.
        $usual = $this->postJson('/api/labels/stickers/url', $body + ['layout' => 'single-round-custom', 'w' => 80, 'h' => 80])->assertOk();
        $this->assertStringContainsString('Chicken, onion', (string) $this->get($usual->json('view_url') ?? $usual->json('url'))->getContent());

        $side = $this->postJson('/api/labels/stickers/url', $body + ['layout' => 'single-custom', 'w' => 100, 'h' => 50, 'part' => 'side'])->assertOk();
        $this->assertStringContainsString('Chicken', (string) $this->get($side->json('view_url') ?? $side->json('url'))->getContent());
        $this->postJson('/api/labels/stickers/url', $body + ['layout' => 'single-custom', 'w' => 100, 'h' => 50, 'part' => 'top'])->assertStatus(422);
    }

    /** Owner, 2026-11-16: "Circular one and rectangular one come side by side?" → "Build". */
    public function test_a_pair_sheet_prints_each_lid_beside_its_side_label(): void
    {
        $item = \App\Models\Item::factory()->create(['name' => 'Chicken Curry', 'label_enabled' => true, 'label_ingredients' => 'Chicken, onion, chilli, coconut.']);
        $body = ['items' => [['id' => $item->id, 'kind' => 'item', 'copies' => 3]], 'lang' => 'en', 'fill' => true, 'preview' => true, 'layout' => 'a4-round-custom', 'w' => 80, 'pair_w' => 100, 'pair_h' => 50];

        $res = $this->postJson('/api/labels/stickers/url', $body)->assertOk();
        $this->assertSame(3, $res->json('summary.stickers'), 'a copy is a pair');
        $this->assertSame(['w' => 100, 'h' => 50, 'pairs' => 3, 'design' => 'small'], array_map(fn ($v) => is_float($v) ? (int) $v : $v, $res->json('summary.pair')));
        $this->assertSame(1, $res->json('summary.pages'));
        $this->assertSame([], $res->json('summary.dropped'));

        $html = (string) $this->get($res->json('view_url'))->assertOk()->getContent();
        $this->assertSame(6, substr_count($html, 'data-testid="sticker"'), 'three lids and three side labels');
        $this->assertSame(3, substr_count($html, 'border-radius:50%'), 'three round cut lines');
        $this->assertSame(6, substr_count($html, '>Chicken Curry<'), 'the name on each');
        $this->assertSame(3, substr_count($html, '>EXP DATE<'), 'the dates on the side labels only');

        // The live preview is the first pair, not the lid alone.
        $one = (string) $this->get($res->json('one_url'))->assertOk()->getContent();
        $this->assertSame(2, substr_count($one, 'data-testid="sticker"'));

        // Two sizes that cannot sit side by side on A4 are refused with the reason.
        $this->postJson('/api/labels/stickers/url', ['w' => 200, 'pair_w' => 150, 'pair_h' => 100] + $body)->assertStatus(422);
        // A pair needs a round lid.
        $this->postJson('/api/labels/stickers/url', ['layout' => 'a4-custom', 'w' => 80, 'h' => 80] + $body)->assertStatus(422);
    }
}

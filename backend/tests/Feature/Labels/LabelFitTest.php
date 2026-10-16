<?php

declare(strict_types=1);

namespace Tests\Feature\Labels;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Item;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Label audit, Batch B (2026-10-16): a preview says which of the product's
 * parts the picked size could not draw, so nothing goes missing unseen.
 */
class LabelFitTest extends TestCase
{
    use RefreshDatabase;

    private Item $bajiya;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        Cache::flush();
        $this->bajiya = $this->makeItem(false, 0, ['name' => 'Bajiya', 'name_dv' => 'ބަޖިޔާ', 'label_enabled' => true, 'label_shelf_life_days' => 90, 'label_ingredients_source' => 'manual', 'label_ingredients' => 'Flour, egg, tuna, onion, chilli, curry leaves, salt', 'label_badges' => ['halal', 'spicy', 'homemade', 'best_seller']]);
    }

    /** @return list<string> */
    private function dropped(array $size, string $lang = 'en'): array
    {
        return $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $this->bajiya->id, 'copies' => 1]], 'lang' => $lang, 'preview' => true] + $size)
            ->assertOk()->json('summary.dropped');
    }

    public function test_a_preview_lists_the_parts_the_size_could_not_draw(): void
    {
        // The full A4 sticker has room for everything.
        $this->assertSame([], $this->dropped(['layout' => 'a4-4']));

        // 30 × 20 mm leaves out the ingredients, the QR and the badges, and says so in plain words.
        $tiny = $this->dropped(['layout' => 'a4-custom', 'w' => 30, 'h' => 20]);
        $this->assertSame(['Ingredients', 'QR code', 'Badge Halal', 'Badge Spicy', 'Badge Homemade', 'Badge Best seller'], $tiny);

        // A real print's summary carries the same list.
        $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $this->bajiya->id, 'copies' => 1]], 'layout' => 'a4-4'])->assertOk()->assertJsonPath('summary.dropped', []);
    }
}

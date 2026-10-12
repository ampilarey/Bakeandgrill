<?php

declare(strict_types=1);

namespace Tests\Feature\Labels;

use App\Domains\Labels\AllergenIcons;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Item;
use App\Models\SiteSetting;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Allergen pictograms (2026-10-12): symbols with the word beneath on the
 * full sticker, the chilli for a spicy item, behind a switch.
 */
class AllergenIconsTest extends TestCase
{
    use RefreshDatabase;

    private Item $bajiya;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        CarbonImmutable::setTestNow('2026-10-12 09:00:00');
        SiteSetting::set('business_phone', '+960 912 0011');
        Cache::flush();
        $this->bajiya = $this->makeItem(false, 0, [
            'name' => 'Bajiya', 'label_enabled' => true, 'label_shelf_life_days' => 90,
            'label_ingredients_source' => 'manual',
            'label_ingredients' => 'Flour, salt, oil, egg, onion, smoked tuna',
            'allergens' => ['egg', 'tree-nuts', 'lupin'],
            'spice_level' => 'hot',
        ]);
    }

    protected function tearDown(): void
    {
        CarbonImmutable::setTestNow();
        parent::tearDown();
    }

    private function sheet(array $body): string
    {
        $res = $this->postJson('/api/labels/stickers/url', $body)->assertOk();

        return (string) $this->get($res->json('view_url'))->assertOk()->getContent();
    }

    public function test_words_map_to_symbols_each_once_the_chilli_last(): void
    {
        $this->assertSame(['egg', 'nuts', 'peanut', 'milk', 'fish'], AllergenIcons::keys(['egg', 'tree nuts', 'Peanuts', 'dairy', 'eggs', 'tuna']));
        $this->assertSame(['celery', 'chilli'], AllergenIcons::keys(['celery', 'lupin'], true), 'no symbol for lupin; the chilli for a spicy item');
        $this->assertCount(AllergenIcons::MAX, AllergenIcons::keys(['egg', 'milk', 'gluten', 'nuts', 'soy', 'fish', 'shellfish', 'sesame', 'mustard']), 'the row holds seven');
        $this->assertSame('SHELLFISH', AllergenIcons::caption('shellfish'));
        $this->assertStringStartsWith('data:image/svg+xml;base64,', AllergenIcons::dataUri('egg'));
        $this->assertStringContainsString('aria-label="EGG"', AllergenIcons::svg('egg'));
    }

    public function test_the_full_sticker_draws_the_symbols_with_the_word_beneath(): void
    {
        $html = $this->sheet(['items' => [['id' => $this->bajiya->id, 'copies' => 1]], 'layout' => 'a4-4']);
        foreach (['egg', 'nuts', 'chilli'] as $key) {
            $this->assertStringContainsString(AllergenIcons::dataUri($key), $html, $key);
        }
        $this->assertStringContainsString('>EGG</div>', $html);
        $this->assertStringContainsString('>NUTS</div>', $html);
        $this->assertStringContainsString('>SPICY</div>', $html);
        $this->assertStringContainsString('Contains egg, tree nuts, lupin', $html, 'the note still names every allergen, symbol or not');

        // The compact sticker has no room for the row.
        $html = $this->sheet(['items' => [['id' => $this->bajiya->id, 'copies' => 1]], 'layout' => 'a4-12']);
        $this->assertStringNotContainsString(AllergenIcons::dataUri('egg'), $html);
    }

    public function test_the_symbols_have_a_switch(): void
    {
        $this->putJson('/api/labels/settings', ['label_allergen_icons' => '0'])->assertOk()->assertJsonPath('data.label_allergen_icons', '0');
        $html = $this->sheet(['items' => [['id' => $this->bajiya->id, 'copies' => 1]], 'layout' => 'a4-4']);
        $this->assertStringNotContainsString(AllergenIcons::dataUri('egg'), $html);
        $this->assertStringContainsString('Contains egg, tree nuts, lupin', $html);
    }
}

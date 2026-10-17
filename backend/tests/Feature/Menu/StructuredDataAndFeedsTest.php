<?php

declare(strict_types=1);

namespace Tests\Feature\Menu;

use App\Domains\Menu\Feeds\CatalogFeed;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Category;
use App\Models\Item;
use App\Models\SiteSetting;
use App\Models\Variant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** JSON-LD and catalogue feeds (iruali import plan, feature 11). */
class StructuredDataAndFeedsTest extends TestCase
{
    use RefreshDatabase;

    private Item $item;

    protected function setUp(): void
    {
        parent::setUp();
        $cat = Category::create(['name' => 'Short eats', 'slug' => 'short-eats', 'is_active' => true]);
        $this->item = Item::create(['category_id' => $cat->id, 'name' => 'Bajiya', 'base_price' => 12.5, 'sku' => 'SD-1', 'is_active' => true, 'is_available' => true, 'description' => 'Tuna pastry']);
        Item::create(['category_id' => $cat->id, 'name' => 'Secret dish', 'base_price' => 30, 'sku' => 'SD-2', 'is_active' => true, 'is_available' => true, 'launch_at' => now()->addWeek()]);
        Item::create(['category_id' => $cat->id, 'name' => 'Gone dish', 'base_price' => 30, 'sku' => 'SD-3', 'is_active' => false, 'is_available' => true]);
        $sized = Item::create(['category_id' => $cat->id, 'name' => 'Juice', 'base_price' => 0, 'sku' => 'SD-4', 'is_active' => true, 'is_available' => true, 'has_variants' => true]);
        Variant::create(['item_id' => $sized->id, 'name' => 'Large', 'price' => 35, 'is_active' => true, 'is_available' => true, 'sort_order' => 1]);
        SiteSetting::set('business_phone', '+960 333 4444');
    }

    /** @return list<array<string, mixed>> */
    private function jsonLd(string $html): array
    {
        preg_match_all('#<script type="application/ld\+json">(.*?)</script>#s', $html, $m);

        return array_map(fn (string $j) => json_decode(trim($j), true, 512, JSON_THROW_ON_ERROR), $m[1]);
    }

    public function test_every_page_carries_the_restaurant_and_a_dish_page_its_breadcrumbs(): void
    {
        $blocks = $this->jsonLd($this->get('/menu/' . $this->item->id)->assertOk()->getContent());
        $types = array_column($blocks, '@type');
        $this->assertContains('Restaurant', $types);
        $this->assertContains('MenuItem', $types);
        $this->assertContains('BreadcrumbList', $types);

        $restaurant = $blocks[array_search('Restaurant', $types, true)];
        $this->assertSame('+960 333 4444', $restaurant['telephone']);
        $this->assertSame('OrderAction', $restaurant['potentialAction']['@type']);
        $this->assertNotEmpty($restaurant['openingHoursSpecification']);

        $crumbs = $blocks[array_search('BreadcrumbList', $types, true)]['itemListElement'];
        $this->assertSame(['Home', 'Menu', 'Short eats', 'Bajiya'], array_column($crumbs, 'name'));
    }

    public function test_the_menu_data_leaves_out_a_coming_soon_dish(): void
    {
        $html = $this->get('/menu')->assertOk()->getContent();
        $menu = collect($this->jsonLd($html))->firstWhere('@type', 'Menu');
        $this->assertNotNull($menu);
        $this->assertStringNotContainsString('Secret dish', json_encode($menu));
        $this->assertStringContainsString('Bajiya', json_encode($menu));
    }

    public function test_the_feeds_need_the_secret_and_list_each_dish_and_size(): void
    {
        $links = CatalogFeed::links();
        $this->get('/feeds/' . str_repeat('x', 40) . '/google.xml')->assertNotFound();

        $xml = $this->get(parse_url($links['google'], PHP_URL_PATH))->assertOk()->getContent();
        $this->assertStringContainsString('<g:id>item-' . $this->item->id . '</g:id>', $xml);
        $this->assertStringContainsString('<g:price>12.50 MVR</g:price>', $xml);
        $this->assertStringContainsString('Juice (Large)', $xml);
        $this->assertStringNotContainsString('Secret dish', $xml);
        $this->assertStringNotContainsString('Gone dish', $xml);
        $this->assertNotFalse(simplexml_load_string($xml));

        $csv = $this->get(parse_url($links['facebook'], PHP_URL_PATH))->assertOk()->getContent();
        $this->assertStringStartsWith('id,item_group_id,title', $csv);

        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $new = $this->postJson('/api/admin/feeds/rotate')->assertOk()->json('links.google');
        $this->assertNotSame($links['google'], $new);
        $this->get(parse_url($links['google'], PHP_URL_PATH))->assertNotFound();
    }
}

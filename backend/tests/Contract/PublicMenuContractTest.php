<?php

declare(strict_types=1);

namespace Tests\Contract;

use App\Models\Category;
use App\Models\Item;

/**
 * Contract tests for public menu endpoints.
 */
class PublicMenuContractTest extends ContractTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        $category = Category::create([
            'name' => 'Grills',
            'slug' => 'grills',
            'sort_order' => 1,
            'is_active' => true,
        ]);

        Item::create([
            'category_id' => $category->id,
            'name' => 'Beef Burger',
            'base_price' => 30.00,
            'sku' => 'GRL-001',
            'barcode' => 'GRL-001',
            'is_active' => true,
            'is_available' => true,
        ]);
    }

    public function test_categories_list_shape(): void
    {
        $response = $this->getJson('/api/categories');
        $response->assertOk();
        $this->assertMatchesApiSnapshot($response, 'menu.categories.list');
    }

    public function test_items_list_shape(): void
    {
        $response = $this->getJson('/api/items');
        $response->assertOk();
        $this->assertMatchesApiSnapshot($response, 'menu.items.list');
    }

    public function test_item_show_shape(): void
    {
        // Prefer the fixture SKU — migrations may seed inactive system items
        // (e.g. catering placeholder) that sort before this active menu row.
        $item = Item::query()->where('sku', 'GRL-001')->firstOrFail();
        $response = $this->getJson("/api/items/{$item->id}");
        $response->assertOk();
        $this->assertMatchesApiSnapshot($response, 'menu.item.show');
    }
}

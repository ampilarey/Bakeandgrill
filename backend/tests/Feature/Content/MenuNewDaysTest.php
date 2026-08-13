<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use App\Models\Category;
use App\Models\Item;
use App\Models\SiteSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

class MenuNewDaysTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
    }

    public function test_public_items_include_created_at(): void
    {
        $category = Category::create([
            'name' => 'Grill',
            'slug' => 'grill-new-days',
            'is_active' => true,
        ]);
        Item::create([
            'category_id' => $category->id,
            'name' => 'New Burger',
            'base_price' => 40,
            'sku' => 'NEW-B001',
            'barcode' => 'NEW-B001',
            'is_active' => true,
            'is_available' => true,
        ]);

        $item = $this->getJson('/api/items')->assertOk()->json('data.0');
        $this->assertArrayHasKey('created_at', $item);
        $this->assertNotEmpty($item['created_at']);
    }

    public function test_menu_new_days_appears_in_public_settings(): void
    {
        SiteSetting::set('menu_new_days', '21', 'order_app');
        SiteSetting::set('menu_new_days', '21', 'shared');
        SiteSetting::query()->where('key', 'menu_new_days')->update([
            'is_public' => true,
            'group' => 'Branding',
            'type' => 'text',
        ]);
        SiteSetting::bust();
        \App\Domains\Content\ContentResolver::bust();

        $public = $this->getJson('/api/site-settings/public')->assertOk()->json('settings');
        $this->assertArrayHasKey('menu_new_days', $public);
        $this->assertSame('21', (string) $public['menu_new_days']);

        $content = $this->getJson('/api/content?app=order_app&locale=en')->assertOk()->json('content');
        $this->assertSame('21', (string) ($content['menu_new_days'] ?? ''));
    }
}

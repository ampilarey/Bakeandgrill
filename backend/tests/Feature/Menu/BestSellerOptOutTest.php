<?php

declare(strict_types=1);

namespace Tests\Feature\Menu;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Category;
use App\Models\Item;
use App\Models\ItemChannelAvailability;
use App\Models\MenuGroup;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Role;
use App\Services\PosPopularNowService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Owner, 2026-10-13: "Some items like water bottles are always in the best
 * sellers section but I don't want some items be there." Keep out of best
 * sellers on the item leaves it out of the website's Best Sellers, the order
 * app's Top sellers count, the till's Popular now row and the signage
 * Bestsellers slide. Sales reports still count it.
 */
class BestSellerOptOutTest extends TestCase
{
    use RefreshDatabase;

    private Item $water;

    private Item $bajiya;

    protected function setUp(): void
    {
        parent::setUp();
        Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'description' => '', 'is_active' => true]);
        Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'description' => '', 'is_active' => true]);
        PermissionCatalogSync::sync();
        Cache::flush();
        MenuGroup::firstOrCreate(['id' => 1], ['name' => 'Default', 'slug' => 'default', 'sort_order' => 0, 'is_active' => true]);
        $cat = Category::create(['name' => 'Drinks', 'is_active' => true]);
        $this->water = $this->item('Water Bottle', $cat->id, true);
        $this->bajiya = $this->item('Bajiya', $cat->id, false);
        // Water sells three times as much as bajiya, every one of them today.
        $this->sold($this->water, 3);
        $this->sold($this->bajiya, 1);
    }

    private function item(string $name, int $categoryId, bool $hidden): Item
    {
        $item = Item::create([
            'name' => $name,
            'base_price' => 10,
            'is_active' => true,
            'is_available' => true,
            'category_id' => $categoryId,
            'has_variants' => false,
            'menu_group_id' => 1,
            'hide_from_bestsellers' => $hidden,
        ]);
        foreach (['online_pickup', 'takeaway', 'dine_in', 'delivery'] as $ch) {
            ItemChannelAvailability::query()->updateOrCreate(['item_id' => $item->id, 'channel' => $ch], ['is_enabled' => true]);
        }

        return $item;
    }

    private function sold(Item $item, int $lines): void
    {
        for ($i = 0; $i < $lines; $i++) {
            $order = Order::factory()->create(['status' => 'completed', 'created_at' => now()->subMinutes(10 + $i)]);
            OrderItem::create([
                'order_id' => $order->id,
                'item_id' => $item->id,
                'item_name' => $item->name,
                'quantity' => 2,
                'unit_price' => 10,
                'total_price' => 20,
            ]);
        }
    }

    public function test_a_hidden_item_reports_no_sales_to_the_order_app_and_stays_off_the_home_page(): void
    {
        $rows = collect($this->getJson('/api/items?available_only=1&channel=online_pickup')->assertOk()->json('data'));
        $this->assertSame(0, (int) $rows->firstWhere('id', $this->water->id)['sales_30d'], 'water is kept out of Top sellers');
        $this->assertSame(1, (int) $rows->firstWhere('id', $this->bajiya->id)['sales_30d']);
        $this->assertArrayNotHasKey('hide_from_bestsellers', $rows->first(), 'the switch itself is the Admin\'s, not the public menu\'s');

        $ids = $this->get('/')->assertOk()->viewData('bestSellers')->pluck('id')->all();
        $this->assertContains($this->bajiya->id, $ids);
        $this->assertNotContains($this->water->id, $ids, 'the home page\'s Best Sellers skip water');
    }

    public function test_the_till_and_the_signage_skip_a_hidden_item(): void
    {
        $now = CarbonImmutable::now();
        $ranked = app(PosPopularNowService::class)->rank([$this->water->id, $this->bajiya->id], $now);
        $this->assertContains($this->bajiya->id, $ranked);
        $this->assertNotContains($this->water->id, $ranked, 'Popular now on the till skips water');

        $ids = array_column($this->getJson('/api/signage')->assertOk()->json('bestsellers'), 'id');
        $this->assertContains($this->bajiya->id, $ids);
        $this->assertNotContains($this->water->id, $ids, 'the signage Bestsellers slide skips water');
    }

    public function test_the_admin_switches_it_on_the_item_and_sees_it_in_the_list(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $this->patchJson("/api/items/{$this->bajiya->id}", ['hide_from_bestsellers' => true])->assertOk();
        $this->assertTrue(Item::query()->findOrFail($this->bajiya->id)->hide_from_bestsellers);

        $rows = collect($this->getJson('/api/items')->assertOk()->json('data'));
        $this->assertTrue($rows->firstWhere('id', $this->bajiya->id)['hide_from_bestsellers']);
        $this->assertTrue($rows->firstWhere('id', $this->water->id)['hide_from_bestsellers']);

        // Both hidden now: the home page falls back to its usual picks rather than showing nothing.
        $this->patchJson("/api/items/{$this->water->id}", ['hide_from_bestsellers' => false])->assertOk();
        $this->assertFalse(Item::query()->findOrFail($this->water->id)->hide_from_bestsellers);
    }
}

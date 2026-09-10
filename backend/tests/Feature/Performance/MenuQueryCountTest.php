<?php

declare(strict_types=1);

namespace Tests\Feature\Performance;

use App\Models\Category;
use App\Models\Item;
use App\Models\ItemPhoto;
use App\Models\KitchenMenuState;
use App\Models\MenuGroup;
use App\Models\Variant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * What one customer opening the menu costs the database.
 *
 * `GET /api/items` is the first thing the order app asks for and the busiest
 * request in the estate. It used to cost two queries per dish: every item
 * re-read the one-row `kitchen_menu_state` table, and every item queried
 * `item_channel_availability` for a row the controller had already eager
 * loaded. Sixty dishes meant 148 queries; ten meant 47. Nobody notices on a
 * laptop with the database in memory — on the shared cPanel box that is 120
 * round trips per customer, per menu open.
 *
 * The number that matters is not the absolute count, it is the *shape*: a
 * menu that costs the same whether it has ten dishes or a hundred. These
 * tests fix the ceiling so the next per-item lookup shows up here rather than
 * on the phone of somebody trying to order lunch.
 */
class MenuQueryCountTest extends TestCase
{
    use RefreshDatabase;

    /**
     * The costs above are flat, so the ceiling only has to be above the flat
     * cost with room for a legitimate addition — not tight enough to fail on
     * an unrelated commit. A per-item lookup blows through it immediately:
     * sixty dishes would add sixty.
     */
    private const CEILING = 45;

    private function seedMenu(int $items, ?MenuGroup $group = null): void
    {
        $category = Category::firstOrCreate(['name' => 'Food'], ['is_active' => true]);
        for ($i = 0; $i < $items; $i++) {
            $item = Item::create([
                'name' => "Dish {$i}" . ($group ? " {$group->slug}" : ''),
                'category_id' => $category->id,
                'menu_group_id' => $group?->id,
                'base_price' => 50 + $i,
                'is_available' => true,
                'is_active' => true,
                'has_variants' => $i % 3 === 0,
            ]);
            if ($i % 3 === 0) {
                foreach (['Small', 'Large'] as $n => $size) {
                    Variant::create([
                        'item_id' => $item->id,
                        'name' => $size,
                        'price' => 50 + $i + ($n * 20),
                        'is_active' => true,
                    ]);
                }
            }
            if ($i % 2 === 0) {
                Model::unguarded(fn () => ItemPhoto::create([
                    'item_id' => $item->id,
                    'url' => "/storage/items/{$i}.jpg",
                    'alt_text' => "Dish {$i}",
                    'is_primary' => true,
                    'sort_order' => 0,
                ]));
            }
        }
    }

    /** @return array{queries:int, body:array<mixed>} */
    private function measure(string $uri): array
    {
        DB::flushQueryLog();
        DB::enableQueryLog();
        $response = $this->getJson($uri)->assertOk();
        $log = DB::getQueryLog();
        DB::disableQueryLog();

        return ['queries' => count($log), 'body' => $response->json()];
    }

    private function assertUnderCeiling(string $label, int $queries, int $dishes): void
    {
        $this->assertLessThanOrEqual(
            self::CEILING,
            $queries,
            sprintf(
                '%s cost %d queries for %d dishes (ceiling %d). That is about %.1f per dish, '
                . 'so something in the per-item loop is querying instead of reading an '
                . 'eager-loaded relation. Run this test and dump DB::getQueryLog() to see which.',
                $label,
                $queries,
                $dishes,
                self::CEILING,
                $queries / max(1, $dishes),
            ),
        );
    }

    public function test_a_ten_dish_menu_does_not_query_per_dish(): void
    {
        $this->seedMenu(10);

        $result = $this->measure('/api/items?view=customer');

        $this->assertCount(10, $result['body']['data']);
        $this->assertUnderCeiling('The customer menu', $result['queries'], 10);
    }

    public function test_a_sixty_dish_menu_costs_the_same_as_a_ten_dish_one(): void
    {
        // The whole point. Before the fix this was 148.
        $this->seedMenu(60);

        $result = $this->measure('/api/items?view=customer');

        $this->assertCount(60, $result['body']['data']);
        $this->assertUnderCeiling('The customer menu', $result['queries'], 60);
    }

    public function test_the_pos_menu_does_not_query_per_dish(): void
    {
        $this->seedMenu(60);

        $result = $this->measure('/api/items?view=pos');

        $this->assertUnderCeiling('The POS menu', $result['queries'], 60);
    }

    public function test_switching_the_served_menu_is_seen_by_the_next_request(): void
    {
        /*
         * The guard on the fix above. `activeMenuGroupIds()` now remembers its
         * answer, and a memo that outlives the request would leave the order
         * app serving the breakfast menu all evening — the switch would look
         * dead. It is an instance property on a service that is not a
         * container singleton, which is what makes that safe; this proves it
         * rather than asserting it in a comment.
         */
        $breakfast = MenuGroup::create(['name' => 'Breakfast', 'slug' => 'breakfast', 'is_active' => true]);
        $dinner = MenuGroup::create(['name' => 'Dinner', 'slug' => 'dinner', 'is_active' => true]);
        $this->seedMenu(3, $breakfast);
        $this->seedMenu(3, $dinner);

        KitchenMenuState::current()->update(['active_menu_group_ids' => [$breakfast->id]]);
        $names = array_column($this->getJson('/api/items?view=customer')->assertOk()->json('data'), 'name');
        $this->assertNotEmpty($names);
        foreach ($names as $name) {
            $this->assertStringContainsString('breakfast', $name);
        }

        KitchenMenuState::current()->update(['active_menu_group_ids' => [$dinner->id]]);
        $names = array_column($this->getJson('/api/items?view=customer')->assertOk()->json('data'), 'name');
        $this->assertNotEmpty($names);
        foreach ($names as $name) {
            $this->assertStringContainsString('dinner', $name);
        }
    }
}

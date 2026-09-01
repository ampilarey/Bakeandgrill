<?php

declare(strict_types=1);

namespace Tests\Feature\Stock;

use App\Domains\Inventory\Services\InventoryDeductionService;
use App\Domains\Inventory\Services\RecipeStockService;
use App\Models\InventoryItem;
use App\Models\Item;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Recipe;
use App\Models\RecipeItem;
use App\Models\Variant;
use App\Services\ItemAvailabilityService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * One pool of ingredients, several sizes drawing on it at different rates.
 *
 * Owner, 2026-09-01: "We serve beetle leaf with nuts, if i bring 50 leafs,
 * some customers may order full and others half… 1 full is equal to 2 half."
 * And on running down: "Offer full until the last possible piece."
 */
class VariantConsumptionFactorTest extends TestCase
{
    use RefreshDatabase;

    private InventoryItem $leaves;

    private Item $item;

    private Variant $full;

    private Variant $half;

    protected function setUp(): void
    {
        parent::setUp();

        $this->leaves = InventoryItem::create([
            'name' => 'Beetle leaf',
            'unit' => 'pcs',
            'current_stock' => 50,
            'is_active' => true,
        ]);

        $this->item = $this->makeItem(false, 0, [
            'category_id' => $this->makeCategory()->id,
            'has_variants' => true,
        ]);

        // The recipe is written for one whole portion: one leaf.
        $recipe = Recipe::create([
            'item_id' => $this->item->id,
            'yield_quantity' => 1,
            'limits_availability' => true,
            'total_cost' => 0,
        ]);
        RecipeItem::create([
            'recipe_id' => $recipe->id,
            'inventory_item_id' => $this->leaves->id,
            'quantity' => 1,
            'unit' => 'pcs',
        ]);

        $this->full = $this->item->variants()->create([
            'name' => 'Full', 'price' => 20, 'is_active' => true,
            'sort_order' => 0, 'consumption_factor' => 1,
        ]);
        $this->half = $this->item->variants()->create([
            'name' => 'Half', 'price' => 12, 'is_active' => true,
            'sort_order' => 1, 'consumption_factor' => 0.5,
        ]);
    }

    private function sell(?Variant $variant, int $quantity): Order
    {
        $order = Order::factory()->paid()->create([
            'customer_id' => $this->makeCustomer()->id,
            'total' => 0,
        ]);
        OrderItem::create([
            'order_id' => $order->id,
            'item_id' => $this->item->id,
            'item_name' => $this->item->name,
            'variant_id' => $variant?->id,
            'variant_name' => $variant?->name,
            'quantity' => $quantity,
            'unit_price' => $variant?->price ?? $this->item->base_price,
            'total_price' => 0,
        ]);

        app(InventoryDeductionService::class)->deductForOrder($order->fresh());

        return $order;
    }

    private function stock(): float
    {
        return (float) $this->leaves->fresh()->current_stock;
    }

    public function test_one_full_and_two_halves_take_two_leaves_from_the_one_pool(): void
    {
        $this->sell($this->full, 1);
        $this->sell($this->half, 2);

        // Before the factor existed both lines took a whole leaf each: 3.
        $this->assertEqualsWithDelta(48.0, $this->stock(), 0.001);
    }

    public function test_a_line_with_no_variant_still_takes_a_whole_portion(): void
    {
        $this->sell(null, 3);

        $this->assertEqualsWithDelta(47.0, $this->stock(), 0.001);
    }

    public function test_a_variant_left_at_the_default_factor_takes_a_whole_portion(): void
    {
        $plain = $this->item->variants()->create([
            'name' => 'Regular', 'price' => 20, 'is_active' => true, 'sort_order' => 2,
        ]);

        $this->sell($plain, 4);

        $this->assertEqualsWithDelta(46.0, $this->stock(), 0.001);
    }

    public function test_a_refund_puts_back_exactly_what_the_size_took(): void
    {
        $order = $this->sell($this->half, 2);
        $this->assertEqualsWithDelta(49.0, $this->stock(), 0.001);

        app(InventoryDeductionService::class)->restoreForOrder($order->fresh());

        $this->assertEqualsWithDelta(50.0, $this->stock(), 0.001);
    }

    public function test_a_partial_refund_restores_its_share_of_the_size(): void
    {
        $order = $this->sell($this->half, 2);

        app(InventoryDeductionService::class)->restoreForOrder($order->fresh(), null, 0.5, 7);

        // Half of the 1 leaf the two half-portions cost.
        $this->assertEqualsWithDelta(49.5, $this->stock(), 0.001);
    }

    public function test_the_pool_counts_more_halves_than_fulls(): void
    {
        $stock = app(RecipeStockService::class);

        $this->assertSame(50, $stock->portionsAvailable($this->item, $this->full));
        $this->assertSame(100, $stock->portionsAvailable($this->item, $this->half));
    }

    public function test_full_is_offered_down_to_the_last_whole_leaf(): void
    {
        $this->leaves->update(['current_stock' => 1]);
        $stock = app(RecipeStockService::class);

        // Nothing is held back for the halves: one leaf still buys one full.
        $this->assertSame(1, $stock->portionsAvailable($this->item, $this->full));
        $this->assertSame(2, $stock->portionsAvailable($this->item, $this->half));
    }

    public function test_half_outlives_full_once_less_than_a_whole_leaf_is_left(): void
    {
        $this->leaves->update(['current_stock' => 0.5]);
        $stock = app(RecipeStockService::class);

        $this->assertSame(0, $stock->portionsAvailable($this->item, $this->full));
        $this->assertSame(1, $stock->portionsAvailable($this->item, $this->half));

        // The dish stays on the menu while one size can still be made.
        $this->assertTrue(app(ItemAvailabilityService::class)->isAvailable($this->item->fresh(), 'dine_in'));
    }

    public function test_the_dish_leaves_the_menu_when_the_pool_is_empty(): void
    {
        $this->leaves->update(['current_stock' => 0]);

        $result = app(ItemAvailabilityService::class)->check($this->item->fresh(), 'dine_in');

        $this->assertFalse($result->allowed);
        $this->assertSame('out_of_stock', $result->reasonCode);
    }

    public function test_a_recipe_that_does_not_cap_availability_never_86s_the_dish(): void
    {
        // Off by default: an ingredient count nobody keeps current must not
        // take an item off the menu on its own.
        $this->item->recipe->update(['limits_availability' => false]);
        $this->leaves->update(['current_stock' => 0]);

        $stock = app(RecipeStockService::class);
        $this->assertNull($stock->portionsAvailable($this->item->fresh(), $this->full));
        $this->assertTrue(app(ItemAvailabilityService::class)->isAvailable($this->item->fresh(), 'dine_in'));
    }

    public function test_a_size_that_draws_nothing_from_the_pool_is_never_sold_out(): void
    {
        $this->half->update(['consumption_factor' => 0]);
        $this->leaves->update(['current_stock' => 0]);

        $stock = app(RecipeStockService::class);
        $this->assertNull($stock->portionsAvailable($this->item->fresh(), $this->half->fresh()));
        $this->assertTrue(app(ItemAvailabilityService::class)->isAvailable($this->item->fresh(), 'dine_in'));

        $this->sell($this->half->fresh(), 5);
        $this->assertEqualsWithDelta(0.0, $this->stock(), 0.001);
    }

    public function test_the_menu_feed_reports_what_is_left_per_size(): void
    {
        $this->leaves->update(['current_stock' => 3]);

        $byVariant = app(RecipeStockService::class)->portionsByVariant($this->item->fresh());

        $this->assertSame(3, $byVariant[$this->full->id]);
        $this->assertSame(6, $byVariant[$this->half->id]);
    }
}

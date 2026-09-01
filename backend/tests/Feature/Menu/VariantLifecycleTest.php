<?php

declare(strict_types=1);

namespace Tests\Feature\Menu;

use App\Models\Item;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\User;
use App\Models\Variant;
use App\Services\ItemAvailabilityService;
use App\Services\RecipeCostCalculator;
use Laravel\Sanctum\Sanctum;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Findings from the variant audit, 2026-09-01.
 *
 * The two that mattered were both "the menu offers something nobody can
 * actually buy": a size the owner deleted went on selling, and a dish whose
 * every size was off still looked orderable.
 */
class VariantLifecycleTest extends TestCase
{
    use RefreshDatabase;

    private function actAsOwner(): User
    {
        $owner = $this->makeOwner();
        Sanctum::actingAs($owner, ['staff']);

        return $owner;
    }

    private function sizedItem(): Item
    {
        return $this->makeItem(false, 0, [
            'category_id' => $this->makeCategory()->id,
            'has_variants' => true,
            'base_price' => 0,
        ]);
    }

    // ── Deleting a size ──────────────────────────────────────────────────────

    public function test_a_size_left_out_of_the_save_is_removed(): void
    {
        // The editor's remove button only dropped the row from the form;
        // nothing ever deleted it, so the size kept selling everywhere.
        $this->actAsOwner();
        $item = $this->sizedItem();
        $keep = $item->variants()->create(['name' => 'Small', 'price' => 10, 'is_active' => true]);
        $dropped = $item->variants()->create(['name' => 'Large', 'price' => 20, 'is_active' => true]);

        $this->patchJson("/api/items/{$item->id}", [
            'variants' => [['id' => $keep->id, 'name' => 'Small', 'price' => 10]],
        ])->assertOk();

        $this->assertNull(Variant::find($dropped->id));
        $this->assertNotNull(Variant::find($keep->id));
        $this->assertSame(1, $item->variants()->count());
    }

    public function test_a_size_that_has_been_ordered_is_deactivated_not_deleted(): void
    {
        // Old receipts and reports still have to resolve the name and price.
        $this->actAsOwner();
        $item = $this->sizedItem();
        $keep = $item->variants()->create(['name' => 'Small', 'price' => 10, 'is_active' => true]);
        $sold = $item->variants()->create(['name' => 'Large', 'price' => 20, 'is_active' => true]);

        $order = Order::factory()->paid()->create(['customer_id' => $this->makeCustomer()->id]);
        OrderItem::create([
            'order_id' => $order->id,
            'item_id' => $item->id,
            'item_name' => $item->name,
            'variant_id' => $sold->id,
            'variant_name' => 'Large',
            'quantity' => 1,
            'unit_price' => 20,
            'total_price' => 20,
        ]);

        $this->patchJson("/api/items/{$item->id}", [
            'variants' => [['id' => $keep->id, 'name' => 'Small', 'price' => 10]],
        ])->assertOk();

        $fresh = Variant::find($sold->id);
        $this->assertNotNull($fresh, 'a size with sales history survives');
        $this->assertFalse((bool) $fresh->is_active, 'but is off the menu');
    }

    public function test_a_save_that_only_reorders_keeps_every_size(): void
    {
        $this->actAsOwner();
        $item = $this->sizedItem();
        $a = $item->variants()->create(['name' => 'Small', 'price' => 10, 'is_active' => true]);
        $b = $item->variants()->create(['name' => 'Large', 'price' => 20, 'is_active' => true]);

        $this->patchJson("/api/items/{$item->id}", [
            'variants' => [
                ['id' => $b->id, 'name' => 'Large', 'price' => 20],
                ['id' => $a->id, 'name' => 'Small', 'price' => 10],
            ],
        ])->assertOk();

        $this->assertSame(2, $item->variants()->count());
    }

    public function test_a_save_that_carries_no_variants_key_leaves_them_alone(): void
    {
        // A price-only PATCH must not wipe an item's sizes.
        $this->actAsOwner();
        $item = $this->sizedItem();
        $item->variants()->create(['name' => 'Small', 'price' => 10, 'is_active' => true]);

        $this->patchJson("/api/items/{$item->id}", ['name' => 'Renamed'])->assertOk();

        $this->assertSame(1, $item->variants()->count());
    }

    // ── A dish with no size anybody can pick ─────────────────────────────────

    public function test_a_dish_is_sold_out_when_every_size_is(): void
    {
        $item = $this->sizedItem();
        $item->variants()->create(['name' => 'Small', 'price' => 10, 'is_active' => true, 'is_available' => false]);
        $item->variants()->create(['name' => 'Large', 'price' => 20, 'is_active' => true, 'is_available' => false]);

        $result = app(ItemAvailabilityService::class)->check($item->fresh(), 'dine_in');

        $this->assertFalse($result->allowed);
        $this->assertSame('out_of_stock', $result->reasonCode);
    }

    public function test_a_dish_is_sold_out_when_every_size_is_inactive(): void
    {
        $item = $this->sizedItem();
        $item->variants()->create(['name' => 'Small', 'price' => 10, 'is_active' => false]);

        $this->assertFalse(app(ItemAvailabilityService::class)->isAvailable($item->fresh(), 'dine_in'));
    }

    public function test_one_pickable_size_keeps_the_dish_on_the_menu(): void
    {
        $item = $this->sizedItem();
        $item->variants()->create(['name' => 'Small', 'price' => 10, 'is_active' => true]);
        $item->variants()->create(['name' => 'Large', 'price' => 20, 'is_active' => true, 'is_available' => false]);

        $this->assertTrue(app(ItemAvailabilityService::class)->isAvailable($item->fresh(), 'dine_in'));
    }

    public function test_a_dish_with_no_sizes_at_all_is_unaffected(): void
    {
        // has_variants ticked but none created yet — still being set up, not
        // sold out.
        $item = $this->sizedItem();

        $this->assertTrue(app(ItemAvailabilityService::class)->isAvailable($item->fresh(), 'dine_in'));
    }

    public function test_the_pos_menu_marks_such_a_dish_sold_out(): void
    {
        // The register reads /pos/menu (PosMenuBuilder), which computes
        // availability itself rather than through ItemAvailabilityService.
        $item = $this->sizedItem();
        $item->variants()->create(['name' => 'Small', 'price' => 10, 'is_active' => true, 'is_available' => false]);

        $menu = app(\App\Services\PosMenuBuilder::class)->build('dine_in');
        $row = collect($menu['items'])->firstWhere('id', $item->id);

        $this->assertNotNull($row, 'the dish is still listed');
        $this->assertFalse($row['availability']['available']);
        $this->assertSame('out_of_stock', $row['availability']['reason_code']);
    }

    public function test_the_pos_menu_keeps_a_dish_with_one_pickable_size(): void
    {
        $item = $this->sizedItem();
        $item->variants()->create(['name' => 'Small', 'price' => 10, 'is_active' => true]);
        $item->variants()->create(['name' => 'Large', 'price' => 20, 'is_active' => true, 'is_available' => false]);

        $menu = app(\App\Services\PosMenuBuilder::class)->build('dine_in');
        $row = collect($menu['items'])->firstWhere('id', $item->id);

        $this->assertTrue($row['availability']['available']);
    }

    // ── Costing the size whose price is shown ────────────────────────────────

    public function test_a_half_portion_is_costed_at_half_the_recipe(): void
    {
        $item = $this->sizedItem();
        $item->update(['cost' => 10]);
        $half = new Variant(['name' => 'Half', 'price' => 12, 'consumption_factor' => 0.5]);

        $costs = app(RecipeCostCalculator::class);

        $this->assertEqualsWithDelta(5.0, $costs->effectiveCostForVariant($item, $half), 0.001);
        // A size with its own cost recorded skips the arithmetic.
        $half->cost = 7;
        $this->assertEqualsWithDelta(7.0, $costs->effectiveCostForVariant($item, $half), 0.001);
        // No size at all is just the item's cost.
        $this->assertEqualsWithDelta(10.0, $costs->effectiveCostForVariant($item, null), 0.001);
    }

    // ── Price display without eager loading ──────────────────────────────────

    public function test_the_from_price_is_right_even_when_variants_were_not_loaded(): void
    {
        // A sized dish carries base_price 0, so a silent fallback prints
        // "MVR 0.00" for a real product.
        $item = $this->sizedItem();
        $item->variants()->create(['name' => 'Small', 'price' => 15, 'is_active' => true]);

        $fresh = Item::findOrFail($item->id);
        $this->assertFalse($fresh->relationLoaded('variants'));

        $info = $fresh->displayPriceInfo();
        $this->assertEqualsWithDelta(15.0, $info['price'], 0.001);
        $this->assertTrue($info['from']);
    }
}

<?php

declare(strict_types=1);

namespace Tests\Feature\Menu;

use App\Domains\Menu\Services\BundlePricingService;
use App\Models\Category;
use App\Models\ComboItem;
use App\Models\Item;
use App\Models\PlatterGroup;
use App\Models\Variant;
use App\Services\EffectivePriceService;
use App\Services\ItemAvailabilityService;
use App\Services\RecipeCostCalculator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Bundles: what they cost, what they cost *us*, and when they may be sold.
 *
 * Owner, 2026-09-06: "Fix all", against an audit of bundles, combos and
 * platters. Three of its findings are held here.
 *
 *   F1  "Bundle discount (%)" was stored, validated, returned by the API and
 *       read by no calculation anywhere.
 *   F3  A bundle's availability never looked at its contents, and the only
 *       order-time check was stock — so a child 86'd with the "Sold out"
 *       toggle was skipped and the bundle sold anyway.
 *   F4  A bundle's cost came from its own recipe only, so margins treated the
 *       lowest-margin thing on a menu as pure profit.
 */
class BundlePricingAndAvailabilityTest extends TestCase
{
    use RefreshDatabase;

    private function category(): Category
    {
        return Category::firstOrCreate(['name' => 'Bundles'], ['is_active' => true]);
    }

    private function dish(string $name, float $price, array $over = []): Item
    {
        return Item::create(array_merge([
            'category_id' => $this->category()->id,
            'name' => $name,
            'base_price' => $price,
            'is_active' => true,
            'is_available' => true,
        ], $over));
    }

    /** @param list<array{0: Item, 1: int, 2?: bool}> $children */
    private function bundle(string $name, float $ownPrice, array $children, ?float $pct = null): Item
    {
        $combo = $this->dish($name, $ownPrice, [
            'is_combo' => true,
            'combo_discount_pct' => $pct,
        ]);

        foreach ($children as $row) {
            ComboItem::create([
                'combo_id' => $combo->id,
                'item_id' => $row[0]->id,
                'quantity' => $row[1],
                'is_optional' => $row[2] ?? false,
            ]);
        }

        return $combo->fresh();
    }

    private function priceOf(Item $item): float
    {
        return app(EffectivePriceService::class)
            ->resolveUnitPrice($item->id, (float) $item->base_price, $item)
            ->unitPrice;
    }

    // ── F1: the discount does something ──────────────────────────────────

    public function test_a_bundle_with_no_discount_keeps_its_own_price(): void
    {
        // The default, and what every existing bundle does today.
        $burger = $this->dish('Burger', 60);
        $combo = $this->bundle('Meal Deal', 100, [[$burger, 1]]);

        $this->assertEqualsWithDelta(100.0, $this->priceOf($combo), 0.001);
    }

    public function test_a_discount_prices_the_bundle_from_its_contents(): void
    {
        // 60 + 2×20 = 100, less 20% = 80.
        $burger = $this->dish('Burger', 60);
        $fries = $this->dish('Fries', 20);
        $combo = $this->bundle('Meal Deal', 999, [[$burger, 1], [$fries, 2]], pct: 20);

        $this->assertEqualsWithDelta(80.0, $this->priceOf($combo), 0.001);
    }

    public function test_the_bundle_follows_its_children_when_their_prices_change(): void
    {
        // The reason a bundle discount is worth having at all: put the price
        // of chicken up and the bundle follows, instead of quietly widening
        // its own discount until somebody notices.
        $burger = $this->dish('Burger', 60);
        $combo = $this->bundle('Meal Deal', 999, [[$burger, 1]], pct: 10);
        $this->assertEqualsWithDelta(54.0, $this->priceOf($combo), 0.001);

        $burger->update(['base_price' => 80]);

        $this->assertEqualsWithDelta(72.0, $this->priceOf($combo->fresh()), 0.001);
    }

    public function test_an_optional_child_is_not_charged_for(): void
    {
        // The customer is not guaranteed to get it, so charging for it would
        // be charging for a maybe.
        $burger = $this->dish('Burger', 60);
        $sauce = $this->dish('Extra Sauce', 10);
        $combo = $this->bundle('Meal Deal', 999, [[$burger, 1], [$sauce, 1, true]], pct: 0.0);

        $combo->update(['combo_discount_pct' => 10]);

        $this->assertEqualsWithDelta(54.0, $this->priceOf($combo->fresh()), 0.001);
    }

    public function test_a_sized_child_counts_at_its_cheapest_size(): void
    {
        // The same "From" price the menu advertises that child at.
        $drink = $this->dish('Drink', 0, ['has_variants' => true]);
        Variant::create(['item_id' => $drink->id, 'name' => 'Small', 'price' => 15, 'is_active' => true]);
        Variant::create(['item_id' => $drink->id, 'name' => 'Large', 'price' => 25, 'is_active' => true]);
        $combo = $this->bundle('Drink Deal', 999, [[$drink->fresh(), 2]], pct: 0);
        $combo->update(['combo_discount_pct' => 50]);

        $this->assertEqualsWithDelta(15.0, $this->priceOf($combo->fresh()), 0.001);
    }

    public function test_a_bundle_with_nothing_priced_inside_keeps_its_own_price(): void
    {
        // Rather than give the food away at zero.
        $free = $this->dish('Napkin', 0);
        $combo = $this->bundle('Odd Bundle', 45, [[$free, 1]], pct: 20);

        $this->assertEqualsWithDelta(45.0, $this->priceOf($combo), 0.001);
    }

    public function test_a_platter_is_priced_by_its_own_price_not_its_contents(): void
    {
        // A platter's contents are not known until somebody picks them.
        $burger = $this->dish('Burger', 60);
        $platter = $this->bundle('Build Your Own', 120, [[$burger, 1]], pct: 50);
        PlatterGroup::create([
            'item_id' => $platter->id,
            'name' => 'Pick two',
            'rule_type' => 'exactly',
            'min_count' => 2,
        ]);

        $this->assertEqualsWithDelta(120.0, $this->priceOf($platter->fresh()), 0.001);
    }

    // ── F3: a bundle is only as available as its contents ────────────────

    private function availability(Item $item): \App\Services\AvailabilityResult
    {
        return app(ItemAvailabilityService::class)->check($item->fresh(), 'takeaway');
    }

    public function test_a_bundle_is_available_when_its_contents_are(): void
    {
        $burger = $this->dish('Burger', 60);
        $combo = $this->bundle('Meal Deal', 100, [[$burger, 1]]);

        $this->assertTrue($this->availability($combo)->allowed);
    }

    public function test_a_bundle_is_sold_out_when_a_child_is_switched_off(): void
    {
        /*
         * The finding. A dish 86'd with the "Sold out" toggle usually tracks
         * no stock at all, so nothing looked at it: the bundle stayed on the
         * menu, sold, and could not be made.
         */
        $burger = $this->dish('Burger', 60, ['is_available' => false]);
        $combo = $this->bundle('Meal Deal', 100, [[$burger, 1]]);

        $result = $this->availability($combo);

        $this->assertFalse($result->allowed);
        $this->assertSame('out_of_stock', $result->reasonCode);
    }

    public function test_a_bundle_is_sold_out_when_a_child_has_run_out_of_stock(): void
    {
        $burger = $this->dish('Burger', 60, [
            'track_stock' => true,
            'availability_type' => 'stock_based',
            'stock_quantity' => 0,
        ]);
        $combo = $this->bundle('Meal Deal', 100, [[$burger, 1]]);

        $this->assertFalse($this->availability($combo)->allowed);
    }

    public function test_an_optional_child_does_not_take_the_bundle_off_the_menu(): void
    {
        // You can still sell the meal without the sauce.
        $burger = $this->dish('Burger', 60);
        $sauce = $this->dish('Extra Sauce', 10, ['is_available' => false]);
        $combo = $this->bundle('Meal Deal', 100, [[$burger, 1], [$sauce, 1, true]]);

        $this->assertTrue($this->availability($combo)->allowed);
    }

    public function test_a_childs_channel_switches_do_not_affect_the_bundle(): void
    {
        /*
         * A child is not being *sold* on this channel, it is being used. Its
         * own channel switches say nothing about whether the kitchen can make
         * it, and treating them as if they did would take bundles off the menu
         * for a reason nobody could find.
         */
        $burger = $this->dish('Burger', 60);
        \App\Models\ItemChannelAvailability::where('item_id', $burger->id)->update(['is_enabled' => false]);
        $combo = $this->bundle('Meal Deal', 100, [[$burger, 1]]);

        $this->assertTrue($this->availability($combo)->allowed);
    }

    // ── F4: a bundle costs what its contents cost ────────────────────────

    public function test_a_bundle_costs_the_sum_of_its_contents(): void
    {
        $burger = $this->dish('Burger', 60, ['cost' => 22.50]);
        $fries = $this->dish('Fries', 20, ['cost' => 5]);
        $combo = $this->bundle('Meal Deal', 100, [[$burger, 1], [$fries, 2]]);

        $this->assertEqualsWithDelta(
            32.50,
            app(RecipeCostCalculator::class)->effectiveCost($combo->fresh()),
            0.001,
        );
    }

    public function test_an_optional_child_is_still_counted_in_the_cost(): void
    {
        // A cost you might incur is a cost worth knowing; costing the bundle
        // as if nobody ever takes the side is the optimistic direction.
        $burger = $this->dish('Burger', 60, ['cost' => 20]);
        $sauce = $this->dish('Sauce', 10, ['cost' => 3]);
        $combo = $this->bundle('Meal Deal', 100, [[$burger, 1], [$sauce, 1, true]]);

        $this->assertEqualsWithDelta(
            23.0,
            app(RecipeCostCalculator::class)->effectiveCost($combo->fresh()),
            0.001,
        );
    }

    public function test_a_cost_entered_on_the_bundle_itself_still_wins(): void
    {
        $burger = $this->dish('Burger', 60, ['cost' => 20]);
        $combo = $this->bundle('Meal Deal', 100, [[$burger, 1]]);
        $combo->update(['cost' => 15]);

        $this->assertEqualsWithDelta(
            15.0,
            app(RecipeCostCalculator::class)->effectiveCost($combo->fresh()),
            0.001,
        );
    }

    public function test_an_unknown_cost_stays_unknown_rather_than_becoming_zero(): void
    {
        // A confident zero is worse than an honest blank: it makes a bundle
        // look like pure profit, which is the mistake this fixes.
        $burger = $this->dish('Burger', 60);
        $combo = $this->bundle('Meal Deal', 100, [[$burger, 1]]);

        $this->assertNull(app(RecipeCostCalculator::class)->effectiveCost($combo->fresh()));
    }

    public function test_a_bundle_inside_a_bundle_does_not_loop(): void
    {
        $burger = $this->dish('Burger', 60, ['cost' => 20]);
        $inner = $this->bundle('Inner', 70, [[$burger, 1]]);
        $outer = $this->bundle('Outer', 130, [[$inner, 2]]);

        $this->assertEqualsWithDelta(
            40.0,
            app(RecipeCostCalculator::class)->effectiveCost($outer->fresh()),
            0.001,
        );
    }

    public function test_the_bundle_price_is_the_same_number_everywhere(): void
    {
        /*
         * The point of resolving this inside EffectivePriceService: the menu,
         * the till, the website and the order itself all ask the same
         * question and cannot get different answers.
         */
        $burger = $this->dish('Burger', 60);
        $combo = $this->bundle('Meal Deal', 999, [[$burger, 1]], pct: 25);

        $direct = app(BundlePricingService::class)->bundlePrice($combo->fresh());
        $viaPricing = $this->priceOf($combo->fresh());
        $viaApi = $this->getJson('/api/items?channel=takeaway&view=customer')
            ->assertOk()
            ->json('data');
        $row = collect($viaApi)->firstWhere('name', 'Meal Deal');

        $this->assertEqualsWithDelta(45.0, $direct, 0.001);
        $this->assertEqualsWithDelta(45.0, $viaPricing, 0.001);
        // The menu must advertise the price the order will charge, so the
        // payload's own price carries it rather than the raw base_price.
        $this->assertEqualsWithDelta(45.0, (float) $row['base_price'], 0.001);
        // And what the same food costs bought separately, for the saving.
        $this->assertEqualsWithDelta(60.0, (float) $row['bundle_contents_price'], 0.001);
    }
}

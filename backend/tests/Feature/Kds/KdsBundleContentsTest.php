<?php

declare(strict_types=1);

namespace Tests\Feature\Kds;

use App\Http\Controllers\Api\KdsController;
use App\Models\Category;
use App\Models\ComboItem;
use App\Models\Item;
use App\Models\Order;
use App\Models\PlatterGroup;
use App\Models\PlatterGroupItem;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The kitchen ticket says what is in a fixed bundle.
 *
 * Owner's audit, 2026-09-06, F6: a platter printed its picks because they are
 * real order lines; a fixed bundle printed one line with the bundle's name,
 * and the kitchen had to know the recipe from memory or a sheet on the wall.
 */
class KdsBundleContentsTest extends TestCase
{
    use RefreshDatabase;

    private function category(): Category
    {
        return Category::firstOrCreate(['name' => 'KDS Bundles'], ['is_active' => true]);
    }

    private function dish(string $name, array $over = []): Item
    {
        return Item::create(array_merge([
            'category_id' => $this->category()->id,
            'name' => $name,
            'base_price' => 40,
            'is_active' => true,
            'is_available' => true,
        ], $over));
    }

    private function order(): Order
    {
        return Order::create([
            'order_number' => 'KDS-BUNDLE-' . uniqid(),
            'type' => 'takeaway',
            'status' => 'pending',
            'subtotal' => 100,
            'tax_amount' => 8,
            'discount_amount' => 0,
            'total' => 108,
            'total_laar' => 10800,
            'payment_status' => 'paid',
        ]);
    }

    /** @return array<string, mixed> the first non-child line of the payload */
    private function firstLine(Order $order): array
    {
        $payload = KdsController::formatKitchenOrder($order->fresh());

        return collect($payload['items'])
            ->firstWhere('parent_order_item_id', null);
    }

    public function test_a_fixed_bundle_line_carries_its_contents(): void
    {
        $burger = $this->dish('Beef Burger');
        $fries = $this->dish('Masala Fries');
        $combo = $this->dish('Family Meal', ['is_combo' => true]);
        ComboItem::create(['combo_id' => $combo->id, 'item_id' => $burger->id, 'quantity' => 1]);
        ComboItem::create(['combo_id' => $combo->id, 'item_id' => $fries->id, 'quantity' => 2]);

        $order = $this->order();
        $order->items()->create([
            'item_id' => $combo->id,
            'item_name' => $combo->name,
            'quantity' => 1,
            'unit_price' => 100,
            'total_price' => 100,
        ]);

        $line = $this->firstLine($order);

        $this->assertSame(
            [
                ['name' => 'Beef Burger', 'quantity' => 1],
                ['name' => 'Masala Fries', 'quantity' => 2],
            ],
            $line['bundle_contents'],
        );
    }

    public function test_contents_are_scaled_by_the_line_quantity(): void
    {
        // The kitchen counts portions, not bundles: two family meals is four
        // portions of fries, and a ticket saying "2" is an order for two.
        $fries = $this->dish('Masala Fries');
        $combo = $this->dish('Family Meal', ['is_combo' => true]);
        ComboItem::create(['combo_id' => $combo->id, 'item_id' => $fries->id, 'quantity' => 2]);

        $order = $this->order();
        $order->items()->create([
            'item_id' => $combo->id,
            'item_name' => $combo->name,
            'quantity' => 2,
            'unit_price' => 100,
            'total_price' => 200,
        ]);

        $this->assertSame(4, $this->firstLine($order)['bundle_contents'][0]['quantity']);
    }

    public function test_an_optional_extra_is_left_to_its_own_line(): void
    {
        // Since F5 the customer chooses it, so one that was taken is already a
        // child line on the ticket and one that was not is not part of this
        // order. Listing it here would print it twice or promise it wrongly.
        $burger = $this->dish('Beef Burger');
        $dip = $this->dish('Garlic Dip');
        $combo = $this->dish('Burger Deal', ['is_combo' => true]);
        ComboItem::create(['combo_id' => $combo->id, 'item_id' => $burger->id, 'quantity' => 1]);
        ComboItem::create(['combo_id' => $combo->id, 'item_id' => $dip->id, 'quantity' => 1, 'is_optional' => true]);

        $order = $this->order();
        $order->items()->create([
            'item_id' => $combo->id,
            'item_name' => $combo->name,
            'quantity' => 1,
            'unit_price' => 70,
            'total_price' => 70,
        ]);

        $contents = collect($this->firstLine($order)['bundle_contents']);

        $this->assertNull($contents->firstWhere('name', 'Garlic Dip'));
        $this->assertNotNull($contents->firstWhere('name', 'Beef Burger'));
    }

    public function test_a_platter_sends_nothing_because_its_picks_are_already_lines(): void
    {
        // Printing both would read as a double order.
        $rice = $this->dish('Fried Rice');
        $platter = $this->dish('Mixed Platter', ['is_combo' => true]);
        $group = PlatterGroup::create([
            'item_id' => $platter->id,
            'name' => 'Pick your sides',
            'rule_type' => 'exactly',
            'min_count' => 1,
            'max_count' => 1,
        ]);
        PlatterGroupItem::create([
            'platter_group_id' => $group->id,
            'item_id' => $rice->id,
            'surcharge' => 0,
        ]);

        $order = $this->order();
        $parent = $order->items()->create([
            'item_id' => $platter->id,
            'item_name' => $platter->name,
            'quantity' => 1,
            'unit_price' => 200,
            'total_price' => 200,
        ]);
        $order->items()->create([
            'parent_order_item_id' => $parent->id,
            'item_id' => $rice->id,
            'item_name' => $rice->name,
            'quantity' => 1,
            'unit_price' => 0,
            'total_price' => 0,
        ]);

        $this->assertNull($this->firstLine($order)['bundle_contents']);
    }

    public function test_an_ordinary_dish_sends_nothing(): void
    {
        $burger = $this->dish('Beef Burger');

        $order = $this->order();
        $order->items()->create([
            'item_id' => $burger->id,
            'item_name' => $burger->name,
            'quantity' => 1,
            'unit_price' => 40,
            'total_price' => 40,
        ]);

        $this->assertNull($this->firstLine($order)['bundle_contents']);
    }
}

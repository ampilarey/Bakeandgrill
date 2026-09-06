<?php

declare(strict_types=1);

namespace Tests\Feature\Menu;

use App\Domains\Menu\Services\ComboOptionResolver;
use App\Models\Category;
use App\Models\ComboItem;
use App\Models\Item;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

/**
 * Optional bundle components are a choice the customer makes.
 *
 * Owner's audit, 2026-09-06, F5: `combo_items.is_optional` rendered as
 * "(optional)" beside a child in the order app and did nothing else. The
 * customer could not opt in or out, the order recorded nothing either way,
 * and `ComboChildStockService` deliberately never deducted an optional
 * child's stock — correctly, because nothing said whether it had been taken.
 *
 * Now a taken extra is a real child order line, which is what puts it on the
 * kitchen ticket and moves its stock through the ordinary path.
 */
class OptionalBundleExtrasTest extends TestCase
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

    private function resolver(): ComboOptionResolver
    {
        return app(ComboOptionResolver::class);
    }

    public function test_a_taken_extra_resolves_at_the_owners_quantity_and_price(): void
    {
        $burger = $this->dish('Beef Burger', 60);
        $dip = $this->dish('Garlic Dip', 10);
        $combo = $this->dish('Burger Deal', 70, ['is_combo' => true]);
        ComboItem::create(['combo_id' => $combo->id, 'item_id' => $burger->id, 'quantity' => 1]);
        ComboItem::create([
            'combo_id' => $combo->id, 'item_id' => $dip->id,
            'quantity' => 2, 'is_optional' => true, 'surcharge' => 15,
        ]);

        $resolved = $this->resolver()->resolve($combo->fresh(), [['item_id' => $dip->id, 'quantity' => 1]]);

        $this->assertCount(1, $resolved);
        $this->assertSame($dip->id, $resolved[0]['item']->id);
        $this->assertSame(2, $resolved[0]['quantity']);
        $this->assertEqualsWithDelta(15.0, $resolved[0]['surcharge'], 0.001);
    }

    public function test_the_client_cannot_set_the_quantity_or_the_price(): void
    {
        // Otherwise a payload asking for fifty free dips is an order for
        // fifty free dips.
        $dip = $this->dish('Garlic Dip', 10);
        $combo = $this->dish('Burger Deal', 70, ['is_combo' => true]);
        ComboItem::create([
            'combo_id' => $combo->id, 'item_id' => $dip->id,
            'quantity' => 1, 'is_optional' => true, 'surcharge' => 15,
        ]);

        $resolved = $this->resolver()->resolve($combo->fresh(), [
            ['item_id' => $dip->id, 'quantity' => 50, 'surcharge' => 0],
        ]);

        $this->assertSame(1, $resolved[0]['quantity']);
        $this->assertEqualsWithDelta(15.0, $resolved[0]['surcharge'], 0.001);
    }

    public function test_a_required_child_cannot_be_picked(): void
    {
        // It comes with the bundle; naming it is a client bug, not an order.
        $burger = $this->dish('Beef Burger', 60);
        $combo = $this->dish('Burger Deal', 70, ['is_combo' => true]);
        ComboItem::create(['combo_id' => $combo->id, 'item_id' => $burger->id, 'quantity' => 1]);

        $this->expectException(ValidationException::class);
        $this->resolver()->resolve($combo->fresh(), [['item_id' => $burger->id, 'quantity' => 1]]);
    }

    public function test_an_item_that_is_not_in_the_bundle_cannot_be_picked(): void
    {
        $stranger = $this->dish('Lobster', 900);
        $combo = $this->dish('Burger Deal', 70, ['is_combo' => true]);
        ComboItem::create([
            'combo_id' => $combo->id,
            'item_id' => $this->dish('Garlic Dip', 10)->id,
            'quantity' => 1, 'is_optional' => true,
        ]);

        $this->expectException(ValidationException::class);
        $this->resolver()->resolve($combo->fresh(), [['item_id' => $stranger->id, 'quantity' => 1]]);
    }

    public function test_taking_the_same_extra_twice_is_taking_it_once(): void
    {
        // The choice is take-it-or-leave-it, so a repeat is a duplicate submit.
        $dip = $this->dish('Garlic Dip', 10);
        $combo = $this->dish('Burger Deal', 70, ['is_combo' => true]);
        ComboItem::create([
            'combo_id' => $combo->id, 'item_id' => $dip->id,
            'quantity' => 1, 'is_optional' => true, 'surcharge' => 15,
        ]);

        $resolved = $this->resolver()->resolve($combo->fresh(), [
            ['item_id' => $dip->id, 'quantity' => 1],
            ['item_id' => $dip->id, 'quantity' => 1],
        ]);

        $this->assertCount(1, $resolved);
    }

    public function test_declining_everything_resolves_to_nothing(): void
    {
        $dip = $this->dish('Garlic Dip', 10);
        $combo = $this->dish('Burger Deal', 70, ['is_combo' => true]);
        ComboItem::create([
            'combo_id' => $combo->id, 'item_id' => $dip->id,
            'quantity' => 1, 'is_optional' => true, 'surcharge' => 15,
        ]);

        $this->assertSame([], $this->resolver()->resolve($combo->fresh(), []));
    }

    public function test_an_order_records_the_extra_as_its_own_line(): void
    {
        $staff = User::factory()->create();
        $burger = $this->dish('Beef Burger', 60);
        $dip = $this->dish('Garlic Dip', 10);
        $combo = $this->dish('Burger Deal', 70, ['is_combo' => true]);
        ComboItem::create(['combo_id' => $combo->id, 'item_id' => $burger->id, 'quantity' => 1]);
        ComboItem::create([
            'combo_id' => $combo->id, 'item_id' => $dip->id,
            'quantity' => 1, 'is_optional' => true, 'surcharge' => 15,
        ]);

        $order = app(\App\Domains\Orders\Services\OrderCreationService::class)->createFromPayload([
            'type' => 'takeaway',
            'items' => [[
                'item_id' => $combo->id,
                'quantity' => 1,
                'children' => [['item_id' => $dip->id, 'quantity' => 1]],
            ]],
        ], $staff);

        /** @var OrderItem $parent */
        $parent = $order->items()->whereNull('parent_order_item_id')->firstOrFail();
        /** @var OrderItem $child */
        $child = $order->items()->whereNotNull('parent_order_item_id')->firstOrFail();

        $this->assertSame($combo->id, $parent->item_id);
        $this->assertSame($dip->id, $child->item_id);
        $this->assertSame($parent->id, $child->parent_order_item_id);
        $this->assertEqualsWithDelta(15.0, (float) $child->unit_price, 0.001);
        // 70 for the bundle plus 15 for the extra.
        $this->assertEqualsWithDelta(85.0, (float) $order->fresh()->subtotal, 0.001);
    }

    public function test_a_free_extra_is_out_of_scope_for_gst(): void
    {
        // It contributes nothing, so taxing it would tax nothing — the same
        // rule a zero-price platter pick already follows.
        $staff = User::factory()->create();
        $napkins = $this->dish('Napkin Pack', 0);
        $combo = $this->dish('Burger Deal', 70, ['is_combo' => true]);
        ComboItem::create([
            'combo_id' => $combo->id, 'item_id' => $napkins->id,
            'quantity' => 1, 'is_optional' => true, 'surcharge' => 0,
        ]);

        $order = app(\App\Domains\Orders\Services\OrderCreationService::class)->createFromPayload([
            'type' => 'takeaway',
            'items' => [[
                'item_id' => $combo->id,
                'quantity' => 1,
                'children' => [['item_id' => $napkins->id, 'quantity' => 1]],
            ]],
        ], $staff);

        $child = $order->items()->whereNotNull('parent_order_item_id')->firstOrFail();

        $this->assertSame('out_of_scope', $child->tax_code);
        $this->assertEqualsWithDelta(0.0, (float) $child->total_price, 0.001);
    }

    public function test_an_extra_scales_with_the_number_of_bundles(): void
    {
        $staff = User::factory()->create();
        $dip = $this->dish('Garlic Dip', 10);
        $combo = $this->dish('Burger Deal', 70, ['is_combo' => true]);
        ComboItem::create([
            'combo_id' => $combo->id, 'item_id' => $dip->id,
            'quantity' => 1, 'is_optional' => true, 'surcharge' => 15,
        ]);

        $order = app(\App\Domains\Orders\Services\OrderCreationService::class)->createFromPayload([
            'type' => 'takeaway',
            'items' => [[
                'item_id' => $combo->id,
                'quantity' => 3,
                'children' => [['item_id' => $dip->id, 'quantity' => 1]],
            ]],
        ], $staff);

        $child = $order->items()->whereNotNull('parent_order_item_id')->firstOrFail();

        $this->assertEqualsWithDelta(3.0, (float) $child->quantity, 0.001);
        $this->assertEqualsWithDelta(45.0, (float) $child->total_price, 0.001);
    }

    public function test_a_bundle_ordered_without_extras_still_writes_one_line(): void
    {
        // Nothing about the default changed: declining is the old behaviour.
        $staff = User::factory()->create();
        $dip = $this->dish('Garlic Dip', 10);
        $combo = $this->dish('Burger Deal', 70, ['is_combo' => true]);
        ComboItem::create([
            'combo_id' => $combo->id, 'item_id' => $dip->id,
            'quantity' => 1, 'is_optional' => true, 'surcharge' => 15,
        ]);

        $order = app(\App\Domains\Orders\Services\OrderCreationService::class)->createFromPayload([
            'type' => 'takeaway',
            'items' => [['item_id' => $combo->id, 'quantity' => 1]],
        ], $staff);

        $this->assertSame(1, $order->items()->count());
        $this->assertEqualsWithDelta(70.0, (float) $order->fresh()->subtotal, 0.001);
    }

    public function test_the_menu_payload_carries_the_extras_price(): void
    {
        $dip = $this->dish('Garlic Dip', 10);
        $combo = $this->dish('Burger Deal', 70, ['is_combo' => true]);
        ComboItem::create([
            'combo_id' => $combo->id, 'item_id' => $dip->id,
            'quantity' => 1, 'is_optional' => true, 'surcharge' => 15,
        ]);

        $rows = $this->getJson('/api/items?view=customer&per_page=100')
            ->assertOk()
            ->json('data');

        $row = collect($rows)->firstWhere('id', $combo->id);
        $entry = collect($row['combo_items'])->firstWhere('item_id', $dip->id);

        $this->assertTrue($entry['is_optional']);
        $this->assertEqualsWithDelta(15.0, (float) $entry['surcharge'], 0.001);
    }

    public function test_an_order_for_an_ordinary_dish_still_rejects_children(): void
    {
        // The `children` field means something specific on two kinds of item
        // and nothing on the rest.
        $burger = $this->dish('Beef Burger', 60);
        $dip = $this->dish('Garlic Dip', 10);

        $this->expectException(ValidationException::class);
        app(\App\Domains\Orders\Services\OrderCreationService::class)->createFromPayload([
            'type' => 'takeaway',
            'items' => [[
                'item_id' => $burger->id,
                'quantity' => 1,
                'children' => [['item_id' => $dip->id, 'quantity' => 1]],
            ]],
        ], User::factory()->create());
    }
}

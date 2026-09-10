<?php

declare(strict_types=1);

namespace Tests\Feature\Kitchen;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Category;
use App\Models\Item;
use App\Models\MenuGroup;
use App\Domains\Orders\Services\OrderCreationService;
use App\Models\Order;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Owner, 2026-09-09, on a kitchen board showing 77 tickets: "the items that
 * are shown in this is already prepared items, sold and paid via pos" — then
 * "this page should show only the items that are active orders".
 *
 * One default caused it. `OrderCreationService` fires an order to the kitchen
 * unless the caller passes `print: false`, and POS never does, so a customer
 * pointing at a bun, paying and walking out printed a chit and left a ticket
 * nobody would ever bump. They accumulate until the board is a record of
 * everything sold rather than a list of what to make.
 *
 * A menu group is already the axis the kitchen display filters on, so it is
 * where "do you make this?" belongs. Defaults to yes, so nothing moves until
 * somebody unticks a group they sell off the shelf.
 */
class KitchenRoutingTest extends TestCase
{
    use RefreshDatabase;

    private \App\Models\User $owner;
    private MenuGroup $kitchen;
    private MenuGroup $counter;
    private Item $burger;
    private Item $bun;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        $this->owner = $this->makeOwner();
        Sanctum::actingAs($this->owner, ['staff']);

        $category = Category::create(['name' => 'Food', 'is_active' => true]);
        $this->kitchen = MenuGroup::create(['name' => 'Grill', 'slug' => 'grill', 'is_active' => true]);
        $this->counter = MenuGroup::create([
            'name' => 'Counter', 'slug' => 'counter', 'is_active' => true, 'goes_to_kitchen' => false,
        ]);

        $this->burger = Item::create([
            'name' => 'Burger', 'category_id' => $category->id, 'menu_group_id' => $this->kitchen->id,
            'base_price' => 60, 'is_available' => true, 'is_active' => true,
        ]);
        $this->bun = Item::create([
            'name' => 'Sweet Bun', 'category_id' => $category->id, 'menu_group_id' => $this->counter->id,
            'base_price' => 10, 'is_available' => true, 'is_active' => true,
        ]);

        // Both groups on the menu that is currently being served, or order
        // creation refuses the line before routing is ever consulted.
        \App\Models\KitchenMenuState::current()->update([
            'active_menu_group_ids' => [$this->kitchen->id, $this->counter->id],
        ]);
    }

    /**
     * Straight through the service the POS posts to, so the thing under test
     * is the routing decision and not the order endpoint's validation.
     *
     * @param  list<Item>  $items
     */
    private function sell(Item ...$items): Order
    {
        $lines = [];
        foreach ($items as $item) {
            $lines[] = [
                'item_id' => $item->id,
                'quantity' => 1,
                'unit_price' => (float) $item->base_price,
            ];
        }

        return app(OrderCreationService::class)->createFromPayload(
            ['type' => 'pos', 'items' => $lines],
            $this->owner,
        );
    }

    public function test_a_group_goes_to_the_kitchen_unless_somebody_says_otherwise(): void
    {
        // The default is today's behaviour, so an upgrade changes nothing.
        $fresh = MenuGroup::create(['name' => 'New', 'slug' => 'new', 'is_active' => true]);

        $this->assertTrue((bool) $fresh->fresh()->goes_to_kitchen);
    }

    public function test_a_counter_sale_is_not_fired_to_the_kitchen(): void
    {
        $order = $this->sell($this->bun);

        // fired_at is the record of the kitchen having seen it. Nothing to
        // make, so nothing was sent and no chit was printed.
        $this->assertNull($order->fired_at);
    }

    public function test_something_the_kitchen_makes_is_still_fired(): void
    {
        $order = $this->sell($this->burger);

        $this->assertNotNull($order->fired_at);
    }

    public function test_a_mixed_order_is_fired_because_part_of_it_is_cooked(): void
    {
        // A bun alongside a burger still needs the burger made.
        $order = $this->sell($this->bun, $this->burger);

        $this->assertNotNull($order->fired_at);
    }

    public function test_an_item_in_no_group_still_reaches_the_kitchen_board(): void
    {
        /*
         * An unfiled item is more likely a new dish nobody has categorised
         * than a counter good, and a ticket that should not have shown beats
         * a dish that never got cooked. (It cannot be sold through the POS at
         * all until it joins a group — the kitchen menu resolver refuses it —
         * so this guards the board's own filter rather than the sale.)
         */
        $category = Category::firstOrFail();
        $orphan = Item::create([
            'name' => 'Special', 'category_id' => $category->id, 'menu_group_id' => null,
            'base_price' => 30, 'is_available' => true, 'is_active' => true,
        ]);
        $order = $this->sell($this->burger);
        \Illuminate\Database\Eloquent\Model::unguarded(fn () => $order->items()->create([
            'item_id' => $orphan->id, 'item_name' => $orphan->name,
            'quantity' => 1, 'unit_price' => 30, 'total_price' => 30,
        ]));
        $order->items()->where('item_id', $this->burger->id)->delete();

        $ids = array_column($this->getJson('/api/kds/orders')->assertOk()->json('orders'), 'id');
        $this->assertContains($order->id, $ids);
    }

    public function test_the_kitchen_board_leaves_out_an_order_with_nothing_to_make(): void
    {
        $counterSale = $this->sell($this->bun);
        $realTicket = $this->sell($this->burger);

        $ids = array_column(
            $this->getJson('/api/kds/orders')->assertOk()->json('orders'),
            'id',
        );

        $this->assertContains($realTicket->id, $ids);
        $this->assertNotContains($counterSale->id, $ids);
    }

    public function test_the_board_clears_tickets_that_are_already_sitting_there(): void
    {
        // The 77. Created before the flag existed, fired, paid, never bumped.
        $stale = $this->sell($this->bun);
        $stale->update(['status' => 'paid', 'payment_status' => 'paid', 'fired_at' => now()->subDay()]);

        $ids = array_column($this->getJson('/api/kds/orders')->assertOk()->json('orders'), 'id');

        $this->assertNotContains($stale->id, $ids);
    }

    public function test_turning_a_group_back_on_puts_its_tickets_back(): void
    {
        $order = $this->sell($this->bun);
        $order->update(['status' => 'paid', 'fired_at' => now()]);

        $this->patchJson("/api/admin/menu-groups/{$this->counter->id}", ['goes_to_kitchen' => true])
            ->assertOk()
            ->assertJsonPath('menu_group.goes_to_kitchen', true);

        $ids = array_column($this->getJson('/api/kds/orders')->assertOk()->json('orders'), 'id');
        $this->assertContains($order->id, $ids);
    }

    public function test_the_routing_switch_needs_a_manager(): void
    {
        $cook = $this->makeStaff();
        $cook->grantPermission('kds.view');
        Sanctum::actingAs($cook, ['staff']);

        $this->patchJson("/api/admin/menu-groups/{$this->kitchen->id}", ['goes_to_kitchen' => false])
            ->assertForbidden();

        $this->assertTrue((bool) $this->kitchen->fresh()->goes_to_kitchen);
    }
}

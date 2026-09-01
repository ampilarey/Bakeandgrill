<?php

declare(strict_types=1);

namespace Tests\Feature\Menu;

use App\Models\Item;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Variant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The cleanup companion to the deletion fix: sizes orphaned before removing
 * one in the editor actually removed anything. Reports, never changes.
 */
class ListStaleVariantsTest extends TestCase
{
    use RefreshDatabase;

    private function sizedItem(string $name = 'Water'): Item
    {
        return $this->makeItem(false, 0, [
            'category_id' => $this->makeCategory()->id,
            'has_variants' => true,
            'name' => $name,
            'base_price' => 0,
        ]);
    }

    private function sell(Item $item, Variant $variant): void
    {
        $order = Order::factory()->paid()->create(['customer_id' => $this->makeCustomer()->id]);
        OrderItem::create([
            'order_id' => $order->id,
            'item_id' => $item->id,
            'item_name' => $item->name,
            'variant_id' => $variant->id,
            'variant_name' => $variant->name,
            'quantity' => 1,
            'unit_price' => $variant->price,
            'total_price' => $variant->price,
        ]);
    }

    public function test_it_names_a_size_that_never_sold_on_a_dish_that_does(): void
    {
        $item = $this->sizedItem();
        $sold = $item->variants()->create(['name' => 'Small', 'price' => 10, 'is_active' => true]);
        $item->variants()->create(['name' => 'Ghost', 'price' => 20, 'is_active' => true]);
        $this->sell($item, $sold);

        $this->artisan('menu:stale-variants')
            ->expectsOutputToContain('1 size(s) have never been ordered')
            ->assertExitCode(0);
    }

    public function test_it_stays_quiet_when_every_size_has_sold(): void
    {
        $item = $this->sizedItem();
        $small = $item->variants()->create(['name' => 'Small', 'price' => 10, 'is_active' => true]);
        $large = $item->variants()->create(['name' => 'Large', 'price' => 20, 'is_active' => true]);
        $this->sell($item, $small);
        $this->sell($item, $large);

        $this->artisan('menu:stale-variants')
            ->expectsOutputToContain('No sizes look left over')
            ->assertExitCode(0);
    }

    public function test_a_dish_that_has_never_sold_is_hidden_by_default(): void
    {
        // A brand-new dish has no sales on any size — that is not a leftover.
        $item = $this->sizedItem('Brand new');
        $item->variants()->create(['name' => 'One', 'price' => 10, 'is_active' => true]);

        $this->artisan('menu:stale-variants')
            ->expectsOutputToContain('No sizes look left over')
            ->assertExitCode(0);

        $this->artisan('menu:stale-variants --all')
            ->expectsOutputToContain('1 size(s) have never been ordered')
            ->assertExitCode(0);
    }

    public function test_a_size_already_deactivated_is_not_reported(): void
    {
        // Deactivated is the tidy end state; it is not selling.
        $item = $this->sizedItem();
        $sold = $item->variants()->create(['name' => 'Small', 'price' => 10, 'is_active' => true]);
        $item->variants()->create(['name' => 'Retired', 'price' => 20, 'is_active' => false]);
        $this->sell($item, $sold);

        $this->artisan('menu:stale-variants')
            ->expectsOutputToContain('No sizes look left over')
            ->assertExitCode(0);
    }

    public function test_it_changes_nothing(): void
    {
        $item = $this->sizedItem();
        $sold = $item->variants()->create(['name' => 'Small', 'price' => 10, 'is_active' => true]);
        $ghost = $item->variants()->create(['name' => 'Ghost', 'price' => 20, 'is_active' => true]);
        $this->sell($item, $sold);

        $this->artisan('menu:stale-variants')->assertExitCode(0);

        $this->assertNotNull(Variant::find($ghost->id));
        $this->assertTrue((bool) Variant::find($ghost->id)->is_active);
    }
}

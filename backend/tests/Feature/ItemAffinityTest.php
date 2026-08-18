<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domains\Marketing\Services\ItemAffinityService;
use App\Domains\Reporting\Support\ReportMoneySql;
use App\Models\Category;
use App\Models\Item;
use App\Models\ItemPairStat;
use App\Models\Order;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class ItemAffinityTest extends TestCase
{
    use RefreshDatabase;

    private Category $category;

    protected function setUp(): void
    {
        parent::setUp();
        $this->category = Category::create(['name' => 'Affinity', 'slug' => 'affinity', 'is_active' => true]);
    }

    private function item(string $name, float $price = 10.0): Item
    {
        return Item::create([
            'category_id' => $this->category->id,
            'name' => $name,
            'base_price' => $price,
            'sku' => 'AFF-' . strtoupper(substr(md5($name), 0, 6)),
            'is_active' => true,
            'is_available' => true,
        ]);
    }

    /** @param list<Item> $items */
    private function order(string $status, array $items, ?string $createdAt = null): Order
    {
        $order = Order::create([
            'order_number' => 'AFF-' . str()->random(8),
            'type' => 'dine_in',
            'status' => $status,
            'payment_status' => 'paid',
            'subtotal' => 0,
            'total' => 0,
        ]);

        if ($createdAt !== null) {
            $order->forceFill(['created_at' => $createdAt])->saveQuietly();
        }

        foreach ($items as $item) {
            DB::table('order_items')->insert([
                'order_id' => $order->id,
                'item_id' => $item->id,
                'item_name' => $item->name,
                'quantity' => 1,
                'unit_price' => $item->base_price,
                'total_price' => $item->base_price,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        return $order;
    }

    /**
     * The bug this whole change starts from.
     *
     * ReportMoneySql::SALE_STATUSES is the project's single definition of "a
     * sale that counts", and every money report uses it. The affinity service
     * used to carry its own narrower list — ['paid', 'completed'] — which
     * silently dropped every delivery order that ends at `delivered`. Nothing
     * auto-completes those (OrderStatusMachine has delivered → completed as a
     * manual edge), so the recommendations were being built from a different
     * history than the revenue figures sitting next to them.
     */
    public function test_delivered_orders_count_towards_pairs(): void
    {
        $burger = $this->item('Burger', 60);
        $fries = $this->item('Fries', 25);

        // Delivered, never manually ticked to completed — a normal delivery.
        $this->order('delivered', [$burger, $fries]);

        app(ItemAffinityService::class)->recompute(90);

        $this->assertDatabaseHas('item_pair_stats', [
            'item_id' => $burger->id,
            'paired_item_id' => $fries->id,
            'pair_count' => 1,
        ]);
    }

    public function test_every_sale_status_is_counted_and_nothing_else_is(): void
    {
        $a = $this->item('Anchor');

        foreach (ReportMoneySql::SALE_STATUSES as $i => $status) {
            $this->order($status, [$a, $this->item("Sold {$i}")]);
        }
        // Money never changed hands / came back — these must not teach the model.
        $this->order('cancelled', [$a, $this->item('Cancelled partner')]);
        $this->order('pending', [$a, $this->item('Pending partner')]);

        app(ItemAffinityService::class)->recompute(90);

        $anchorRows = ItemPairStat::query()->where('item_id', $a->id)->get();

        $this->assertCount(
            count(ReportMoneySql::SALE_STATUSES),
            $anchorRows,
            'one partner per sale status, and none from cancelled or pending',
        );
        $this->assertSame(
            count(ReportMoneySql::SALE_STATUSES),
            (int) $anchorRows->first()->total_orders,
            'the window size must exclude non-sales too, or support is wrong',
        );
    }

    public function test_lookback_window_excludes_older_orders(): void
    {
        $a = $this->item('Recent A');
        $b = $this->item('Recent B');

        $this->order('paid', [$a, $b], now()->subDays(200)->toDateTimeString());

        app(ItemAffinityService::class)->recompute(90);

        $this->assertDatabaseCount('item_pair_stats', 0);
    }

    /**
     * The reason for the whole scoring change.
     *
     * Water rides along in nearly every order, so raw co-occurrence makes it
     * the top "pairing" for everything and the panel becomes wallpaper. Curry
     * appears in fewer orders overall but almost always alongside Roshi, which
     * is a real pairing. Lift has to prefer Curry.
     */
    public function test_lift_prefers_a_real_pairing_over_the_bestseller(): void
    {
        $roshi = $this->item('Roshi', 5);
        $curry = $this->item('Curry', 20);
        $water = $this->item('Water', 8);

        // Roshi + Curry together 6 times.
        for ($i = 0; $i < 6; $i++) {
            $this->order('paid', [$roshi, $curry, $water]);
        }
        // Roshi + Water together 10 times — Water wins on raw count.
        for ($i = 0; $i < 4; $i++) {
            $this->order('paid', [$roshi, $water]);
        }
        // Water is simply in everything, including orders with neither.
        for ($i = 0; $i < 30; $i++) {
            $this->order('paid', [$water, $this->item("Filler {$i}")]);
        }

        app(ItemAffinityService::class)->recompute(90);

        $byCount = ItemPairStat::query()
            ->where('item_id', $roshi->id)
            ->orderByDesc('pair_count')
            ->first();
        $this->assertSame($water->id, (int) $byCount->paired_item_id, 'precondition: raw counts favour the bestseller');

        $byLift = ItemPairStat::query()
            ->where('item_id', $roshi->id)
            ->orderByDesc('lift')
            ->first();
        $this->assertSame($curry->id, (int) $byLift->paired_item_id, 'lift must surface the real pairing');

        // And the ranking the customer actually sees follows lift.
        $recs = app(ItemAffinityService::class)->recommendationsForCart([$roshi->id], 1);
        $this->assertSame($curry->id, $recs->first()['id']);
    }

    public function test_lift_of_one_means_no_relationship(): void
    {
        // Two items that co-occur exactly as often as chance would predict.
        $a = $this->item('Independent A');
        $b = $this->item('Independent B');

        // A in 4 of 8 orders, B in 4 of 8, together in 2 — 4/8 × 4/8 × 8 = 2.
        for ($i = 0; $i < 2; $i++) {
            $this->order('paid', [$a, $b, $this->item("Pad A{$i}")]);
        }
        for ($i = 0; $i < 2; $i++) {
            $this->order('paid', [$a, $this->item("Pad B{$i}")]);
        }
        for ($i = 0; $i < 2; $i++) {
            $this->order('paid', [$b, $this->item("Pad C{$i}")]);
        }
        for ($i = 0; $i < 2; $i++) {
            $this->order('paid', [$this->item("Pad D{$i}"), $this->item("Pad E{$i}")]);
        }

        app(ItemAffinityService::class)->recompute(90);

        $row = ItemPairStat::query()
            ->where('item_id', $a->id)
            ->where('paired_item_id', $b->id)
            ->first();

        $this->assertEqualsWithDelta(1.0, (float) $row->lift, 0.01);
        $this->assertEqualsWithDelta(0.5, (float) $row->confidence, 0.01, 'half of A\'s orders also held B');
    }

    public function test_pair_revenue_is_the_two_items_not_the_whole_basket(): void
    {
        $burger = $this->item('Rev Burger', 60);
        $fries = $this->item('Rev Fries', 25);
        $cake = $this->item('Rev Cake', 100);

        // One order holding all three: the burger/fries pair took 85, not 185.
        $this->order('paid', [$burger, $fries, $cake]);

        app(ItemAffinityService::class)->recompute(90);

        $row = ItemPairStat::query()
            ->where('item_id', $burger->id)
            ->where('paired_item_id', $fries->id)
            ->first();

        $this->assertEqualsWithDelta(85.0, (float) $row->pair_revenue, 0.01);
    }

    public function test_a_one_off_pairing_is_never_recommended(): void
    {
        $anchor = $this->item('Support anchor');
        $fluke = $this->item('Bought once with it');

        // A ratio on a sample of one scores spectacularly and means nothing.
        $this->order('paid', [$anchor, $fluke]);

        app(ItemAffinityService::class)->recompute(90);

        $this->assertDatabaseHas('item_pair_stats', [
            'item_id' => $anchor->id,
            'paired_item_id' => $fluke->id,
        ]);
        $this->assertTrue(
            app(ItemAffinityService::class)->recommendationsForCart([$anchor->id])->isEmpty(),
            'a pair below MIN_PAIR_SUPPORT is stored for the report but must not advise a customer',
        );
    }

    public function test_recommendations_skip_sold_out_and_cart_items(): void
    {
        $anchor = $this->item('Rec anchor');
        $soldOut = $this->item('Sold out partner');
        $good = $this->item('Available partner');

        for ($i = 0; $i < 5; $i++) {
            $this->order('paid', [$anchor, $soldOut, $good]);
        }

        app(ItemAffinityService::class)->recompute(90);
        $soldOut->update(['is_available' => false]);

        $recs = app(ItemAffinityService::class)->recommendationsForCart([$anchor->id], 3);
        $ids = $recs->pluck('id')->all();

        $this->assertContains($good->id, $ids);
        $this->assertNotContains($soldOut->id, $ids, 'never suggest something the kitchen cannot make');
        $this->assertNotContains($anchor->id, $ids, 'never suggest what is already in the cart');
    }
}

<?php

declare(strict_types=1);

namespace Tests\Feature\Promotions;

use App\Domains\Orders\Services\OrderTotalsCalculator;
use App\Models\Category;
use App\Models\Device;
use App\Models\Item;
use App\Models\Order;
use App\Models\OrderPromotion;
use App\Models\Permission;
use App\Models\Promotion;
use App\Models\Role;
use App\Models\SiteSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\PreparesPosApi;
use Tests\TestCase;

/**
 * A discount must not outlive the cart it was sized for.
 *
 * Measured during the 2026-09-01 audit, on these same endpoints: a MVR 600
 * ticket with MVR 200 off, cut back to MVR 100, settled at **MVR 0.00** — by
 * promo code and by manual discount alike. The promo's MVR 500 minimum spend
 * was never re-checked and the manual cap was never re-applied. The food went
 * out free and the order recorded nothing.
 */
class StaleDiscountTest extends TestCase
{
    use PreparesPosApi;
    use RefreshDatabase;

    private User $staff;

    private Device $device;

    private Item $item;

    protected function setUp(): void
    {
        parent::setUp();

        $role = Role::firstOrCreate(
            ['slug' => 'staff'],
            ['name' => 'Staff', 'description' => '', 'is_active' => true],
        );
        $this->staff = User::create([
            'name' => 'Staff', 'email' => 'stale@test.com',
            'password' => Hash::make('password'), 'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'), 'is_active' => true,
        ]);
        $this->device = Device::create(['name' => 'POS', 'identifier' => 'S-001', 'type' => 'pos', 'is_active' => true]);
        $this->withHeader('X-Device-Identifier', $this->device->identifier);

        $category = Category::create(['name' => 'Food', 'slug' => 'food', 'is_active' => true]);
        $this->item = Item::create([
            'category_id' => $category->id, 'name' => 'Burger', 'base_price' => 100.00,
            'is_active' => true, 'is_available' => true,
        ]);

        Permission::updateOrCreate(
            ['slug' => 'promotions.discounts'],
            ['name' => 'Apply Discounts', 'group' => 'Promotions'],
        );
        $this->staff->grantPermission('promotions.discounts');
        // This suite is about re-checking a discount after the cart changes,
        // not about who may give one. Make the actor their own approver so
        // the discount lands without the SMS code a cashier would need.
        Permission::updateOrCreate(
            ['slug' => 'promotions.discount_override'],
            ['name' => 'Approve POS discounts', 'group' => 'Promotions'],
        );
        $this->staff->grantPermission('promotions.discount_override');
        $this->staff->unsetRelation('permissions');
        $this->preparePosApi($this->staff, $this->device);
        Sanctum::actingAs($this->staff, ['staff']);
    }

    /** @param array<string, mixed> $extra */
    private function ring(int $quantity, array $extra = []): Order
    {
        $response = $this->postJson('/api/orders', array_merge([
            'type' => 'takeaway',
            'device_identifier' => $this->device->identifier,
            'print' => false,
            'items' => [['item_id' => $this->item->id, 'quantity' => $quantity]],
        ], $extra));

        return Order::findOrFail($response->json('order.id'));
    }

    /** Cut the ticket down to a single burger — MVR 100. */
    private function shrinkToOne(Order $order): Order
    {
        $order->items()->limit(1)->update(['quantity' => 1, 'total_price' => 100.00]);
        $order->items()->orderBy('id')->skip(1)->take(50)->get()->each->delete();

        return app(OrderTotalsCalculator::class)->recalculateAndPersist(Order::findOrFail($order->id));
    }

    // ── Promo codes ─────────────────────────────────────────────────────────

    public function test_a_promo_below_its_minimum_spend_is_dropped(): void
    {
        Promotion::create([
            'name' => 'Big spend', 'code' => 'BIG200',
            'type' => 'fixed', 'discount_value' => 20000,
            'min_order_laar' => 50000,
            'is_active' => true, 'stackable' => false,
        ]);

        $order = $this->ring(6);
        $this->postJson("/api/orders/{$order->id}/apply-promo", ['code' => 'BIG200'])->assertOk();
        $this->assertSame(20000, (int) $order->fresh()->promo_discount_laar);

        $shrunk = $this->shrinkToOne($order);

        $this->assertSame(0, (int) $shrunk->promo_discount_laar);
        $this->assertGreaterThan(0, (int) $shrunk->total_laar, 'The ticket must not settle at zero.');
    }

    public function test_the_dropped_promo_is_released_not_left_pending(): void
    {
        // A draft left behind would keep holding the campaign and per-customer
        // counts for a promo nobody is getting.
        Promotion::create([
            'name' => 'Big spend', 'code' => 'BIG200',
            'type' => 'fixed', 'discount_value' => 20000,
            'min_order_laar' => 50000,
            'is_active' => true, 'stackable' => false,
        ]);

        $order = $this->ring(6);
        $this->postJson("/api/orders/{$order->id}/apply-promo", ['code' => 'BIG200'])->assertOk();
        $this->shrinkToOne($order);

        $this->assertSame(
            'released',
            OrderPromotion::where('order_id', $order->id)->latest('id')->first()?->status,
        );
    }

    public function test_a_percentage_promo_is_repriced_not_dropped(): void
    {
        // Still earned — 10% of a smaller cart is simply a smaller number.
        Promotion::create([
            'name' => 'Tenth off', 'code' => 'TEN',
            'type' => 'percentage', 'discount_value' => 10,
            'is_active' => true, 'stackable' => false,
        ]);

        $order = $this->ring(6);
        $this->postJson("/api/orders/{$order->id}/apply-promo", ['code' => 'TEN'])->assertOk();
        $this->assertSame(6000, (int) $order->fresh()->promo_discount_laar);

        $shrunk = $this->shrinkToOne($order);

        $this->assertSame(1000, (int) $shrunk->promo_discount_laar);
    }

    public function test_a_promo_that_still_qualifies_is_left_alone(): void
    {
        Promotion::create([
            'name' => 'Flat fifty', 'code' => 'FIFTY',
            'type' => 'fixed', 'discount_value' => 5000,
            'is_active' => true, 'stackable' => false,
        ]);

        $order = $this->ring(6);
        $this->postJson("/api/orders/{$order->id}/apply-promo", ['code' => 'FIFTY'])->assertOk();

        $shrunk = $this->shrinkToOne($order);

        $this->assertSame(5000, (int) $shrunk->promo_discount_laar);
        $this->assertSame(5000, (int) $shrunk->subtotal_laar - (int) $shrunk->promo_discount_laar);
    }

    // ── Manual discounts ────────────────────────────────────────────────────

    public function test_a_manual_discount_keeps_the_share_it_was_given(): void
    {
        // MVR 200 off MVR 600 is a third off. On a MVR 100 ticket that is
        // MVR 33.33 — not the whole ticket.
        $order = $this->ring(6, ['discount_amount' => 200.00]);
        $this->assertSame(20000, (int) $order->manual_discount_laar);
        $this->assertSame(60000, (int) $order->manual_discount_subtotal_laar);

        $shrunk = $this->shrinkToOne($order);

        $this->assertSame(3333, (int) $shrunk->manual_discount_laar);
        $this->assertGreaterThan(0, (int) $shrunk->total_laar);
    }

    public function test_a_manual_discount_the_ticket_still_covers_is_left_alone(): void
    {
        $order = $this->ring(6, ['discount_amount' => 30.00]);

        // Two burgers left — MVR 200, still far above the MVR 30.
        $order->items()->limit(1)->update(['quantity' => 2, 'total_price' => 200.00]);
        $order->items()->orderBy('id')->skip(1)->take(50)->get()->each->delete();
        $shrunk = app(OrderTotalsCalculator::class)->recalculateAndPersist(Order::findOrFail($order->id));

        $this->assertSame(3000, (int) $shrunk->manual_discount_laar);
    }

    public function test_a_manual_discount_is_held_to_the_configured_cap(): void
    {
        // Cap the till at 20%. A third off no longer stands, whatever it was
        // approved at on a bigger ticket.
        SiteSetting::set('discount_max_percent', '20');

        $order = $this->ring(6, ['discount_amount' => 120.00]);
        $shrunk = $this->shrinkToOne($order);

        $this->assertLessThanOrEqual(2000, (int) $shrunk->manual_discount_laar);
    }

    public function test_a_discount_never_grows_when_the_cart_grows(): void
    {
        // The cashier gave MVR 50. Adding items does not turn that into more.
        $order = $this->ring(2, ['discount_amount' => 50.00]);
        $this->assertSame(5000, (int) $order->manual_discount_laar);

        $order->items()->limit(1)->update(['quantity' => 8, 'total_price' => 800.00]);
        $grown = app(OrderTotalsCalculator::class)->recalculateAndPersist(Order::findOrFail($order->id));

        $this->assertSame(5000, (int) $grown->manual_discount_laar);
    }

    // ── Settled orders are history ──────────────────────────────────────────

    public function test_a_settled_order_is_left_to_history(): void
    {
        // Re-pricing a paid ticket would rewrite what somebody already handed
        // over. The promo stays attached even though the shrunken cart would
        // no longer earn it.
        Promotion::create([
            'name' => 'Big spend', 'code' => 'BIG200',
            'type' => 'fixed', 'discount_value' => 20000,
            'min_order_laar' => 50000,
            'is_active' => true, 'stackable' => false,
        ]);

        $order = $this->ring(6);
        $this->postJson("/api/orders/{$order->id}/apply-promo", ['code' => 'BIG200'])->assertOk();
        $order->refresh()->update(['payment_status' => 'paid', 'status' => 'paid']);

        $order->items()->limit(1)->update(['quantity' => 1, 'total_price' => 100.00]);
        $order->items()->orderBy('id')->skip(1)->take(50)->get()->each->delete();
        app(OrderTotalsCalculator::class)->recalculateAndPersist(Order::findOrFail($order->id));

        $this->assertSame(
            'draft',
            OrderPromotion::where('order_id', $order->id)->latest('id')->first()?->status,
        );
    }
}

<?php

declare(strict_types=1);

namespace Tests\Feature\Delivery;

use App\Domains\Delivery\Services\DeliveryEtaStamper;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Category;
use App\Models\Customer;
use App\Models\Item;
use App\Models\MenuGroup;
use App\Models\Order;
use App\Models\SiteSetting;
use App\Services\OrderStatusTransitionService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Ops audit, 2026-09-25: every delivery order carries an ETA taken from the
 * promised delivery time, so the tracking page and the delay alert have
 * something to hold the kitchen to.
 */
class DeliveryEtaStampTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_the_promised_minutes_come_from_the_delivery_time_setting(): void
    {
        $stamper = app(DeliveryEtaStamper::class);
        SiteSetting::set('delivery_time', '30-45 min');
        SiteSetting::bust();
        $this->assertSame(45, $stamper->promisedMinutes());
        SiteSetting::set('delivery_time', '20 minutes');
        SiteSetting::bust();
        $this->assertSame(20, $stamper->promisedMinutes());
        SiteSetting::set('delivery_time', 'as fast as we can');
        SiteSetting::bust();
        $this->assertSame(DeliveryEtaStamper::DEFAULT_MINUTES, $stamper->promisedMinutes());
    }

    public function test_a_delivery_order_gets_an_eta_at_creation_and_at_dispatch_if_it_still_has_none(): void
    {
        PermissionCatalogSync::sync();
        Carbon::setTestNow('2026-09-25 12:00:00');
        SiteSetting::set('delivery_time', '30-45 min');
        SiteSetting::bust();

        MenuGroup::firstOrCreate(['slug' => 'default'], ['name' => 'Default', 'is_active' => true]);
        $category = Category::create(['name' => 'Food', 'slug' => 'food-eta', 'is_active' => true]);
        $item = Item::create(['name' => 'Burger', 'category_id' => $category->id, 'base_price' => 50.00, 'cost' => 10.00, 'is_active' => true, 'is_available' => true, 'track_stock' => false]);
        $customer = Customer::create(['name' => 'Dan', 'phone' => '+9607890000', 'is_active' => true]);
        $token = $customer->createToken('test', ['customer'])->plainTextToken;

        $res = $this->postJson('/api/orders/delivery', [
            'items' => [['item_id' => $item->id, 'quantity' => 1]],
            'delivery_address_line1' => '123 Main Street', 'delivery_island' => 'Male',
            'delivery_contact_name' => 'Dan', 'delivery_contact_phone' => '+9607890001',
        ], ['Authorization' => "Bearer {$token}"])->assertCreated();
        $order = Order::findOrFail((int) $res->json('order.id'));
        $this->assertSame('2026-09-25 12:45:00', $order->delivery_eta_at?->toDateTimeString(), 'promised time from creation');

        // A customer who asked for a time keeps it.
        $asked = $this->postJson('/api/orders/delivery', [
            'items' => [['item_id' => $item->id, 'quantity' => 1]],
            'delivery_address_line1' => '123 Main Street', 'delivery_island' => 'Male',
            'delivery_contact_name' => 'Dan', 'delivery_contact_phone' => '+9607890001',
            'desired_eta' => '2026-09-25 19:30:00',
        ], ['Authorization' => "Bearer {$token}"])->assertCreated();
        $this->assertSame('2026-09-25 19:30:00', Order::findOrFail((int) $asked->json('order.id'))->delivery_eta_at?->toDateTimeString());

        // An order that somehow reached "ready" without one is stamped when it leaves.
        $late = Order::factory()->create(['type' => 'delivery', 'status' => 'ready', 'delivery_eta_at' => null]);
        Carbon::setTestNow('2026-09-25 13:00:00');
        app(OrderStatusTransitionService::class)->transition($late, 'out_for_delivery');
        $this->assertSame('2026-09-25 13:45:00', $late->fresh()->delivery_eta_at?->toDateTimeString());

        $takeaway = Order::factory()->create(['type' => 'takeaway', 'status' => 'pending', 'delivery_eta_at' => null]);
        $this->assertFalse(app(DeliveryEtaStamper::class)->stampIfMissing($takeaway));
        $this->assertNull($takeaway->fresh()->delivery_eta_at);
    }
}

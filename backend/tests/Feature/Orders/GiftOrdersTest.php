<?php

declare(strict_types=1);

namespace Tests\Feature\Orders;

use App\Domains\Orders\Support\GiftOrder;
use App\Models\Category;
use App\Models\Customer;
use App\Models\Item;
use App\Models\MenuGroup;
use App\Models\Order;
use App\Models\SiteSetting;
use App\Models\SmsLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Gift orders (iruali import plan, feature 10). */
class GiftOrdersTest extends TestCase
{
    use RefreshDatabase;

    private Customer $customer;

    private Item $item;

    protected function setUp(): void
    {
        parent::setUp();
        MenuGroup::firstOrCreate(['slug' => 'default'], ['name' => 'Default', 'is_active' => true]);
        $cat = Category::create(['name' => 'Cakes', 'slug' => 'cakes-gift', 'is_active' => true]);
        $this->item = Item::create(['category_id' => $cat->id, 'name' => 'Chocolate cake', 'base_price' => 45.0, 'sku' => 'GIFT-1', 'is_active' => true, 'is_available' => true]);
        $this->customer = Customer::create(['name' => 'Aisha', 'phone' => '+9607770011', 'is_active' => true]);
        foreach (['online_ordering_enabled' => '1', 'delivery_accepting_orders' => '1', 'delivery_max_active_orders' => '0'] as $k => $v) {
            SiteSetting::updateOrCreate(['key' => $k], ['value' => $v, 'type' => 'text', 'group' => 'Test', 'label' => $k, 'is_public' => true]);
            Cache::forget("site_setting.{$k}");
        }
        Sanctum::actingAs($this->customer, ['customer']);
    }

    public function test_a_gift_delivery_goes_to_the_receiver_and_the_slip_has_no_prices(): void
    {
        $id = $this->postJson('/api/orders/delivery', [
            'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
            'delivery_address_line1' => 'Majeedhee Magu',
            'delivery_island' => 'Male',
            'delivery_contact_name' => 'Aisha',
            'delivery_contact_phone' => '7770011',
            'is_gift' => true,
            'gift_to_name' => 'Mariyam',
            'gift_to_phone' => '7779988',
            'gift_message' => 'Happy birthday!',
        ])->assertCreated()->json('order.id');

        $order = Order::query()->findOrFail($id);
        $this->assertTrue($order->is_gift);
        $this->assertSame('Mariyam', $order->delivery_contact_name);
        $this->assertSame('7779988', $order->delivery_contact_phone);

        $slip = GiftOrder::forSlip($order);
        $this->assertSame(['to' => 'Mariyam', 'message' => 'Happy birthday!'], $slip);
    }

    public function test_the_receiver_is_texted_once_when_on_the_way_only_when_switched_on(): void
    {
        $order = Order::factory()->create(['customer_id' => $this->customer->id, 'type' => 'delivery']);
        Order::query()->whereKey($order->id)->update(['is_gift' => true, 'gift_to_name' => 'Mariyam', 'gift_to_phone' => '7779988']);
        $order = Order::with('customer')->findOrFail($order->id);

        GiftOrder::tellReceiver($order);
        $this->assertSame(0, SmsLog::query()->where('type', GiftOrder::TYPE_ON_THE_WAY)->count(), 'off by default');

        SiteSetting::updateOrCreate(['key' => 'customer_gift_on_the_way_enabled'], ['value' => 'true', 'type' => 'text', 'group' => 'Test', 'label' => 'x', 'is_public' => false]);
        Cache::flush();
        GiftOrder::tellReceiver($order);
        GiftOrder::tellReceiver(Order::with('customer')->findOrFail($order->id));
        $sent = SmsLog::query()->where('type', GiftOrder::TYPE_ON_THE_WAY)->get();
        $this->assertCount(1, $sent);
        $this->assertStringContainsString('A gift from Aisha', (string) $sent->first()->message);
    }

    public function test_a_gift_needs_the_receiver_and_is_never_kept_on_eat_in(): void
    {
        $this->postJson('/api/customer/orders', [
            'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
            'type' => 'online_pickup',
            'is_gift' => true,
        ])->assertUnprocessable()->assertJsonValidationErrors(['gift_to_name', 'gift_to_phone']);

        $order = Order::factory()->create(['customer_id' => $this->customer->id, 'type' => 'dine_in']);
        GiftOrder::apply($order, ['is_gift' => true, 'gift_to_name' => 'X', 'gift_to_phone' => '7779988']);
        $this->assertFalse((bool) $order->fresh()->is_gift);
    }
}

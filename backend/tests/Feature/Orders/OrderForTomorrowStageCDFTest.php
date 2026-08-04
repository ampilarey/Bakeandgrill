<?php

declare(strict_types=1);

namespace Tests\Feature\Orders;

use App\Domains\Orders\DTOs\OrderPaidData;
use App\Domains\Orders\Events\OrderPaid;
use App\Models\Category;
use App\Models\Customer;
use App\Models\Item;
use App\Models\MenuGroup;
use App\Models\Order;
use App\Models\Role;
use App\Models\SiteSetting;
use App\Models\User;
use App\Services\OrderFulfilDateService;
use App\Services\StockReservationService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Group 2 — Stages C + D + F: KDS hold, stock deferral, closed-shop gate.
 * Both gate directions live in one file so they cannot drift.
 */
class OrderForTomorrowStageCDFTest extends TestCase
{
    use RefreshDatabase;

    private Item $tomorrowItem;

    private Item $stockItem;

    private Customer $customer;

    private User $staff;

    protected function setUp(): void
    {
        parent::setUp();

        MenuGroup::firstOrCreate(['slug' => 'default'], ['name' => 'Default', 'is_active' => true]);

        $category = Category::create([
            'name' => 'CDF Cat',
            'slug' => 'cdf-cat',
            'is_active' => true,
        ]);

        $this->tomorrowItem = Item::create([
            'category_id' => $category->id,
            'name' => 'Tomorrow Loaf',
            'base_price' => 20.0,
            'sku' => 'CDF-LOAF-001',
            'is_active' => true,
            'is_available' => true,
            'allow_pre_order' => true,
            'track_stock' => true,
            'availability_type' => 'stock_based',
            'stock_quantity' => 1,
        ]);

        $this->stockItem = $this->tomorrowItem;

        $this->customer = Customer::create([
            'name' => 'CDF Customer',
            'phone' => '+9607770100',
            'is_active' => true,
        ]);

        $staffRole = Role::firstOrCreate(
            ['slug' => 'staff'],
            ['name' => 'Staff', 'description' => '', 'is_active' => true],
        );
        $this->staff = User::create([
            'name' => 'CDF Staff',
            'email' => 'cdf-staff@test.com',
            'password' => Hash::make('password'),
            'role_id' => $staffRole->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);

        SiteSetting::updateOrCreate(['key' => 'online_ordering_enabled'], [
            'value' => '1',
            'type' => 'text',
            'group' => 'Online Ordering',
            'label' => 'online_ordering_enabled',
            'is_public' => true,
        ]);
        SiteSetting::updateOrCreate(['key' => OrderFulfilDateService::SETTING_KEY], [
            'value' => '20:00',
            'type' => 'text',
            'group' => 'Online Ordering',
            'label' => 'order_for_tomorrow_cutoff',
            'is_public' => true,
        ]);
        SiteSetting::updateOrCreate(['key' => 'online_ordering_schedule'], [
            'value' => null,
            'type' => 'text',
            'group' => 'Online Ordering',
            'label' => 'online_ordering_schedule',
            'is_public' => true,
        ]);
        SiteSetting::updateOrCreate(['key' => 'online_ordering_override_until'], [
            'value' => null,
            'type' => 'text',
            'group' => 'Online Ordering',
            'label' => 'online_ordering_override_until',
            'is_public' => true,
        ]);
        Cache::forget('site_setting.online_ordering_enabled');
        Cache::forget('site_setting.online_ordering_schedule');
        Cache::forget('site_setting.online_ordering_override_until');

        Carbon::setTestNow(Carbon::parse('2026-08-04 15:00:00', config('app.timezone')));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function closeShop(): void
    {
        SiteSetting::updateOrCreate(['key' => 'online_ordering_enabled'], [
            'value' => '0',
            'type' => 'text',
            'group' => 'Online Ordering',
            'label' => 'online_ordering_enabled',
            'is_public' => true,
        ]);
        SiteSetting::updateOrCreate(['key' => 'online_ordering_closed_message'], [
            'value' => 'Closed for CDF test.',
            'type' => 'text',
            'group' => 'Online Ordering',
            'label' => 'online_ordering_closed_message',
            'is_public' => true,
        ]);
        Cache::forget('site_setting.online_ordering_enabled');
        Cache::forget('site_setting.online_ordering_closed_message');
    }

    public function test_tomorrow_order_allowed_while_closed_same_day_still_422(): void
    {
        $this->closeShop();
        Sanctum::actingAs($this->customer, ['customer']);

        $tomorrow = $this->postJson('/api/customer/orders', [
            'collect_on' => 'tomorrow',
            'items' => [['item_id' => $this->tomorrowItem->id, 'quantity' => 1]],
        ]);
        $tomorrow->assertCreated();
        $this->assertNotNull($tomorrow->json('order.fulfil_date'));

        $sameDay = $this->postJson('/api/customer/orders', [
            'items' => [['item_id' => $this->tomorrowItem->id, 'quantity' => 1]],
        ]);
        $sameDay->assertStatus(422);
        $this->assertStringContainsString('Closed', (string) $sameDay->json('message'));
    }

    public function test_last_unit_ordered_for_tomorrow_still_buyable_today(): void
    {
        Sanctum::actingAs($this->customer, ['customer']);

        $tomorrow = $this->postJson('/api/customer/orders', [
            'collect_on' => 'tomorrow',
            'items' => [['item_id' => $this->stockItem->id, 'quantity' => 1]],
        ]);
        $tomorrow->assertCreated();

        $order = Order::findOrFail($tomorrow->json('order.id'));
        $this->assertSame(0, (int) \DB::table('stock_reservations')->where('order_id', $order->id)->count());

        // Payment must not eat today's stock either.
        $order->update(['status' => 'pending', 'payment_status' => 'paid', 'paid_at' => now()]);
        OrderPaid::dispatch(OrderPaidData::fromOrder($order->fresh(), true));

        $this->stockItem->refresh();
        $this->assertSame(1, (int) $this->stockItem->stock_quantity);

        $available = app(StockReservationService::class)->getAvailableStock($this->stockItem->fresh());
        $this->assertSame(1, $available);

        $today = $this->postJson('/api/customer/orders', [
            'items' => [['item_id' => $this->stockItem->id, 'quantity' => 1]],
        ]);
        $today->assertCreated();
    }

    public function test_tomorrow_order_hidden_from_kds_until_fired(): void
    {
        Sanctum::actingAs($this->customer, ['customer']);
        $create = $this->postJson('/api/customer/orders', [
            'collect_on' => 'tomorrow',
            'items' => [['item_id' => $this->tomorrowItem->id, 'quantity' => 1]],
        ]);
        $create->assertCreated();
        $orderId = (int) $create->json('order.id');

        Order::where('id', $orderId)->update([
            'status' => 'pending',
            'payment_status' => 'paid',
            'paid_at' => now(),
        ]);

        Sanctum::actingAs($this->staff, ['staff']);
        $kds = $this->getJson('/api/kds/orders');
        $kds->assertOk();
        $ids = collect($kds->json('orders'))->pluck('id')->all();
        $this->assertNotContains($orderId, $ids);

        $fire = $this->postJson("/api/orders/{$orderId}/fire-to-kitchen");
        $fire->assertOk();
        $this->assertNotNull($fire->json('order.fired_at'));

        $kdsAfter = $this->getJson('/api/kds/orders');
        $kdsAfter->assertOk();
        $idsAfter = collect($kdsAfter->json('orders'))->pluck('id')->all();
        $this->assertContains($orderId, $idsAfter);

        $this->stockItem->refresh();
        $this->assertSame(0, (int) $this->stockItem->stock_quantity);
    }
}

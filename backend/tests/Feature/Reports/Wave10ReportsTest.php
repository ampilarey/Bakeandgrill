<?php

declare(strict_types=1);

namespace Tests\Feature\Reports;

use App\Models\Customer;
use App\Models\Item;
use App\Models\MenuGroup;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\SiteSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class Wave10ReportsTest extends TestCase
{
    use RefreshDatabase;

    public function test_delivery_fee_preview_matches_calculator(): void
    {
        SiteSetting::updateOrCreate(['key' => 'delivery_default_fee'], ['value' => '25', 'type' => 'text', 'group' => 'Delivery', 'is_public' => true]);
        SiteSetting::updateOrCreate(['key' => 'delivery_free_threshold'], ['value' => '200', 'type' => 'text', 'group' => 'Delivery', 'is_public' => true]);
        SiteSetting::updateOrCreate(['key' => 'delivery_zone_fees'], ['value' => json_encode(['Male' => 25], JSON_THROW_ON_ERROR), 'type' => 'json', 'group' => 'Delivery', 'is_public' => true]);
        SiteSetting::bust();

        $this->getJson('/api/ordering/delivery-fee-preview?island=Male&subtotal_laar=5000')
            ->assertOk()
            ->assertJsonPath('fee_laar', 2500)
            ->assertJsonPath('fee_mvr', 25);

        $this->getJson('/api/ordering/delivery-fee-preview?island=Male&subtotal_laar=25000')
            ->assertOk()
            ->assertJsonPath('fee_laar', 0)
            ->assertJsonPath('qualifies_free', true);
    }

    public function test_customer_ltv_respects_date_range(): void
    {
        $owner = $this->makeOwner();
        $this->actingAs($owner);

        $customer = Customer::factory()->create(['name' => 'LTV Tester']);
        Order::factory()->create([
            'customer_id' => $customer->id,
            'status' => 'completed',
            'total' => 50.00,
            'total_laar' => 5000,
            'created_at' => now()->subDays(10),
        ]);
        Order::factory()->create([
            'customer_id' => $customer->id,
            'status' => 'completed',
            'total' => 999.00,
            'total_laar' => 99900,
            'created_at' => now()->subDays(60),
        ]);

        $from = now()->subDays(14)->toDateString();
        $to = now()->toDateString();

        $this->getJson("/api/reports/customer-ltv?from={$from}&to={$to}")
            ->assertOk()
            ->assertJsonPath('from', $from)
            ->assertJsonPath('rows.0.total_spent', 50);
    }

    public function test_hourly_sales_report(): void
    {
        $owner = $this->makeOwner();
        $this->actingAs($owner);

        Order::factory()->create([
            'status' => 'completed',
            'total' => 40.00,
            'created_at' => now()->setHour(12)->setMinute(0),
        ]);

        $from = now()->toDateString();
        $to = now()->toDateString();

        $this->getJson("/api/reports/hourly-sales?from={$from}&to={$to}")
            ->assertOk()
            ->assertJsonStructure(['from', 'to', 'hours'])
            ->assertJsonPath('hours.12.count', 1);
    }

    public function test_station_performance_report(): void
    {
        $owner = $this->makeOwner();
        $this->actingAs($owner);

        $group = MenuGroup::firstOrCreate(['slug' => 'grill'], ['name' => 'Grill', 'is_active' => true]);
        $item = Item::factory()->create(['menu_group_id' => $group->id, 'is_available' => true]);
        $order = Order::factory()->create([
            'status' => 'completed',
            'total' => 30.00,
            'created_at' => now(),
        ]);
        OrderItem::create([
            'order_id' => $order->id,
            'item_id' => $item->id,
            'item_name' => $item->name,
            'quantity' => 2,
            'unit_price' => 15.00,
            'total_price' => 30.00,
        ]);

        $from = now()->toDateString();
        $to = now()->toDateString();

        $this->getJson("/api/reports/station-performance?from={$from}&to={$to}")
            ->assertOk()
            ->assertJsonPath('rows.0.station', 'Grill')
            ->assertJsonPath('rows.0.qty', 2);
    }
}

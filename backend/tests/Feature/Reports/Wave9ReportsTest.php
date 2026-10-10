<?php

declare(strict_types=1);

namespace Tests\Feature\Reports;

use App\Models\AuditLog;
use App\Models\InventoryItem;
use App\Models\Item;
use App\Models\Order;
use App\Models\SiteSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class Wave9ReportsTest extends TestCase
{
    use RefreshDatabase;

    public function test_cashier_performance_report(): void
    {
        $owner = $this->makeOwner();
        $this->actingAs($owner);

        Order::factory()->create([
            'user_id' => $owner->id,
            'status' => 'completed',
            'total' => 120.00,
        ]);

        AuditLog::create([
            'user_id' => $owner->id,
            'action' => 'order.cancelled',
            'model_type' => 'Order',
            'model_id' => 99,
        ]);

        $this->getJson('/api/reports/cashier-performance?from=' . now()->toDateString() . '&to=' . now()->toDateString())
            ->assertOk()
            ->assertJsonPath('rows.0.orders_count', 1)
            ->assertJsonPath('rows.0.voids_count', 1);
    }

    public function test_product_margins_report(): void
    {
        $owner = $this->makeOwner();
        $this->actingAs($owner);

        Item::factory()->create([
            'name' => 'Margin Test Burger',
            'base_price' => 100,
            'cost' => 40,
            'is_available' => true,
        ]);

        $this->getJson('/api/reports/product-margins')
            ->assertOk()
            ->assertJsonStructure(['rows']);
    }

    public function test_stock_discrepancy_report(): void
    {
        $owner = $this->makeOwner();
        $this->actingAs($owner);

        InventoryItem::create([
            'name' => 'Bad Flour',
            'sku' => 'FLOUR-NEG',
            'unit' => 'kg',
            'current_stock' => -2,
            'is_active' => true,
        ]);

        $this->getJson('/api/reports/stock-discrepancy')
            ->assertOk()
            ->assertJsonPath('rows.0.type', 'inventory_negative');
    }

    public function test_voids_by_reason_report(): void
    {
        $owner = $this->makeOwner();
        $this->actingAs($owner);

        Order::factory()->create([
            'status' => 'cancelled',
            'cancellation_reason' => 'Customer changed mind',
            'cancelled_at' => now(),
        ]);
        Order::factory()->create([
            'status' => 'cancelled',
            'cancellation_reason' => null,
            'cancelled_at' => now(),
        ]);

        $this->getJson('/api/reports/voids-by-reason?from=' . now()->toDateString() . '&to=' . now()->toDateString())
            ->assertOk()
            ->assertJsonFragment(['reason' => 'Customer changed mind', 'voids_count' => 1])
            ->assertJsonFragment(['reason' => 'Unspecified', 'voids_count' => 1]);
    }

    public function test_ops_alerts_settings(): void
    {
        $owner = $this->makeOwner();
        $this->actingAs($owner);

        $this->patchJson('/api/admin/ops/alerts', [
            'shift_open_alert_hours' => 10,
            'unstarted_order_alert_minutes' => 15,
        ])
            ->assertOk()
            ->assertJsonPath('settings.shift_open_alert_hours', 10)
            ->assertJsonPath('settings.unstarted_order_alert_minutes', 15)
            // The delivery-delay and stock switches are rows in Admin → Notifications now.
            ->assertJsonMissingPath('settings.delivery_delay_alert_sms')
            ->assertJsonMissingPath('settings.inventory_reorder_alert_sms');

        $this->assertSame('10', SiteSetting::get('ops_shift_open_alert_hours'));
        // Off is the row's switch, so 0 no longer means off and is refused.
        $this->patchJson('/api/admin/ops/alerts', ['shift_open_alert_hours' => 0])->assertStatus(422);
    }
}

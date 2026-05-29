<?php

declare(strict_types=1);

namespace Tests\Feature\Reports;

use App\Models\AuditLog;
use App\Models\DeliveryDriver;
use App\Models\Order;
use App\Models\Shift;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class Wave8ReportsTest extends TestCase
{
    use RefreshDatabase;

    public function test_manager_overrides_report(): void
    {
        $owner = $this->makeOwner();
        $this->actingAs($owner);

        AuditLog::create([
            'user_id' => $owner->id,
            'action' => 'order.cancelled',
            'model_type' => 'Order',
            'model_id' => 1,
        ]);

        $this->getJson('/api/reports/manager-overrides?from=' . now()->toDateString() . '&to=' . now()->toDateString())
            ->assertOk()
            ->assertJsonPath('rows.0.action', 'order.cancelled');
    }

    public function test_driver_settlement_report(): void
    {
        $owner = $this->makeOwner();
        $this->actingAs($owner);

        $driver = DeliveryDriver::create(['name' => 'Ahmed', 'phone' => '7912345', 'is_active' => true]);
        Order::factory()->create([
            'type' => 'delivery',
            'status' => 'completed',
            'delivery_driver_id' => $driver->id,
            'total' => 150.00,
            'delivery_fee' => 30.00,
        ]);

        $this->getJson('/api/reports/driver-settlement?from=' . now()->toDateString() . '&to=' . now()->toDateString())
            ->assertOk()
            ->assertJsonPath('rows.0.driver_name', 'Ahmed')
            ->assertJsonPath('rows.0.orders_count', 1);
    }

    public function test_shift_variances_report(): void
    {
        $owner = $this->makeOwner();
        $this->actingAs($owner);

        Shift::create([
            'user_id' => $owner->id,
            'opened_at' => now()->subHours(8),
            'closed_at' => now()->subHour(),
            'opening_cash' => 100,
            'closing_cash' => 95,
            'expected_cash' => 100,
            'variance' => -5,
        ]);

        $this->getJson('/api/reports/shift-variances?from=' . now()->toDateString() . '&to=' . now()->toDateString())
            ->assertOk()
            ->assertJsonPath('rows.0.variance', -5);
    }

    public function test_stock_velocity_report(): void
    {
        $owner = $this->makeOwner();
        $this->actingAs($owner);

        $this->getJson('/api/reports/stock-velocity?from=' . now()->subDays(7)->toDateString() . '&to=' . now()->toDateString())
            ->assertOk()
            ->assertJsonStructure(['from', 'to', 'rows']);
    }
}

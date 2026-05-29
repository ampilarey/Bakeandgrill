<?php

declare(strict_types=1);

namespace Tests\Feature\Finance;

use App\Models\Order;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DeliveryZonesReportTest extends TestCase
{
    use RefreshDatabase;

    public function test_delivery_zones_report_requires_auth(): void
    {
        $this->getJson('/api/reports/delivery-zones')->assertStatus(401);
    }

    public function test_delivery_zones_report_groups_completed_delivery_orders(): void
    {
        $owner = $this->makeOwner();
        $today = now()->toDateString();

        Order::factory()->create([
            'type' => 'delivery',
            'status' => 'completed',
            'delivery_island' => 'Male',
            'delivery_fee' => 20,
            'total' => 120,
            'created_at' => now(),
        ]);
        Order::factory()->create([
            'type' => 'delivery',
            'status' => 'completed',
            'delivery_island' => 'Male',
            'delivery_fee' => 20,
            'total' => 80,
            'created_at' => now(),
        ]);
        Order::factory()->create([
            'type' => 'delivery',
            'status' => 'completed',
            'delivery_island' => 'Hulhumale',
            'delivery_fee' => 30,
            'total' => 150,
            'created_at' => now(),
        ]);
        Order::factory()->create([
            'type' => 'takeaway',
            'status' => 'completed',
            'total' => 50,
            'created_at' => now(),
        ]);

        $response = $this->getJson(
            "/api/reports/delivery-zones?from={$today}&to={$today}",
            $this->staffHeaders($owner),
        );

        $response->assertOk()
            ->assertJsonPath('totals.orders_count', 3)
            ->assertJsonPath('totals.fees_total', 70)
            ->assertJsonCount(2, 'zones');

        $male = collect($response->json('zones'))->firstWhere('zone', 'Male');
        $this->assertSame(2, $male['orders_count']);
        $this->assertEquals(40, $male['fees_total']);
        $this->assertEquals(20, $male['avg_fee']);
    }
}

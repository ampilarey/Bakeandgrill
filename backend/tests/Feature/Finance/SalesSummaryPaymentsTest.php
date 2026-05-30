<?php

declare(strict_types=1);

namespace Tests\Feature\Finance;

use App\Models\Order;
use App\Models\Payment;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class SalesSummaryPaymentsTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();

        $role = Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'slug' => 'owner', 'is_active' => true]);
        $this->owner = User::create([
            'name' => 'Owner',
            'email' => 'owner@sales-summary.test',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
    }

    public function test_sales_summary_payments_exclude_non_completed_orders(): void
    {
        $today = now()->toDateString();

        $completed = Order::create([
            'order_number' => 'SUM-COMPLETE',
            'type' => 'takeaway',
            'status' => 'completed',
            'subtotal' => 10.0,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 10.0,
            'total_laar' => 1000,
            'created_at' => now(),
        ]);
        Payment::create([
            'order_id' => $completed->id,
            'method' => 'cash',
            'amount' => 10.0,
            'amount_laar' => 1000,
            'status' => 'paid',
            'processed_at' => now(),
        ]);

        $pending = Order::create([
            'order_number' => 'SUM-PENDING',
            'type' => 'takeaway',
            'status' => 'pending',
            'subtotal' => 50.0,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 50.0,
            'total_laar' => 5000,
            'created_at' => now(),
        ]);
        Payment::create([
            'order_id' => $pending->id,
            'method' => 'cash',
            'amount' => 50.0,
            'amount_laar' => 5000,
            'status' => 'paid',
            'processed_at' => now(),
        ]);

        $response = $this->getJson(
            "/api/reports/sales-summary?from={$today}&to={$today}",
            $this->staffHeaders($this->owner),
        );

        $response->assertOk()
            ->assertJsonPath('totals.orders_count', 1);

        $this->assertEquals(10.0, (float) $response->json('totals.total'));
        $this->assertEquals(10.0, (float) $response->json('payments.cash'));

        $this->assertArrayNotHasKey('card', $response->json('payments') ?? []);
    }
}

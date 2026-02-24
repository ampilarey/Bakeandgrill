<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domains\Loyalty\Services\LoyaltyLedgerService;
use App\Domains\Loyalty\Services\PointsCalculator;
use App\Models\Customer;
use App\Models\LoyaltyAccount;
use App\Models\Order;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LoyaltyTest extends TestCase
{
    use RefreshDatabase;

    private LoyaltyLedgerService $service;
    private Customer $customer;
    private Order $order;

    protected function setUp(): void
    {
        parent::setUp();

        $this->service = app(LoyaltyLedgerService::class);

        $this->customer = Customer::create([
            'name' => 'Loyalty Tester',
            'phone' => '+9607999888',
            'loyalty_points' => 0,
            'tier' => 'bronze',
            'is_active' => true,
        ]);

        $this->order = Order::create([
            'order_number' => 'BG-TEST-0001',
            'type' => 'takeaway',
            'status' => 'pending',
            'subtotal' => 100.00,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 100.00,
            'customer_id' => $this->customer->id,
        ]);
    }

    public function test_account_created_on_first_access(): void
    {
        $account = $this->service->accountFor($this->customer);
        $this->assertNotNull($account);
        $this->assertEquals(0, $account->points_balance);
    }

    public function test_earn_points_for_order(): void
    {
        $this->service->earnPointsForOrder($this->customer, $this->order);

        $account = LoyaltyAccount::where('customer_id', $this->customer->id)->first();
        $this->assertGreaterThan(0, $account->points_balance);
    }

    public function test_earn_points_is_idempotent(): void
    {
        $this->service->earnPointsForOrder($this->customer, $this->order);
        $this->service->earnPointsForOrder($this->customer, $this->order);

        $account = LoyaltyAccount::where('customer_id', $this->customer->id)->first();
        // Should only have earned once
        $expectedPoints = (new PointsCalculator)->pointsForOrder($this->order);
        $this->assertEquals($expectedPoints, $account->points_balance);
    }

    private function earnEnoughPoints(int $minPoints = 200): void
    {
        // Earn points by creating a large enough order total
        // Default earn rate: 1 point per MVR, so MVR 200 = 200 points
        $bigOrder = Order::create([
            'order_number' => 'BG-BIG-0001',
            'type' => 'takeaway',
            'status' => 'completed',
            'subtotal' => $minPoints,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => $minPoints,
            'customer_id' => $this->customer->id,
        ]);
        $this->service->earnPointsForOrder($this->customer, $bigOrder);
    }

    public function test_create_hold_reserves_points(): void
    {
        $this->earnEnoughPoints(500);
        $account = LoyaltyAccount::where('customer_id', $this->customer->id)->first();

        $initialBalance = $account->points_balance;
        $pointsToRedeem = 100;

        $hold = $this->service->createOrRefreshHold($this->customer, $this->order, $pointsToRedeem);

        $account->refresh();
        $this->assertEquals($pointsToRedeem, $account->points_held);
        $this->assertEquals($initialBalance - $pointsToRedeem, $account->availablePoints());
        $this->assertEquals('active', $hold->status);
    }

    public function test_consume_hold_deducts_points(): void
    {
        $this->earnEnoughPoints(500);
        $account = LoyaltyAccount::where('customer_id', $this->customer->id)->first();

        $pointsToRedeem = 100;
        $hold = $this->service->createOrRefreshHold($this->customer, $this->order, $pointsToRedeem);

        $balanceBefore = $account->points_balance;
        $this->service->consumeHold($hold);

        $account->refresh();
        $this->assertEquals($balanceBefore - $pointsToRedeem, $account->points_balance);
        $this->assertEquals(0, $account->points_held);
        $this->assertEquals('consumed', $hold->fresh()->status);
    }

    public function test_release_hold_restores_available_points(): void
    {
        $this->earnEnoughPoints(500);

        $hold = $this->service->createOrRefreshHold($this->customer, $this->order, 100);
        $this->service->releaseHold($hold);

        $account = LoyaltyAccount::where('customer_id', $this->customer->id)->first();
        $this->assertEquals(0, $account->points_held);
        $this->assertEquals('released', $hold->fresh()->status);
    }

    public function test_consume_hold_is_idempotent(): void
    {
        $this->earnEnoughPoints(500);
        $hold = $this->service->createOrRefreshHold($this->customer, $this->order, 100);

        $this->service->consumeHold($hold);
        $balanceAfterFirst = LoyaltyAccount::where('customer_id', $this->customer->id)->first()->points_balance;

        $this->service->consumeHold($hold->fresh());
        $this->assertEquals($balanceAfterFirst, LoyaltyAccount::where('customer_id', $this->customer->id)->first()->points_balance);
    }

    public function test_refresh_hold_replaces_old_hold(): void
    {
        $this->earnEnoughPoints(500);
        $account = LoyaltyAccount::where('customer_id', $this->customer->id)->first();

        $this->service->createOrRefreshHold($this->customer, $this->order, 200);

        // Refresh with 100 points instead
        $newHold = $this->service->createOrRefreshHold($this->customer, $this->order, 100);

        $account->refresh();
        $this->assertEquals(100, $account->points_held);
        $this->assertEquals('active', $newHold->status);
    }

    public function test_hold_below_minimum_throws(): void
    {
        $this->earnEnoughPoints(500);

        $this->expectException(\InvalidArgumentException::class);
        $this->service->createOrRefreshHold($this->customer, $this->order, 1);
    }
}

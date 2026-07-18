<?php

declare(strict_types=1);

namespace Tests\Feature\Loyalty;

use App\Domains\Loyalty\Services\LoyaltyLedgerService;
use App\Models\LoyaltyAccount;
use App\Models\LoyaltyHold;
use App\Models\Order;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class CancelStaleOrdersLoyaltyHoldTest extends TestCase
{
    use RefreshDatabase;

    public function test_cancel_stale_releases_loyalty_points_held(): void
    {
        $customer = $this->makeCustomer();
        $order = Order::factory()->pending()->forCustomer($customer)->create([
            'status' => 'payment_pending',
            'type' => 'online_pickup',
            'subtotal' => 100.0,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 100.0,
            'total_laar' => 10000,
        ]);

        DB::table('orders')->where('id', $order->id)->update([
            'created_at' => now()->subMinutes(45),
            'updated_at' => now()->subMinutes(45),
        ]);

        $account = LoyaltyAccount::query()->firstOrCreate(
            ['customer_id' => $customer->id],
            ['points_balance' => 0, 'points_held' => 0, 'lifetime_points' => 0, 'tier' => 'bronze'],
        );
        $account->update(['points_balance' => 200, 'points_held' => 0]);

        $service = app(LoyaltyLedgerService::class);
        $service->createOrRefreshHold($customer, $order->fresh(), 100);

        $account->refresh();
        $this->assertSame(100, (int) $account->points_held);
        $this->assertDatabaseHas('loyalty_holds', [
            'order_id' => $order->id,
            'status' => 'active',
            'points_held' => 100,
        ]);

        $this->artisan('orders:cancel-stale')->assertSuccessful();

        $order->refresh();
        $this->assertSame('cancelled', $order->status);

        $account->refresh();
        $this->assertSame(0, (int) $account->points_held, 'points_held must be cleared when stale order is cancelled');

        $hold = LoyaltyHold::query()->where('order_id', $order->id)->first();
        $this->assertNotNull($hold);
        $this->assertSame('released', $hold->status);
    }
}

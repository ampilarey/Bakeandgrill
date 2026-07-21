<?php

declare(strict_types=1);

namespace Tests\Feature\Finance;

use App\Domains\Reporting\Services\ReportsService;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Role;
use App\Models\Shift;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * FIX 10 — X-report money must derive from payments.shift_id, not orders.user_id.
 *
 * Scenario: cashier A opens shift, rings an order. Cashier B opens their own
 * shift and settles A's ticket. The payment must appear in B's X-report
 * (they took the cash), not A's.
 */
class XReportShiftAttributionTest extends TestCase
{
    use RefreshDatabase;

    private function makeCashier(string $email): User
    {
        $role = Role::firstOrCreate(['slug' => 'cashier'], [
            'name' => 'Cashier',
            'slug' => 'cashier',
            'is_active' => true,
        ]);

        return User::create([
            'name' => $email,
            'email' => $email,
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
    }

    public function test_x_report_attributes_money_to_the_shift_that_collected_it(): void
    {
        $cashierA = $this->makeCashier('a@shift.test');
        $cashierB = $this->makeCashier('b@shift.test');

        $shiftA = Shift::create([
            'user_id' => $cashierA->id,
            'opened_at' => now()->subHours(2),
            'opening_cash' => 0,
        ]);
        $shiftB = Shift::create([
            'user_id' => $cashierB->id,
            'opened_at' => now()->subHour(),
            'opening_cash' => 0,
        ]);

        // Order rung by cashier A (attribution = user_id A) but paid by cashier B.
        $order = Order::create([
            'order_number' => 'SHIFT-ATTR-1',
            'user_id' => $cashierA->id,
            'shift_id' => $shiftA->id,
            'type' => 'takeaway',
            'status' => 'paid',
            'payment_status' => 'paid',
            'subtotal' => 50.0,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 50.0,
            'total_laar' => 5000,
            'created_at' => now()->subMinutes(30),
        ]);

        Payment::create([
            'order_id' => $order->id,
            'method' => 'cash',
            'amount' => 50.0,
            'amount_laar' => 5000,
            'status' => 'paid',
            'processed_at' => now()->subMinutes(10),
            'collected_by_user_id' => $cashierB->id,
            'shift_id' => $shiftB->id,
        ]);

        $reports = app(ReportsService::class);

        $xA = $reports->xReport($cashierA->id);
        $xB = $reports->xReport($cashierB->id);

        $this->assertNotNull($xA);
        $this->assertNotNull($xB);

        // A rang the sale → sale count = 1 for A (order attribution is unchanged).
        $this->assertSame(1, $xA['totals']['orders_count']);

        // Money attributes to whoever collected it (shift_id on payments).
        $this->assertEquals(0.0, $xA['payments']['cash'] ?? 0.0);
        $this->assertEquals(50.0, $xB['payments']['cash'] ?? 0.0);
    }

    public function test_x_report_excludes_online_no_shift_payments(): void
    {
        $cashier = $this->makeCashier('cash@shift.test');
        $shift = Shift::create([
            'user_id' => $cashier->id,
            'opened_at' => now()->subHours(2),
            'opening_cash' => 0,
        ]);

        $order = Order::create([
            'order_number' => 'ONLINE-NOSHIFT-1',
            'user_id' => $cashier->id,
            'shift_id' => $shift->id,
            'type' => 'online_pickup',
            'status' => 'paid',
            'payment_status' => 'paid',
            'subtotal' => 40.0,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 40.0,
            'total_laar' => 4000,
            'created_at' => now()->subMinutes(20),
        ]);

        // Gateway payment — shift_id NULL.
        Payment::create([
            'order_id' => $order->id,
            'method' => 'bml',
            'amount' => 40.0,
            'amount_laar' => 4000,
            'status' => 'paid',
            'processed_at' => now()->subMinutes(10),
            'shift_id' => null,
        ]);

        $x = app(ReportsService::class)->xReport($cashier->id);
        $this->assertNotNull($x);
        // Neither the bml amount nor a synthetic "online (no shift)" bucket
        // must contaminate the cashier's X-report money.
        $this->assertEquals(0.0, $x['payments']['bml'] ?? 0.0);
        $this->assertArrayNotHasKey('online (no shift)', (array) $x['payments']);
    }
}

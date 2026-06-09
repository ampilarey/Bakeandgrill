<?php

declare(strict_types=1);

namespace Tests\Feature\Credit;

use App\Domains\Credit\Listeners\ReverseCreditOnRefundListener;
use App\Domains\Orders\DTOs\OrderRefundedData;
use App\Domains\Orders\Events\OrderRefunded;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Customer;
use App\Models\CustomerCreditLedger;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Refund;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class CreditRefundActorTest extends TestCase
{
    use RefreshDatabase;

    public function test_credit_refund_reversal_falls_back_to_order_staff_when_refund_user_null(): void
    {
        PermissionCatalogSync::sync();
        $ownerRole = Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'is_active' => true]);
        $staffRole = Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'is_active' => true]);

        $owner = User::create([
            'name' => 'Owner',
            'email' => 'owner-credit-refund@test.local',
            'password' => Hash::make('password'),
            'role_id' => $ownerRole->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);

        $orderStaff = User::create([
            'name' => 'Order Staff',
            'email' => 'order-staff@test.local',
            'password' => Hash::make('password'),
            'role_id' => $staffRole->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);

        $customer = Customer::create(['name' => 'Credit Refund', 'phone' => '+9607222001']);
        $customer->update([
            'credit_enabled' => true,
            'credit_limit_laar' => 10000,
            'credit_balance_laar' => 5000,
            'credit_status' => 'active',
        ]);

        $order = Order::create([
            'order_number' => 'CR-REF-001',
            'type' => 'takeaway',
            'status' => 'paid',
            'customer_id' => $customer->id,
            'user_id' => $orderStaff->id,
            'subtotal' => 50,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 50,
            'total_laar' => 5000,
            'paid_at' => now(),
        ]);

        Payment::create([
            'order_id' => $order->id,
            'method' => 'house_account',
            'amount' => 50,
            'amount_laar' => 5000,
            'status' => 'paid',
            'processed_at' => now(),
        ]);

        $refund = Refund::create([
            'order_id' => $order->id,
            'amount' => 50,
            'reason' => 'Test refund',
            'status' => 'completed',
            'user_id' => null,
        ]);

        app(ReverseCreditOnRefundListener::class)->handle(new OrderRefunded(
            new OrderRefundedData(
                refundId: $refund->id,
                orderId: $order->id,
                orderNumber: (string) $order->order_number,
                amount: 50.0,
                reason: 'Test refund',
                refundRatio: 1.0,
            ),
        ));

        $this->assertDatabaseHas('customer_credit_ledger', [
            'refund_id' => $refund->id,
            'type' => 'refund_reversal',
            'recorded_by' => $orderStaff->id,
        ]);

        $this->assertSame(1, CustomerCreditLedger::where('refund_id', $refund->id)->count());
    }
}

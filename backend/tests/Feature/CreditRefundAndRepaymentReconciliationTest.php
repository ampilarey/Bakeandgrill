<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Category;
use App\Models\Customer;
use App\Models\Device;
use App\Models\Item;
use App\Models\Order;
use App\Models\Refund;
use App\Models\Role;
use App\Models\Shift;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * FIX 9f — regression tests for the credit/refund reconciliation gaps.
 *
 * (i) A refund against a house_account-paid order must NOT change the
 *     shift's expected-cash total, because no cash ever left the drawer
 *     — the customer's credit balance was reduced instead.
 *
 * (ii) A credit repayment must NEVER change salesSummary totals — it is
 *      settlement of an existing receivable, not new revenue.
 */
class CreditRefundAndRepaymentReconciliationTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;
    private User $staff;
    private User $manager;
    private Device $device;
    private Item $item;
    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();

        Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'is_active' => true]);
        Role::firstOrCreate(['slug' => 'manager'], ['name' => 'Manager', 'is_active' => true]);
        Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'is_active' => true]);
        PermissionCatalogSync::sync();

        $ownerRole = Role::where('slug', 'owner')->firstOrFail();
        $managerRole = Role::where('slug', 'manager')->firstOrFail();
        $staffRole = Role::where('slug', 'staff')->firstOrFail();

        $this->owner = User::create([
            'name' => 'Owner',
            'email' => 'owner@recon.test',
            'password' => Hash::make('password'),
            'role_id' => $ownerRole->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        $this->manager = User::create([
            'name' => 'Manager',
            'email' => 'manager@recon.test',
            'password' => Hash::make('password'),
            'role_id' => $managerRole->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        $this->staff = User::create([
            'name' => 'Staff',
            'email' => 'staff@recon.test',
            'password' => Hash::make('password'),
            'role_id' => $staffRole->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);

        $this->device = Device::create([
            'name' => 'Recon POS',
            'identifier' => 'RECON-POS',
            'type' => 'pos',
            'is_active' => true,
        ]);

        $category = Category::create(['name' => 'Recon Food', 'slug' => 'recon-food', 'is_active' => true]);
        $this->item = Item::create([
            'category_id' => $category->id,
            'name' => 'Recon Item',
            'base_price' => 100.0,
            'sku' => 'RECON-001',
            'is_active' => true,
            'is_available' => true,
        ]);

        $this->customer = Customer::create([
            'name' => 'Recon Customer',
            'phone' => '9607700099',
        ]);
    }

    /**
     * FIX 9f (i): refund of a fully-credit-paid order leaves expected cash
     * exactly where it was pre-refund.
     */
    public function test_refund_of_credit_paid_order_does_not_change_expected_cash(): void
    {
        $this->approveCustomer(500000); // MVR 5000

        Sanctum::actingAs($this->staff, ['staff']);
        $this->postJson('/api/shifts/open', ['opening_cash' => 100])->assertCreated();
        $shift = Shift::where('user_id', $this->staff->id)->whereNull('closed_at')->firstOrFail();

        $orderId = $this->createOrder($this->customer->id);
        $order = Order::findOrFail($orderId);
        $orderTotalMvr = ((int) ($order->total_laar ?? round((float) $order->total * 100))) / 100;

        $this->withHeader('X-Device-Identifier', $this->device->identifier)
            ->postJson("/api/orders/{$orderId}/payments", [
                'payments' => [['method' => 'house_account', 'amount' => $orderTotalMvr]],
                'print_receipt' => false,
            ])
            ->assertOk();

        // Capture expected cash BEFORE the refund.
        $before = $this->getJson("/api/shifts/{$shift->id}/summary")->assertOk()->json();
        $expectedBefore = $before['cash_drawer']['expected_cash'] ?? null;
        $this->assertNotNull($expectedBefore);

        // Owner processes the refund on the same shift.
        Sanctum::actingAs($this->owner, ['staff']);
        // Owner needs an open shift to process the refund (already-guaranteed by
        // ShiftAccessService::requireOpenShift). Open one for the owner.
        $this->postJson('/api/shifts/open', ['opening_cash' => 0])->assertCreated();

        $this->postJson("/api/orders/{$orderId}/refunds", [
            'amount' => $orderTotalMvr,
            'reason_category' => 'other', 'reason' => 'Order returned',
        ])->assertCreated();

        // Refund row must record zero drawer cash — money moved on the ledger,
        // not out of the till.
        $refund = Refund::where('order_id', $orderId)->firstOrFail();
        $this->assertSame(0, (int) $refund->drawer_cash_out_laar);

        // Original shift's expected cash is UNCHANGED — the refund did not
        // reduce the till because the refund reversed a credit balance.
        Sanctum::actingAs($this->staff, ['staff']);
        $after = $this->getJson("/api/shifts/{$shift->id}/summary")->assertOk()->json();
        $expectedAfter = $after['cash_drawer']['expected_cash'] ?? null;
        $this->assertSame(
            round((float) $expectedBefore, 2),
            round((float) $expectedAfter, 2),
            'Credit-paid refund must not change expected cash.',
        );
    }

    /**
     * FIX 9f (ii): recording a credit repayment must never change the
     * salesSummary totals.
     */
    public function test_credit_repayment_does_not_change_sales_summary_totals(): void
    {
        $this->approveCustomer(500000); // MVR 5000

        // Charge MVR 100 to credit on the staff shift.
        Sanctum::actingAs($this->staff, ['staff']);
        $this->postJson('/api/shifts/open', ['opening_cash' => 100])->assertCreated();
        $orderId = $this->createOrder($this->customer->id);
        $order = Order::findOrFail($orderId);
        $orderTotalMvr = ((int) ($order->total_laar ?? round((float) $order->total * 100))) / 100;

        $this->withHeader('X-Device-Identifier', $this->device->identifier)
            ->postJson("/api/orders/{$orderId}/payments", [
                'payments' => [['method' => 'house_account', 'amount' => $orderTotalMvr]],
                'print_receipt' => false,
            ])
            ->assertOk();

        // Snapshot the sales summary BEFORE the repayment.
        Sanctum::actingAs($this->owner, ['staff']);
        $this->owner->grantPermission('reports.view');
        Sanctum::actingAs($this->owner->fresh(), ['staff']);

        $from = now()->startOfDay()->toDateString();
        $to = now()->endOfDay()->toDateString();
        $before = $this->getJson("/api/reports/sales-summary?from={$from}&to={$to}")
            ->assertOk()->json();

        // Record a bank-transfer repayment for the full balance.
        $this->manager->grantPermission('customers.credit.repay');
        Sanctum::actingAs($this->manager->fresh(), ['staff']);
        $this->postJson("/api/admin/customers/{$this->customer->id}/credit/repayments", [
            'amount_mvr' => $orderTotalMvr,
            'method' => 'bank_transfer',
            'reference' => 'RECON-1',
        ])->assertCreated();

        // Snapshot AFTER: totals + payments block must be identical.
        Sanctum::actingAs($this->owner->fresh(), ['staff']);
        $after = $this->getJson("/api/reports/sales-summary?from={$from}&to={$to}")
            ->assertOk()->json();

        $this->assertSame(
            $before['totals'] ?? null,
            $after['totals'] ?? null,
            'Sales-summary totals must not shift when a credit repayment is recorded.',
        );
        $this->assertSame(
            $before['payments'] ?? null,
            $after['payments'] ?? null,
            'Sales-summary payment tender breakdown must not shift when a credit repayment is recorded.',
        );
    }

    private function approveCustomer(int $limitLaar): void
    {
        // Under credit_limit_max_mvr default of MVR 50000 (5,000,000 laari)
        // approve does NOT require an owner override / reason.
        Sanctum::actingAs($this->manager, ['staff']);
        $this->patchJson("/api/admin/customers/{$this->customer->id}/credit", [
            'action' => 'approve',
            'credit_limit_laar' => $limitLaar,
        ])->assertOk();
        $this->customer->refresh();
    }

    private function createOrder(?int $customerId): int
    {
        $payload = [
            'type' => 'takeaway',
            'device_identifier' => $this->device->identifier,
            'items' => [[
                'item_id' => $this->item->id,
                'name' => $this->item->name,
                'quantity' => 1,
            ]],
        ];
        if ($customerId !== null) {
            $payload['customer_id'] = $customerId;
        }

        $response = $this->withHeader('X-Device-Identifier', $this->device->identifier)
            ->postJson('/api/orders', $payload);
        $response->assertCreated();

        return (int) $response->json('order.id');
    }
}

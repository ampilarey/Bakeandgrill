<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domains\Finance\Services\RefundDrawerCashService;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Category;
use App\Models\Customer;
use App\Models\Device;
use App\Models\Item;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Refund;
use App\Models\Role;
use App\Models\Shift;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * FIX 1 — refund drawer cash acceptance criteria.
 */
class RefundDrawerCashTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;
    private User $staff;
    private Device $device;
    private Item $item;

    protected function setUp(): void
    {
        parent::setUp();

        Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'is_active' => true]);
        Role::firstOrCreate(['slug' => 'manager'], ['name' => 'Manager', 'is_active' => true]);
        Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'is_active' => true]);
        PermissionCatalogSync::sync();

        $ownerRole = Role::where('slug', 'owner')->firstOrFail();
        $staffRole = Role::where('slug', 'staff')->firstOrFail();
        $this->owner = User::create([
            'name' => 'Owner',
            'email' => 'owner@refund-drawer.test',
            'password' => Hash::make('password'),
            'role_id' => $ownerRole->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        $this->staff = User::create([
            'name' => 'Staff',
            'email' => 'staff@refund-drawer.test',
            'password' => Hash::make('password'),
            'role_id' => $staffRole->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);

        $this->device = Device::create([
            'name' => 'Refund Drawer POS',
            'identifier' => 'RD-POS',
            'type' => 'pos',
            'is_active' => true,
        ]);

        $category = Category::create(['name' => 'RD Food', 'slug' => 'rd-food', 'is_active' => true]);
        $this->item = Item::create([
            'category_id' => $category->id,
            'name' => 'RD Item',
            'base_price' => 100.0,
            'sku' => 'RD-001',
            'is_active' => true,
            'is_available' => true,
        ]);
    }

    /** ACCEPT 1: card-tender refund with default cash_refund_override=false. */
    public function test_card_paid_refund_defaults_to_zero_drawer_cash(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);
        $this->postJson('/api/shifts/open', ['opening_cash' => 0])->assertCreated();

        [$order, $shiftBeforeExpected] = $this->buildCardOrderAndOpenShiftSnapshot(10000);

        $this->postJson("/api/orders/{$order->id}/refunds", [
            'amount' => 100.00,
            'reason' => 'test card refund',
        ])->assertCreated()
            ->assertJsonPath('breakdown.drawer_cash_out_laar', 0)
            ->assertJsonPath('breakdown.external_tender_laar', 10000)
            ->assertJsonPath('breakdown.cash_refund_override', false);

        $refund = Refund::where('order_id', $order->id)->firstOrFail();
        $this->assertSame(0, (int) $refund->drawer_cash_out_laar);
    }

    /** ACCEPT 2: card-tender refund WITH cash_refund_override=true → full cash out. */
    public function test_card_paid_refund_with_override_takes_full_amount_from_drawer(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);
        $this->postJson('/api/shifts/open', ['opening_cash' => 0])->assertCreated();

        [$order, $_] = $this->buildCardOrderAndOpenShiftSnapshot(10000);

        $this->postJson("/api/orders/{$order->id}/refunds", [
            'amount' => 100.00,
            'reason' => 'cashier hands back cash',
            'cash_refund_override' => true,
        ])->assertCreated()
            ->assertJsonPath('breakdown.drawer_cash_out_laar', 10000)
            ->assertJsonPath('breakdown.cash_refund_override', true);

        $refund = Refund::where('order_id', $order->id)->firstOrFail();
        $this->assertSame(10000, (int) $refund->drawer_cash_out_laar);
    }

    /** ACCEPT 3: mixed 60/40 credit + cash → drawer covers only the cash slice. */
    public function test_mixed_credit_and_cash_refund_only_takes_cash_slice_from_drawer(): void
    {
        $customer = Customer::create(['name' => 'Mixed Customer', 'phone' => '9607700070']);
        $this->approveCustomer($customer, 100000);

        Sanctum::actingAs($this->staff, ['staff']);
        $this->postJson('/api/shifts/open', ['opening_cash' => 0])->assertCreated();
        $orderId = $this->createOrder($customer->id);

        $order = Order::findOrFail($orderId);
        $orderTotalLaar = (int) ($order->total_laar ?? round((float) $order->total * 100));
        $orderTotalMvr = $orderTotalLaar / 100;
        $creditMvr = round($orderTotalMvr * 0.40, 2);
        $cashMvr = round($orderTotalMvr - $creditMvr, 2);

        // Pay 60% cash + 40% credit.
        $this->withHeader('X-Device-Identifier', $this->device->identifier)
            ->postJson("/api/orders/{$orderId}/payments", [
                'payments' => [
                    ['method' => 'cash', 'amount' => $cashMvr],
                    ['method' => 'house_account', 'amount' => $creditMvr],
                ],
                'print_receipt' => false,
            ])->assertOk();

        Sanctum::actingAs($this->owner, ['staff']);
        $this->postJson('/api/shifts/open', ['opening_cash' => 0])->assertCreated();

        // Full refund at order total.
        $response = $this->postJson("/api/orders/{$orderId}/refunds", [
            'amount' => $orderTotalMvr,
            'reason' => 'mixed refund',
        ])->assertCreated();

        $expectedCreditReversedLaar = (int) round($creditMvr * 100);
        $expectedDrawerLaar = $orderTotalLaar - $expectedCreditReversedLaar;

        $response->assertJsonPath('breakdown.credit_reversed_laar', $expectedCreditReversedLaar);
        $response->assertJsonPath('breakdown.drawer_cash_out_laar', $expectedDrawerLaar);

        $refund = Refund::where('order_id', $orderId)->firstOrFail();
        $this->assertSame($expectedDrawerLaar, (int) $refund->drawer_cash_out_laar);
    }

    /** ACCEPT 4: full-credit refund → zero drawer cash. */
    public function test_fully_credit_paid_refund_takes_zero_from_drawer(): void
    {
        $customer = Customer::create(['name' => 'Credit Customer', 'phone' => '9607700071']);
        $this->approveCustomer($customer, 100000);

        Sanctum::actingAs($this->staff, ['staff']);
        $this->postJson('/api/shifts/open', ['opening_cash' => 0])->assertCreated();
        $orderId = $this->createOrder($customer->id);
        $order = Order::findOrFail($orderId);
        $orderTotalMvr = ((int) ($order->total_laar ?? round((float) $order->total * 100))) / 100;

        $this->withHeader('X-Device-Identifier', $this->device->identifier)
            ->postJson("/api/orders/{$orderId}/payments", [
                'payments' => [['method' => 'house_account', 'amount' => $orderTotalMvr]],
                'print_receipt' => false,
            ])->assertOk();

        Sanctum::actingAs($this->owner, ['staff']);
        $this->postJson('/api/shifts/open', ['opening_cash' => 0])->assertCreated();

        $this->postJson("/api/orders/{$orderId}/refunds", [
            'amount' => $orderTotalMvr,
            'reason' => 'full credit refund',
        ])->assertCreated()
            ->assertJsonPath('breakdown.credit_reversed_laar', (int) round($orderTotalMvr * 100))
            ->assertJsonPath('breakdown.drawer_cash_out_laar', 0);
    }

    /** ACCEPT 5: legacy null → expectedCashFor falls back to amount. */
    public function test_legacy_refunds_with_null_drawer_column_still_reconcile_on_amount(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);
        $this->postJson('/api/shifts/open', ['opening_cash' => 0])->assertCreated();
        $shift = Shift::where('user_id', $this->owner->id)->whereNull('closed_at')->firstOrFail();

        [$order, $_] = $this->buildCardOrderAndOpenShiftSnapshot(5000, $shift);

        // Simulate a legacy refund row with drawer_cash_out_laar NULL.
        Refund::create([
            'order_id' => $order->id,
            'user_id' => $this->owner->id,
            'shift_id' => $shift->id,
            'amount' => 50.00,
            'drawer_cash_out_laar' => null,
            'status' => 'approved',
        ]);

        $summary = $this->getJson("/api/shifts/{$shift->id}/summary")->assertOk()->json();
        // Legacy fallback: expectedCashFor uses ROUND(amount*100) when the
        // column is NULL — the full 50 MVR pulls out of the drawer.
        $this->assertSame(50.0, round((float) $summary['cash_drawer']['cash_refunds'], 2));
    }

    /** ACCEPT 6: clamp — override cannot exceed refund − (credit+gift+wallet). */
    public function test_drawer_cash_is_clamped_to_non_credit_non_wallet_portion(): void
    {
        $customer = Customer::create(['name' => 'Clamp Customer', 'phone' => '9607700072']);
        $this->approveCustomer($customer, 100000);

        Sanctum::actingAs($this->staff, ['staff']);
        $this->postJson('/api/shifts/open', ['opening_cash' => 0])->assertCreated();
        $orderId = $this->createOrder($customer->id);
        $order = Order::findOrFail($orderId);
        $orderTotalLaar = (int) ($order->total_laar ?? round((float) $order->total * 100));
        $orderTotalMvr = $orderTotalLaar / 100;
        $creditMvr = round($orderTotalMvr * 0.40, 2);
        $cashMvr = round($orderTotalMvr - $creditMvr, 2);

        $this->withHeader('X-Device-Identifier', $this->device->identifier)
            ->postJson("/api/orders/{$orderId}/payments", [
                'payments' => [
                    ['method' => 'cash', 'amount' => $cashMvr],
                    ['method' => 'house_account', 'amount' => $creditMvr],
                ],
                'print_receipt' => false,
            ])->assertOk();

        Sanctum::actingAs($this->owner, ['staff']);
        $this->postJson('/api/shifts/open', ['opening_cash' => 0])->assertCreated();

        // With override=true the drawer share is refund − credit_reversed.
        // Credit is still ledger-reversed; the cashier only makes up cash +
        // external tenders. Clamp = orderTotal − credit_reversed.
        $expectedCreditReversedLaar = (int) round($creditMvr * 100);
        $expectedDrawerLaar = $orderTotalLaar - $expectedCreditReversedLaar;

        $this->postJson("/api/orders/{$orderId}/refunds", [
            'amount' => $orderTotalMvr,
            'reason' => 'clamp check',
            'cash_refund_override' => true,
        ])->assertCreated()
            ->assertJsonPath('breakdown.drawer_cash_out_laar', $expectedDrawerLaar);
    }

    /** ACCEPT 7: pure-service unit — RefundDrawerCashService::breakdown. */
    public function test_service_breakdown_matches_expected_split_for_pure_card_order(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);
        $this->postJson('/api/shifts/open', ['opening_cash' => 0])->assertCreated();

        [$order, $_] = $this->buildCardOrderAndOpenShiftSnapshot(10000);

        $service = app(RefundDrawerCashService::class);
        $result = $service->breakdown($order->fresh(['payments']), 5000, 10000, 10000);

        $this->assertSame(0, $result['credit_reversed_laar']);
        $this->assertSame(0, $result['gift_reversed_laar']);
        $this->assertSame(0, $result['wallet_reversed_laar']);
        $this->assertSame(5000, $result['external_tender_laar']);
        $this->assertSame(0, $result['default_drawer_cash_out_laar']);
    }

    private function approveCustomer(Customer $customer, int $limitLaar): void
    {
        $customer->update([
            'credit_enabled' => true,
            'credit_status' => 'active',
            'credit_limit_laar' => $limitLaar,
            'credit_balance_laar' => 0,
            'credit_approved_by' => $this->owner->id,
            'credit_approved_at' => now(),
            'credit_payment_terms_days' => 30,
            'credit_reminder_sms' => true,
        ]);
    }

    private function buildCardOrderAndOpenShiftSnapshot(int $totalLaar, ?Shift $shift = null): array
    {
        $shift = $shift
            ?? Shift::where('user_id', $this->owner->id)->whereNull('closed_at')->latest('opened_at')->firstOrFail();

        $order = Order::create([
            'order_number' => 'RD-' . uniqid(),
            'type' => 'takeaway',
            'status' => 'paid',
            'subtotal' => $totalLaar / 100,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => $totalLaar / 100,
            'total_laar' => $totalLaar,
            'paid_at' => now(),
            'shift_id' => $shift->id,
        ]);
        Payment::create([
            'order_id' => $order->id,
            'method' => 'card',
            'amount' => $totalLaar / 100,
            'amount_laar' => $totalLaar,
            'status' => 'paid',
            'shift_id' => $shift->id,
            'processed_at' => now(),
        ]);

        return [$order->fresh(['payments']), $shift];
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

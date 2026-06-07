<?php

declare(strict_types=1);

namespace Tests\Feature\Deposits;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Category;
use App\Models\Customer;
use App\Models\CustomerDepositLedger;
use App\Models\Device;
use App\Models\Item;
use App\Models\Order;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DepositsTest extends TestCase
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
        $staffRole = Role::where('slug', 'staff')->firstOrFail();
        $managerRole = Role::where('slug', 'manager')->firstOrFail();

        $this->owner = User::create([
            'name' => 'Owner',
            'email' => 'owner@deposit.test',
            'password' => Hash::make('password'),
            'role_id' => $ownerRole->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);

        $this->staff = User::create([
            'name' => 'Staff',
            'email' => 'staff@deposit.test',
            'password' => Hash::make('password'),
            'role_id' => $staffRole->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);

        $this->manager = User::create([
            'name' => 'Manager',
            'email' => 'manager@deposit.test',
            'password' => Hash::make('password'),
            'role_id' => $managerRole->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);

        $this->device = Device::create([
            'name' => 'Deposit POS',
            'identifier' => 'DEPOSIT-POS',
            'type' => 'pos',
            'is_active' => true,
        ]);

        $category = Category::create(['name' => 'Deposit Food', 'slug' => 'deposit-food', 'is_active' => true]);
        $this->item = Item::create([
            'category_id' => $category->id,
            'name' => 'Deposit Item',
            'base_price' => 50.0,
            'sku' => 'DEP-001',
            'is_active' => true,
            'is_available' => true,
        ]);

        $this->customer = Customer::create([
            'name' => 'Deposit Customer',
            'phone' => '9607700099',
        ]);
    }

    public function test_manager_can_top_up_customer_deposit(): void
    {
        Sanctum::actingAs($this->manager, ['staff']);
        $this->postJson('/api/shifts/open', ['opening_cash' => 100])->assertCreated();

        $this->postJson("/api/admin/customers/{$this->customer->id}/deposit/top-up", [
            'amount_mvr' => 100,
            'method' => 'cash',
            'reference' => 'CASH-TOP',
        ])->assertCreated()
            ->assertJsonPath('deposit.balance_laar', 10000);

        $this->assertSame(1, CustomerDepositLedger::where('customer_id', $this->customer->id)->where('type', 'top_up')->count());
    }

    public function test_staff_cannot_top_up_without_permission(): void
    {
        Sanctum::actingAs($this->staff, ['staff']);

        $this->postJson("/api/admin/customers/{$this->customer->id}/deposit/top-up", [
            'amount_mvr' => 50,
            'method' => 'cash',
        ])->assertForbidden();
    }

    public function test_customer_can_view_deposit_balance(): void
    {
        $this->topUpDeposit(5000);

        Sanctum::actingAs($this->customer->fresh(), ['customer']);

        $this->getJson('/api/customer/deposit')
            ->assertOk()
            ->assertJsonPath('deposit.balance_mvr', 50)
            ->assertJsonPath('deposit.can_use', true);
    }

    public function test_pos_wallet_settlement_debits_deposit(): void
    {
        $this->topUpDeposit(10000);

        Sanctum::actingAs($this->staff, ['staff']);
        $this->postJson('/api/shifts/open', ['opening_cash' => 100])->assertCreated();

        $orderId = $this->createOrder($this->customer->id);
        $order = Order::findOrFail($orderId);
        $orderTotalMvr = ((int) ($order->total_laar ?? round((float) $order->total * 100))) / 100;

        $this->withHeader('X-Device-Identifier', $this->device->identifier)
            ->postJson("/api/orders/{$orderId}/payments", [
                'payments' => [['method' => 'wallet', 'amount' => $orderTotalMvr]],
                'print_receipt' => false,
            ])
            ->assertOk();

        $this->assertSame(1, CustomerDepositLedger::where('customer_id', $this->customer->id)->where('type', 'usage')->count());

        Sanctum::actingAs($this->manager, ['staff']);
        $this->getJson("/api/admin/customers/{$this->customer->id}/deposit")
            ->assertOk()
            ->assertJsonPath('deposit.balance_laar', 10000 - (int) ($order->total_laar ?? round((float) $order->total * 100)));
    }

    public function test_wallet_payment_rejected_when_insufficient_balance(): void
    {
        $this->topUpDeposit(1000);

        Sanctum::actingAs($this->staff, ['staff']);
        $this->postJson('/api/shifts/open', ['opening_cash' => 100])->assertCreated();

        $orderId = $this->createOrder($this->customer->id);
        $order = Order::findOrFail($orderId);
        $orderTotalMvr = ((int) ($order->total_laar ?? round((float) $order->total * 100))) / 100;

        $this->withHeader('X-Device-Identifier', $this->device->identifier)
            ->postJson("/api/orders/{$orderId}/payments", [
                'payments' => [['method' => 'wallet', 'amount' => $orderTotalMvr]],
                'print_receipt' => false,
            ])
            ->assertStatus(422)
            ->assertJsonFragment(['message' => 'Deposit amount exceeds available prepaid balance.']);
    }

    public function test_owner_can_adjust_deposit_balance(): void
    {
        $this->topUpDeposit(5000);

        Sanctum::actingAs($this->owner, ['staff']);

        $this->postJson("/api/admin/customers/{$this->customer->id}/deposit/adjust", [
            'amount_laar' => 2500,
            'notes' => 'Goodwill credit',
        ])->assertCreated()
            ->assertJsonPath('deposit.balance_laar', 7500);
    }

    public function test_staff_cannot_adjust_without_permission(): void
    {
        $this->topUpDeposit(5000);

        Sanctum::actingAs($this->staff, ['staff']);

        $this->postJson("/api/admin/customers/{$this->customer->id}/deposit/adjust", [
            'amount_laar' => -1000,
            'notes' => 'Correction',
        ])->assertForbidden();
    }

    public function test_frozen_account_blocks_wallet_usage(): void
    {
        $this->topUpDeposit(10000);

        Sanctum::actingAs($this->manager, ['staff']);
        $this->patchJson("/api/admin/customers/{$this->customer->id}/deposit", [
            'action' => 'set_status',
            'status' => 'frozen',
        ])->assertOk();

        Sanctum::actingAs($this->staff, ['staff']);
        $this->postJson('/api/shifts/open', ['opening_cash' => 100])->assertCreated();

        $orderId = $this->createOrder($this->customer->id);
        $order = Order::findOrFail($orderId);
        $orderTotalMvr = ((int) ($order->total_laar ?? round((float) $order->total * 100))) / 100;

        $this->withHeader('X-Device-Identifier', $this->device->identifier)
            ->postJson("/api/orders/{$orderId}/payments", [
                'payments' => [['method' => 'wallet', 'amount' => $orderTotalMvr]],
                'print_receipt' => false,
            ])
            ->assertStatus(422)
            ->assertJsonFragment(['message' => 'This customer deposit account is frozen.']);
    }

    private function topUpDeposit(int $amountLaar): void
    {
        Sanctum::actingAs($this->manager, ['staff']);
        $this->postJson('/api/shifts/open', ['opening_cash' => 100])->assertCreated();

        $this->postJson("/api/admin/customers/{$this->customer->id}/deposit/top-up", [
            'amount_laar' => $amountLaar,
            'method' => 'cash',
        ])->assertCreated();
    }

    private function createOrder(?int $customerId): int
    {
        $payload = [
            'type' => 'takeaway',
            'device_identifier' => $this->device->identifier,
            'items' => [
                [
                    'item_id' => $this->item->id,
                    'name' => $this->item->name,
                    'quantity' => 1,
                ],
            ],
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

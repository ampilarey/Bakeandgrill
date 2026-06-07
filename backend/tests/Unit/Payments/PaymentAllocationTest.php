<?php

declare(strict_types=1);

namespace Tests\Unit\Payments;

use App\Domains\Customers\Services\CustomerCreditService;
use App\Domains\Deposits\Services\CustomerDepositService;
use App\Domains\Payments\Services\PaymentAllocationService;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Category;
use App\Models\Customer;
use App\Models\Device;
use App\Models\Item;
use App\Models\Order;
use App\Models\Role;
use App\Models\User;
use App\Services\PermissionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class PaymentAllocationTest extends TestCase
{
    use RefreshDatabase;

    private PaymentAllocationService $allocation;

    private User $staff;

    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();

        PermissionCatalogSync::sync();
        $this->allocation = app(PaymentAllocationService::class);

        $staffRole = Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'is_active' => true]);
        $this->staff = User::create([
            'name' => 'Alloc Staff',
            'email' => 'alloc@payment.test',
            'password' => Hash::make('password'),
            'role_id' => $staffRole->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);

        $this->customer = Customer::create([
            'name' => 'Alloc Customer',
            'phone' => '9607700100',
            'credit_enabled' => true,
            'credit_status' => 'active',
            'credit_limit_laar' => 50000,
        ]);

        Device::create(['name' => 'Alloc POS', 'identifier' => 'ALLOC-POS', 'type' => 'pos', 'is_active' => true]);
        $category = Category::create(['name' => 'Alloc', 'slug' => 'alloc', 'is_active' => true]);
        Item::create([
            'category_id' => $category->id,
            'name' => 'Alloc Item',
            'base_price' => 25.0,
            'sku' => 'ALLOC-1',
            'is_active' => true,
            'is_available' => true,
        ]);
    }

    public function test_non_shift_methods_include_wallet_and_house_account(): void
    {
        $methods = $this->allocation->nonShiftMethods();

        $this->assertContains('wallet', $methods);
        $this->assertContains('house_account', $methods);
        $this->assertContains('bml', $methods);
    }

    public function test_wallet_payment_requires_payments_wallet_permission(): void
    {
        $this->staff->revokePermission('payments.wallet');
        $this->staff->unsetRelation('permissions');

        $order = $this->makeAllocationOrder();
        $permissions = app(PermissionService::class);

        $this->expectException(\Symfony\Component\HttpKernel\Exception\HttpException::class);
        $this->expectExceptionMessage('You do not have permission to use customer deposit balance.');

        $this->allocation->resolveAccountCustomers(
            $order,
            [['method' => 'wallet', 'amount' => 25.0]],
            $this->staff,
            app(CustomerCreditService::class),
            app(CustomerDepositService::class),
            $permissions,
        );
    }

    public function test_split_payment_requires_split_permission(): void
    {
        $this->staff->revokePermission('payments.split');
        $this->staff->unsetRelation('permissions');

        $order = $this->makeAllocationOrder();
        $permissions = app(PermissionService::class);

        $this->expectException(\Symfony\Component\HttpKernel\Exception\HttpException::class);
        $this->expectExceptionMessage('You do not have permission to take split payments.');

        $this->allocation->assertTenderPermissions(
            $this->staff,
            [
                ['method' => 'cash', 'amount' => 10.0],
                ['method' => 'card', 'amount' => 15.0],
            ],
            $permissions,
        );
    }

    public function test_tender_cap_rejects_absurd_overpay_on_card(): void
    {
        $order = $this->makeAllocationOrder();

        $this->expectException(\Symfony\Component\HttpKernel\Exception\HttpException::class);
        $this->expectExceptionMessage('far exceeds remaining balance');

        $this->allocation->assertTenderCap($order, [
            ['method' => 'card', 'amount' => 9999.0],
        ]);
    }

    private function makeAllocationOrder(): Order
    {
        return Order::create([
            'order_number' => 'ORD-ALLOC-1',
            'type' => 'takeaway',
            'status' => 'pending',
            'customer_id' => $this->customer->id,
            'subtotal' => 25.0,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 25.0,
            'total_laar' => 2500,
        ]);
    }
}

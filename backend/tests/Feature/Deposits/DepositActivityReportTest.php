<?php

declare(strict_types=1);

namespace Tests\Feature\Deposits;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Customer;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DepositActivityReportTest extends TestCase
{
    use RefreshDatabase;

    public function test_deposit_activity_report_separates_liability_movements_from_sales(): void
    {
        PermissionCatalogSync::sync();
        Role::firstOrCreate(['slug' => 'manager'], ['name' => 'Manager', 'is_active' => true]);
        $managerRole = Role::where('slug', 'manager')->firstOrFail();

        $manager = User::create([
            'name' => 'Deposit Reporter',
            'email' => 'deposit-reporter@test.local',
            'password' => Hash::make('password'),
            'role_id' => $managerRole->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);

        $customer = Customer::create(['name' => 'Activity Customer', 'phone' => '+9607111222']);

        Sanctum::actingAs($manager, ['staff']);
        $this->postJson('/api/shifts/open', ['opening_cash' => 100])->assertCreated();

        $this->postJson("/api/admin/customers/{$customer->id}/deposit/top-up", [
            'amount_mvr' => 50,
            'method' => 'cash',
        ])->assertCreated();

        $from = now()->subDay()->toDateString();
        $to = now()->addDay()->toDateString();

        $this->getJson("/api/reports/deposit-activity?from={$from}&to={$to}")
            ->assertOk()
            ->assertJsonPath('received', 50)
            ->assertJsonStructure(['received', 'used', 'payouts', 'transfers']);
    }

    public function test_deposit_activity_reports_used_payouts_and_transfers(): void
    {
        PermissionCatalogSync::sync();
        Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'is_active' => true]);
        Role::firstOrCreate(['slug' => 'manager'], ['name' => 'Manager', 'is_active' => true]);

        $manager = User::create([
            'name' => 'Deposit Activity Manager',
            'email' => 'deposit-activity@test.local',
            'password' => Hash::make('password'),
            'role_id' => Role::where('slug', 'manager')->firstOrFail()->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);

        $customer = Customer::create(['name' => 'Activity Mix', 'phone' => '+9607111333']);
        $device = \App\Models\Device::create([
            'name' => 'Activity POS',
            'identifier' => 'ACT-POS',
            'type' => 'pos',
            'is_active' => true,
        ]);
        $category = \App\Models\Category::create(['name' => 'Act', 'slug' => 'act-cat', 'is_active' => true]);
        $item = \App\Models\Item::create([
            'category_id' => $category->id,
            'name' => 'Act Item',
            'base_price' => 30.0,
            'sku' => 'ACT-001',
            'is_active' => true,
            'is_available' => true,
        ]);

        Sanctum::actingAs($manager, ['staff']);
        $this->postJson('/api/shifts/open', ['opening_cash' => 200])->assertCreated();

        $this->postJson("/api/admin/customers/{$customer->id}/deposit/top-up", [
            'amount_mvr' => 100,
            'method' => 'cash',
        ])->assertCreated();

        $orderResponse = $this->withHeader('X-Device-Identifier', $device->identifier)
            ->postJson('/api/orders', [
                'type' => 'takeaway',
                'customer_id' => $customer->id,
                'device_identifier' => $device->identifier,
                'items' => [['item_id' => $item->id, 'name' => $item->name, 'quantity' => 1]],
            ])->assertCreated();

        $orderId = $orderResponse->json('order.id');
        $orderTotal = (float) $orderResponse->json('order.total');

        $this->withHeader('X-Device-Identifier', $device->identifier)
            ->postJson("/api/orders/{$orderId}/payments", [
                'payments' => [['method' => 'wallet', 'amount' => $orderTotal]],
                'print_receipt' => false,
            ])->assertOk();

        $this->postJson("/api/admin/customers/{$customer->id}/deposit/refund", [
            'amount_mvr' => 20,
            'method' => 'cash',
            'reason' => 'Test payout',
        ])->assertCreated();

        $this->patchJson("/api/admin/customers/{$customer->id}/credit", [
            'action' => 'approve',
            'credit_limit_mvr' => 500,
        ])->assertOk();

        $customer->refresh()->update(['credit_balance_laar' => 2000]);

        $this->postJson("/api/admin/customers/{$customer->id}/deposit/transfer-to-credit", [
            'amount_mvr' => 10,
        ])->assertCreated();

        $from = now()->subDay()->toDateString();
        $to = now()->addDay()->toDateString();

        $this->getJson("/api/reports/deposit-activity?from={$from}&to={$to}")
            ->assertOk()
            ->assertJsonPath('received', 100)
            ->assertJson(fn ($json) => $json
                ->where('used', fn ($v) => (float) $v > 0)
                ->where('payouts', 20)
                ->where('transfers', 10)
                ->etc());
    }
}

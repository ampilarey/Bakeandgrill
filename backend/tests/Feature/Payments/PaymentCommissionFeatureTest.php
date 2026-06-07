<?php

declare(strict_types=1);

namespace Tests\Feature\Payments;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Category;
use App\Models\Device;
use App\Models\Expense;
use App\Models\Item;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Role;
use App\Models\SiteSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PaymentCommissionFeatureTest extends TestCase
{
    use RefreshDatabase;

    private User $staff;
    private Device $device;
    private Item $item;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();

        $role = Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'description' => '', 'is_active' => true]);
        $this->staff = User::create([
            'name' => 'Cashier',
            'email' => 'cashier@commission.test',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);

        $this->device = Device::create([
            'name' => 'Commission POS',
            'identifier' => 'COMM-POS',
            'type' => 'pos',
            'is_active' => true,
        ]);

        $category = Category::create(['name' => 'Food', 'slug' => 'comm-food', 'is_active' => true]);
        $this->item = Item::create([
            'category_id' => $category->id,
            'name' => 'Commission Item',
            'base_price' => 100,
            'sku' => 'COMM-001',
            'is_active' => true,
            'is_available' => true,
        ]);

        SiteSetting::set('payment_commission_enabled', '1');
        SiteSetting::set('payment_commission_pos_card_rate_bp', '250');
        SiteSetting::set('payment_commission_online_gateway_rate_bp', '300');
        SiteSetting::bust();
    }

    public function test_settings_api_returns_and_updates_dual_rates(): void
    {
        $owner = $this->makeOwner(['email' => 'owner@commission.test']);
        Sanctum::actingAs($owner, ['staff']);

        $this->getJson('/api/admin/settings/payment-commission')
            ->assertOk()
            ->assertJsonPath('settings.pos_card_rate_bp', 250)
            ->assertJsonPath('settings.online_gateway_rate_bp', 300);

        $this->putJson('/api/admin/settings/payment-commission', [
            'enabled' => true,
            'pos_card_rate_bp' => 200,
            'online_gateway_rate_bp' => 350,
        ])
            ->assertOk()
            ->assertJsonPath('settings.pos_card_rate_percent', 2)
            ->assertJsonPath('settings.online_gateway_rate_percent', 3.5);
    }

    public function test_pos_card_payment_stores_commission_snapshot(): void
    {
        Sanctum::actingAs($this->staff, ['staff']);
        $this->postJson('/api/shifts/open', ['opening_cash' => 100])->assertCreated();

        $orderResponse = $this->withHeader('X-Device-Identifier', $this->device->identifier)
            ->postJson('/api/orders', [
                'type' => 'takeaway',
                'device_identifier' => $this->device->identifier,
                'print' => false,
                'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
            ])
            ->assertCreated();

        $orderId = (int) $orderResponse->json('order.id');

        $this->withHeader('X-Device-Identifier', $this->device->identifier)
            ->postJson("/api/orders/{$orderId}/payments", [
                'payments' => [['method' => 'card', 'amount' => (float) $orderResponse->json('order.total')]],
                'print_receipt' => false,
            ])
            ->assertOk();

        $payment = Payment::where('order_id', $orderId)->where('method', 'card')->firstOrFail();

        $this->assertSame('pos_card', $payment->commission_channel);
        $this->assertSame(250, $payment->commission_rate_bp);
        $this->assertGreaterThan(0, $payment->commission_laar);

        $expense = Expense::where('payment_id', $payment->id)->first();
        $this->assertNotNull($expense);
        $this->assertSame('approved', $expense->status);
        $this->assertSame($payment->commission_laar, $expense->amount_laar);
    }

    public function test_sales_summary_includes_commission_breakdown(): void
    {
        $owner = $this->makeOwner(['email' => 'owner2@commission.test']);
        Sanctum::actingAs($owner, ['staff']);

        $order = Order::factory()->create([
            'status' => 'completed',
            'total' => 100,
            'total_laar' => 10000,
            'created_at' => now(),
        ]);

        Payment::create([
            'order_id' => $order->id,
            'method' => 'card',
            'amount' => 100,
            'amount_laar' => 10000,
            'status' => 'paid',
            'processed_at' => now(),
            'commission_laar' => 250,
            'commission_rate_bp' => 250,
            'commission_channel' => 'pos_card',
        ]);

        Payment::create([
            'order_id' => $order->id,
            'method' => 'bml_connect',
            'gateway' => 'bml',
            'amount' => 50,
            'amount_laar' => 5000,
            'status' => 'confirmed',
            'processed_at' => now(),
            'commission_laar' => 150,
            'commission_rate_bp' => 300,
            'commission_channel' => 'online_gateway',
        ]);

        $date = now()->toDateString();
        $response = $this->getJson("/api/reports/sales-summary?from={$date}&to={$date}");

        $response->assertOk()
            ->assertJsonPath('payment_commission.totals.gross_commissionable', 150)
            ->assertJsonPath('payment_commission.totals.commission_total', 4)
            ->assertJsonPath('payment_commission.by_channel.0.channel', 'pos_card')
            ->assertJsonPath('payment_commission.by_channel.1.channel', 'online_gateway');
    }

    public function test_profit_and_loss_includes_commission_in_operating_expenses(): void
    {
        $owner = $this->makeOwner(['email' => 'owner3@commission.test']);
        Sanctum::actingAs($owner, ['staff']);

        $order = Order::factory()->create([
            'status' => 'completed',
            'total' => 100,
            'total_laar' => 10000,
            'created_at' => now(),
        ]);

        $payment = Payment::create([
            'order_id' => $order->id,
            'method' => 'card',
            'amount' => 100,
            'amount_laar' => 10000,
            'status' => 'paid',
            'processed_at' => now(),
            'collected_by_user_id' => $owner->id,
            'commission_laar' => 250,
            'commission_rate_bp' => 250,
            'commission_channel' => 'pos_card',
        ]);

        $expense = app(\App\Domains\Payments\Services\PaymentCommissionExpenseService::class)->syncForPayment($payment);
        $this->assertNotNull($expense);

        $date = now()->toDateString();
        $this->assertDatabaseHas('expenses', [
            'payment_id' => $payment->id,
            'status' => 'approved',
            'amount' => 2.5,
        ]);

        $response = $this->getJson("/api/reports/finance/profit-and-loss?from={$date}&to={$date}");

        $response->assertOk()
            ->assertJsonPath('payment_processing_fees', 2.5)
            ->assertJsonPath('expenses.total', 2.5)
            ->assertJsonPath('operating_profit', round(100 - 2.5, 2));
    }

    public function test_auto_commission_expense_cannot_be_deleted(): void
    {
        $owner = $this->makeOwner(['email' => 'owner4@commission.test']);
        Sanctum::actingAs($owner, ['staff']);

        $order = Order::factory()->create(['status' => 'completed', 'total' => 50, 'total_laar' => 5000]);
        $payment = Payment::create([
            'order_id' => $order->id,
            'method' => 'card',
            'amount' => 50,
            'amount_laar' => 5000,
            'status' => 'paid',
            'processed_at' => now(),
            'collected_by_user_id' => $owner->id,
            'commission_laar' => 125,
            'commission_rate_bp' => 250,
            'commission_channel' => 'pos_card',
        ]);

        $expense = app(\App\Domains\Payments\Services\PaymentCommissionExpenseService::class)->syncForPayment($payment);
        $this->assertNotNull($expense);

        $this->deleteJson("/api/expenses/{$expense->id}")
            ->assertStatus(422);
    }
}

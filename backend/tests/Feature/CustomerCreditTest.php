<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\AuditLog;
use App\Models\CashMovement;
use App\Models\Category;
use App\Models\Customer;
use App\Models\CustomerCreditLedger;
use App\Models\Device;
use App\Models\Invoice;
use App\Models\Item;
use App\Models\Role;
use App\Models\Shift;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CustomerCreditTest extends TestCase
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
            'email' => 'owner@credit.test',
            'password' => Hash::make('password'),
            'role_id' => $ownerRole->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);

        $this->staff = User::create([
            'name' => 'Staff',
            'email' => 'staff@credit.test',
            'password' => Hash::make('password'),
            'role_id' => $staffRole->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);

        $this->manager = User::create([
            'name' => 'Manager',
            'email' => 'manager@credit.test',
            'password' => Hash::make('password'),
            'role_id' => $managerRole->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);

        $this->device = Device::create([
            'name' => 'Credit POS',
            'identifier' => 'CREDIT-POS',
            'type' => 'pos',
            'is_active' => true,
        ]);

        $category = Category::create(['name' => 'Credit Food', 'slug' => 'credit-food', 'is_active' => true]);
        $this->item = Item::create([
            'category_id' => $category->id,
            'name' => 'Credit Item',
            'base_price' => 50.0,
            'sku' => 'CRED-001',
            'is_active' => true,
            'is_available' => true,
        ]);

        $this->customer = Customer::create([
            'name' => 'Credit Customer',
            'phone' => '9607700001',
        ]);
    }

    public function test_new_customer_has_credit_disabled_by_default(): void
    {
        $this->assertFalse((bool) $this->customer->credit_enabled);
        $this->assertSame('blocked', $this->customer->credit_status);
        $this->assertSame(0, (int) $this->customer->credit_limit_laar);
    }

    public function test_staff_cannot_approve_customer_credit(): void
    {
        Sanctum::actingAs($this->staff, ['staff']);

        $this->patchJson("/api/admin/customers/{$this->customer->id}/credit", [
            'action' => 'approve',
            'credit_limit_mvr' => 500,
        ])->assertForbidden();
    }

    public function test_manager_can_approve_customer_credit(): void
    {
        Sanctum::actingAs($this->manager, ['staff']);

        $this->patchJson("/api/admin/customers/{$this->customer->id}/credit", [
            'action' => 'approve',
            'credit_limit_mvr' => 500,
            'credit_notes' => 'Trusted regular',
        ])->assertOk()
            ->assertJsonPath('customer.enabled', true)
            ->assertJsonPath('customer.status', 'active');

        $this->customer->refresh();
        $this->assertTrue($this->customer->credit_enabled);
        $this->assertSame(50000, (int) $this->customer->credit_limit_laar);
    }

    public function test_house_account_payment_rejected_without_customer(): void
    {
        Sanctum::actingAs($this->staff, ['staff']);
        $this->postJson('/api/shifts/open', ['opening_cash' => 100])->assertCreated();

        $orderId = $this->createOrder(null);

        $this->withHeader('X-Device-Identifier', $this->device->identifier)
            ->postJson("/api/orders/{$orderId}/payments", [
                'payments' => [['method' => 'house_account', 'amount' => 50]],
                'print_receipt' => false,
            ])
            ->assertStatus(422)
            ->assertJsonFragment(['message' => 'This customer is not approved for credit.']);
    }

    public function test_house_account_payment_rejected_for_unapproved_customer(): void
    {
        Sanctum::actingAs($this->staff, ['staff']);
        $this->postJson('/api/shifts/open', ['opening_cash' => 100])->assertCreated();

        $orderId = $this->createOrder($this->customer->id);

        $this->withHeader('X-Device-Identifier', $this->device->identifier)
            ->postJson("/api/orders/{$orderId}/payments", [
                'payments' => [['method' => 'house_account', 'amount' => 50]],
                'print_receipt' => false,
            ])
            ->assertStatus(422)
            ->assertJsonFragment(['message' => 'This customer is not approved for credit.']);
    }

    public function test_approved_customer_can_pay_on_credit_within_limit(): void
    {
        $this->approveCustomer(50000);

        Sanctum::actingAs($this->staff, ['staff']);
        $this->postJson('/api/shifts/open', ['opening_cash' => 100])->assertCreated();

        $orderId = $this->createOrder($this->customer->id);

        $this->withHeader('X-Device-Identifier', $this->device->identifier)
            ->postJson("/api/orders/{$orderId}/payments", [
                'payments' => [['method' => 'house_account', 'amount' => 50]],
                'print_receipt' => false,
            ])
            ->assertOk();

        $this->customer->refresh();
        $this->assertSame(5000, (int) $this->customer->credit_balance_laar);
        $this->assertSame(1, CustomerCreditLedger::where('customer_id', $this->customer->id)->where('type', 'charge')->count());

        $invoice = Invoice::where('order_id', $orderId)->where('type', 'sale')->first();
        $this->assertNotNull($invoice);
        $this->assertSame('sent', $invoice->status);
        $this->assertNull($invoice->paid_at);
        $this->assertSame(0, (int) $invoice->amount_paid_laar);
        $this->assertTrue($invoice->isOnCreditAccount());
    }

    public function test_customer_credit_endpoint_returns_balance_and_open_invoices(): void
    {
        $this->approveCustomer(50000);
        $this->chargeCustomerCredit(5000);

        Sanctum::actingAs($this->customer->fresh(), ['customer']);

        $this->getJson('/api/customer/credit')
            ->assertOk()
            ->assertJsonPath('credit.enabled', true)
            ->assertJsonPath('credit.balance_mvr', 50)
            ->assertJsonPath('credit.limit_mvr', 500)
            ->assertJsonCount(1, 'credit.open_invoices');

        $this->getJson('/api/customer/me')
            ->assertOk()
            ->assertJsonPath('credit.balance_mvr', 50);
    }

    public function test_customer_orders_include_credit_settlement_label(): void
    {
        $this->approveCustomer(50000);

        Sanctum::actingAs($this->staff, ['staff']);
        $this->postJson('/api/shifts/open', ['opening_cash' => 100])->assertCreated();
        $orderId = $this->createOrder($this->customer->id);
        $order = \App\Models\Order::findOrFail($orderId);
        $orderTotalMvr = ((int) ($order->total_laar ?? round((float) $order->total * 100))) / 100;

        $this->withHeader('X-Device-Identifier', $this->device->identifier)
            ->postJson("/api/orders/{$orderId}/payments", [
                'payments' => [['method' => 'house_account', 'amount' => $orderTotalMvr]],
                'print_receipt' => false,
            ])
            ->assertOk();

        Sanctum::actingAs($this->customer->fresh(), ['customer']);

        $this->getJson('/api/customer/orders')
            ->assertOk()
            ->assertJsonPath('data.0.payment_settlement.settlement', 'credit_account')
            ->assertJsonPath('data.0.payment_settlement.paid_on_credit', true)
            ->assertJsonPath('data.0.payment_settlement.label', 'Paid on credit account');
    }

    public function test_customer_without_credit_gets_null_credit_payload(): void
    {
        Sanctum::actingAs($this->customer->fresh(), ['customer']);

        $this->getJson('/api/customer/credit')
            ->assertOk()
            ->assertJsonPath('credit', null);
    }

    public function test_credit_charge_rejected_when_over_limit(): void
    {
        $this->approveCustomer(3000);

        Sanctum::actingAs($this->staff, ['staff']);
        $this->postJson('/api/shifts/open', ['opening_cash' => 100])->assertCreated();

        $orderId = $this->createOrder($this->customer->id);

        $this->withHeader('X-Device-Identifier', $this->device->identifier)
            ->postJson("/api/orders/{$orderId}/payments", [
                'payments' => [['method' => 'house_account', 'amount' => 50]],
                'print_receipt' => false,
            ])
            ->assertStatus(422)
            ->assertJsonFragment(['message' => 'Credit amount exceeds available credit limit.']);
    }

    public function test_owner_can_record_credit_repayment_with_cash_shift(): void
    {
        $this->approveCustomer(10000);
        $this->chargeCustomerCredit(5000);

        Sanctum::actingAs($this->owner, ['staff']);
        $this->postJson('/api/shifts/open', ['opening_cash' => 100])->assertCreated();

        $this->postJson("/api/admin/customers/{$this->customer->id}/credit/repayments", [
            'amount_mvr' => 30,
            'method' => 'cash',
            'reference' => 'CASH-001',
        ])->assertCreated()
            ->assertJsonPath('credit.balance_laar', 2000);

        $this->customer->refresh();
        $this->assertSame(2000, (int) $this->customer->credit_balance_laar);

        $shift = Shift::where('user_id', $this->owner->id)->whereNull('closed_at')->first();
        $this->assertNotNull($shift);
        $this->assertSame(1, CashMovement::where('shift_id', $shift->id)->where('type', 'cash_in')->count());

        $this->assertTrue(
            AuditLog::where('action', 'customer.credit.repayment')->where('model_id', $this->customer->id)->exists(),
        );
    }

    public function test_staff_cannot_record_credit_repayment(): void
    {
        $this->approveCustomer(10000);
        $this->chargeCustomerCredit(5000);

        Sanctum::actingAs($this->staff, ['staff']);

        $this->postJson("/api/admin/customers/{$this->customer->id}/credit/repayments", [
            'amount_mvr' => 10,
            'method' => 'card',
        ])->assertForbidden();
    }

    public function test_manager_with_repay_permission_can_record_repayment(): void
    {
        $this->approveCustomer(10000);
        $this->chargeCustomerCredit(5000);

        $this->manager->grantPermission('customers.credit.repay');
        $this->assertTrue($this->manager->fresh()->hasPermission('customers.credit.repay'));

        Sanctum::actingAs($this->manager->fresh(), ['staff']);

        $this->postJson("/api/admin/customers/{$this->customer->id}/credit/repayments", [
            'amount_mvr' => 20,
            'method' => 'bank_transfer',
            'reference' => 'TRF-99',
        ])->assertCreated()
            ->assertJsonPath('credit.balance_laar', 3000);
    }

    public function test_pos_summary_includes_credit_block(): void
    {
        $this->approveCustomer(8000);

        Sanctum::actingAs($this->staff, ['staff']);

        $this->getJson("/api/customers/{$this->customer->id}/pos-summary")
            ->assertOk()
            ->assertJsonPath('credit.enabled', true)
            ->assertJsonPath('credit.can_charge', true)
            ->assertJsonPath('credit.available_laar', 8000);
    }

    public function test_approve_with_net_7_sets_invoice_due_date(): void
    {
        Sanctum::actingAs($this->manager, ['staff']);

        $this->patchJson("/api/admin/customers/{$this->customer->id}/credit", [
            'action' => 'approve',
            'credit_limit_mvr' => 500,
            'credit_payment_terms_days' => 7,
        ])->assertOk()
            ->assertJsonPath('customer.payment_terms_days', 7);

        $this->chargeCustomerCredit(5000);

        $invoice = Invoice::where('customer_id', $this->customer->id)->where('type', 'sale')->first();
        $this->assertNotNull($invoice);
        $this->assertNotNull($invoice->due_date);
        $expectedDue = $invoice->issue_date->copy()->addDays(7)->toDateString();
        $this->assertSame($expectedDue, $invoice->due_date->toDateString());
    }

    public function test_customer_can_toggle_credit_reminder_sms_preference(): void
    {
        $this->approveCustomer(50000);

        Sanctum::actingAs($this->customer->fresh(), ['customer']);

        $this->patchJson('/api/customer/credit/preferences', [
            'credit_reminder_sms' => false,
        ])->assertOk()
            ->assertJsonPath('credit.reminder_sms_enabled', false);

        $this->customer->refresh();
        $this->assertFalse((bool) $this->customer->credit_reminder_sms);

        $this->patchJson('/api/customer/credit/preferences', [
            'credit_reminder_sms' => true,
        ])->assertOk()
            ->assertJsonPath('credit.reminder_sms_enabled', true);
    }

    public function test_customer_without_credit_cannot_update_reminder_preference(): void
    {
        Sanctum::actingAs($this->customer->fresh(), ['customer']);

        $this->patchJson('/api/customer/credit/preferences', [
            'credit_reminder_sms' => false,
        ])->assertStatus(422);
    }

    public function test_credit_payment_reminder_command_sends_sms_on_due_date(): void
    {
        $this->approveCustomer(50000);
        $this->chargeCustomerCredit(5000);

        $invoice = Invoice::where('customer_id', $this->customer->id)->where('type', 'sale')->firstOrFail();
        $dueDate = now()->toDateString();
        $invoice->update(['due_date' => $dueDate, 'status' => 'sent']);

        $this->artisan('credit:send-payment-reminders', ['--date' => $dueDate])
            ->assertSuccessful();

        $this->assertDatabaseHas('sms_logs', [
            'customer_id' => $this->customer->id,
            'type' => 'transactional',
            'idempotency_key' => "credit:reminder:{$invoice->id}:due_today:{$dueDate}",
        ]);

        $before = \App\Models\SmsLog::count();
        $this->artisan('credit:send-payment-reminders', ['--date' => $dueDate])
            ->assertSuccessful();
        $this->assertSame($before, \App\Models\SmsLog::count());
    }

    public function test_credit_payment_reminder_skips_when_opted_out(): void
    {
        $this->approveCustomer(50000);
        $this->customer->update(['credit_reminder_sms' => false]);
        $this->chargeCustomerCredit(5000);

        $invoice = Invoice::where('customer_id', $this->customer->id)->where('type', 'sale')->firstOrFail();
        $dueDate = now()->toDateString();
        $invoice->update(['due_date' => $dueDate]);

        $this->artisan('credit:send-payment-reminders', ['--date' => $dueDate])
            ->assertSuccessful();

        $this->assertDatabaseMissing('sms_logs', [
            'customer_id' => $this->customer->id,
            'idempotency_key' => "credit:reminder:{$invoice->id}:due_today:{$dueDate}",
        ]);
    }

    public function test_on_hold_customer_cannot_charge_credit(): void
    {
        $this->approveCustomer(50000);
        Sanctum::actingAs($this->manager, ['staff']);
        $this->patchJson("/api/admin/customers/{$this->customer->id}/credit", [
            'action' => 'set_status',
            'credit_status' => 'on_hold',
        ])->assertOk();

        Sanctum::actingAs($this->staff, ['staff']);
        $this->postJson('/api/shifts/open', ['opening_cash' => 100])->assertCreated();
        $orderId = $this->createOrder($this->customer->id);

        $this->withHeader('X-Device-Identifier', $this->device->identifier)
            ->postJson("/api/orders/{$orderId}/payments", [
                'payments' => [['method' => 'house_account', 'amount' => 50]],
                'print_receipt' => false,
            ])
            ->assertStatus(422)
            ->assertJsonFragment(['message' => 'This customer credit account is on hold.']);
    }

    public function test_blocked_customer_cannot_charge_credit(): void
    {
        $this->approveCustomer(50000);
        Sanctum::actingAs($this->manager, ['staff']);
        $this->patchJson("/api/admin/customers/{$this->customer->id}/credit", [
            'action' => 'set_status',
            'credit_status' => 'blocked',
        ])->assertOk();

        Sanctum::actingAs($this->staff, ['staff']);
        $this->postJson('/api/shifts/open', ['opening_cash' => 100])->assertCreated();
        $orderId = $this->createOrder($this->customer->id);

        $this->withHeader('X-Device-Identifier', $this->device->identifier)
            ->postJson("/api/orders/{$orderId}/payments", [
                'payments' => [['method' => 'house_account', 'amount' => 50]],
                'print_receipt' => false,
            ])
            ->assertStatus(422)
            ->assertJsonFragment(['message' => 'This customer is not approved for credit.']);
    }

    public function test_staff_without_payments_credit_cannot_charge_house_account(): void
    {
        $this->approveCustomer(50000);
        $this->staff->revokePermission('payments.credit');
        $this->staff->unsetRelation('permissions');

        Sanctum::actingAs($this->staff->fresh(), ['staff']);
        $this->postJson('/api/shifts/open', ['opening_cash' => 100])->assertCreated();
        $orderId = $this->createOrder($this->customer->id);

        $this->withHeader('X-Device-Identifier', $this->device->identifier)
            ->postJson("/api/orders/{$orderId}/payments", [
                'payments' => [['method' => 'house_account', 'amount' => 50]],
                'print_receipt' => false,
            ])
            ->assertForbidden()
            ->assertJsonFragment(['message' => 'You do not have permission to charge customer credit.']);
    }

    public function test_house_account_charge_requires_open_shift_for_staff(): void
    {
        $this->approveCustomer(50000);

        Sanctum::actingAs($this->staff, ['staff']);
        $this->postJson('/api/shifts/open', ['opening_cash' => 100])->assertCreated();
        $orderId = $this->createOrder($this->customer->id);
        $shift = Shift::where('user_id', $this->staff->id)->whereNull('closed_at')->firstOrFail();
        $this->postJson("/api/shifts/{$shift->id}/close", ['closing_cash' => 100])->assertOk();

        $this->withHeader('X-Device-Identifier', $this->device->identifier)
            ->postJson("/api/orders/{$orderId}/payments", [
                'payments' => [['method' => 'house_account', 'amount' => 50]],
                'print_receipt' => false,
            ])
            ->assertStatus(422)
            ->assertJsonFragment(['message' => 'Open a shift before taking payment.']);
    }

    public function test_house_account_charge_persists_shift_id_on_payment_and_ledger(): void
    {
        $this->approveCustomer(50000);

        Sanctum::actingAs($this->staff, ['staff']);
        $this->postJson('/api/shifts/open', ['opening_cash' => 100])->assertCreated();
        $shift = Shift::where('user_id', $this->staff->id)->whereNull('closed_at')->firstOrFail();
        $orderId = $this->createOrder($this->customer->id);

        $this->withHeader('X-Device-Identifier', $this->device->identifier)
            ->postJson("/api/orders/{$orderId}/payments", [
                'payments' => [['method' => 'house_account', 'amount' => 50]],
                'print_receipt' => false,
            ])
            ->assertOk();

        $payment = \App\Models\Payment::where('order_id', $orderId)->where('method', 'house_account')->firstOrFail();
        $this->assertSame($shift->id, (int) $payment->shift_id);

        $ledger = CustomerCreditLedger::where('payment_id', $payment->id)->firstOrFail();
        $this->assertSame($shift->id, (int) $ledger->shift_id);
    }

    public function test_cash_repayment_without_shift_fails_for_non_owner_staff(): void
    {
        $this->approveCustomer(10000);
        $this->chargeCustomerCredit(5000);

        $this->manager->grantPermission('customers.credit.repay');
        Sanctum::actingAs($this->manager->fresh(), ['staff']);

        $this->postJson("/api/admin/customers/{$this->customer->id}/credit/repayments", [
            'amount_mvr' => 10,
            'method' => 'cash',
        ])
            ->assertStatus(422)
            ->assertJsonFragment(['message' => 'Open a shift to record cash — or record it as a bank transfer.']);
    }

    public function test_repayment_over_balance_is_rejected(): void
    {
        $this->approveCustomer(10000);
        $this->chargeCustomerCredit(5000);

        Sanctum::actingAs($this->owner, ['staff']);

        $this->postJson("/api/admin/customers/{$this->customer->id}/credit/repayments", [
            'amount_mvr' => 100,
            'method' => 'card',
            'reference' => 'CARD-1',
        ])
            ->assertStatus(422)
            ->assertJsonFragment(['message' => 'Repayment exceeds outstanding balance (MVR 50.00).']);
    }

    public function test_repayment_applies_fifo_to_oldest_invoice_first(): void
    {
        $this->approveCustomer(50000);
        $this->chargeCustomerCredit(5000);
        $this->chargeCustomerCredit(5000);

        $invoices = Invoice::where('customer_id', $this->customer->id)
            ->where('type', 'sale')
            ->orderBy('id')
            ->get();
        $this->assertCount(2, $invoices);

        $older = $invoices->first();
        $newer = $invoices->last();
        $older->update(['issue_date' => now()->subDays(10)->toDateString()]);
        $newer->update(['issue_date' => now()->subDays(2)->toDateString()]);

        $olderDue = $older->balanceDueLaar();
        $partialToNewerLaar = min(2500, $newer->balanceDueLaar());
        $repayLaar = $olderDue + $partialToNewerLaar;

        Sanctum::actingAs($this->owner, ['staff']);
        $this->postJson("/api/admin/customers/{$this->customer->id}/credit/repayments", [
            'amount_mvr' => $repayLaar / 100,
            'method' => 'bank_transfer',
            'reference' => 'FIFO-1',
        ])->assertCreated();

        $older->refresh();
        $newer->refresh();
        $this->assertSame($olderDue, (int) $older->amount_paid_laar);
        $this->assertSame('paid', $older->status);
        $this->assertSame($partialToNewerLaar, (int) $newer->amount_paid_laar);
        $this->assertSame('sent', $newer->status);
    }

    public function test_refund_reverses_customer_credit_balance(): void
    {
        $this->approveCustomer(50000);

        Sanctum::actingAs($this->staff, ['staff']);
        $this->postJson('/api/shifts/open', ['opening_cash' => 100])->assertCreated();
        $orderId = $this->createOrder($this->customer->id);
        $order = \App\Models\Order::findOrFail($orderId);
        $orderTotalMvr = ((int) ($order->total_laar ?? round((float) $order->total * 100))) / 100;

        $this->withHeader('X-Device-Identifier', $this->device->identifier)
            ->postJson("/api/orders/{$orderId}/payments", [
                'payments' => [['method' => 'house_account', 'amount' => $orderTotalMvr]],
                'print_receipt' => false,
            ])
            ->assertOk();

        $this->customer->refresh();
        $chargedLaar = (int) $this->customer->credit_balance_laar;
        $this->assertGreaterThan(0, $chargedLaar);

        Sanctum::actingAs($this->owner, ['staff']);
        $this->postJson('/api/shifts/open', ['opening_cash' => 100])->assertCreated();

        $this->postJson("/api/orders/{$orderId}/refunds", [
            'amount' => $orderTotalMvr,
            'reason_category' => 'other', 'reason' => 'Customer complaint',
        ])->assertCreated();

        $this->customer->refresh();
        $this->assertSame(0, (int) $this->customer->credit_balance_laar);
        $this->assertTrue(
            CustomerCreditLedger::where('customer_id', $this->customer->id)
                ->where('type', 'refund_reversal')
                ->exists(),
        );
    }

    public function test_customer_credit_api_excludes_internal_credit_notes(): void
    {
        $this->approveCustomer(50000);
        Sanctum::actingAs($this->manager, ['staff']);
        $this->patchJson("/api/admin/customers/{$this->customer->id}/credit", [
            'action' => 'approve',
            'credit_limit_mvr' => 500,
            'credit_notes' => 'Internal staff note — must not leak',
        ])->assertOk();

        Sanctum::actingAs($this->customer->fresh(), ['customer']);

        $response = $this->getJson('/api/customer/credit')->assertOk();
        $credit = $response->json('credit');
        $this->assertIsArray($credit);
        $this->assertArrayNotHasKey('credit_notes', $credit);
        $this->assertArrayNotHasKey('notes', $credit);
    }

    private function approveCustomer(int $limitLaar, ?int $paymentTermsDays = null): void
    {
        Sanctum::actingAs($this->manager, ['staff']);
        $payload = [
            'action' => 'approve',
            'credit_limit_laar' => $limitLaar,
        ];
        if ($paymentTermsDays !== null) {
            $payload['credit_payment_terms_days'] = $paymentTermsDays;
        }
        $this->patchJson("/api/admin/customers/{$this->customer->id}/credit", $payload)->assertOk();
        $this->customer->refresh();
    }

    private function chargeCustomerCredit(int $amountLaar): void
    {
        Sanctum::actingAs($this->staff, ['staff']);
        if (Shift::where('user_id', $this->staff->id)->whereNull('closed_at')->doesntExist()) {
            $this->postJson('/api/shifts/open', ['opening_cash' => 100])->assertCreated();
        }

        $orderId = $this->createOrder($this->customer->id);
        $amountMvr = $amountLaar / 100;

        $this->withHeader('X-Device-Identifier', $this->device->identifier)
            ->postJson("/api/orders/{$orderId}/payments", [
                'payments' => [['method' => 'house_account', 'amount' => $amountMvr]],
                'print_receipt' => false,
            ])
            ->assertOk();

        $this->customer->refresh();
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

    public function test_duplicate_credit_charge_is_idempotent_for_same_payment(): void
    {
        $this->approveCustomer(50000);

        Sanctum::actingAs($this->staff, ['staff']);
        $this->postJson('/api/shifts/open', ['opening_cash' => 100])->assertCreated();

        $orderId = $this->createOrder($this->customer->id);

        $this->withHeader('X-Device-Identifier', $this->device->identifier)
            ->postJson("/api/orders/{$orderId}/payments", [
                'payments' => [['method' => 'house_account', 'amount' => 50]],
                'print_receipt' => false,
            ])
            ->assertOk();

        $payment = \App\Models\Payment::where('order_id', $orderId)->firstOrFail();
        $service = app(\App\Domains\Credit\Services\CreditLedgerService::class);

        $first = $service->recordCharge($this->customer->fresh(), \App\Models\Order::findOrFail($orderId), $payment, $this->staff);
        $second = $service->recordCharge($this->customer->fresh(), \App\Models\Order::findOrFail($orderId), $payment, $this->staff);

        $this->assertSame($first->id, $second->id);
        $this->assertSame(1, CustomerCreditLedger::where('payment_id', $payment->id)->where('type', 'charge')->count());
    }
}

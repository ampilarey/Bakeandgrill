<?php

declare(strict_types=1);

namespace Tests\Feature\Credit;

use App\Domains\Credit\Services\CreditOnlinePaymentService;
use App\Domains\Payments\Gateway\BmlConnectService;
use App\Domains\Payments\Services\PaymentService;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Customer;
use App\Models\CustomerCreditLedger;
use App\Models\Invoice;
use App\Models\Payment;
use App\Models\SmsLog;
use App\Models\User;
use App\Support\InvoicePagePresenter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Mockery;
use Tests\TestCase;

/**
 * Owner, 2026-10-05: "Is there any place to manage credit accounts" — "Yes
 * build. Including sms option payment links etc." One page under Customers
 * listing every account, a reminder text, a pay-link text, and the invoice
 * page's Pay online button that settles the credit ledger when BML confirms.
 */
class CreditAccountsPageTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        $this->owner = $this->makeOwner();
        Sanctum::actingAs($this->owner, ['staff']);
    }

    private function account(string $name, string $phone, array $attrs = []): Customer
    {
        return Customer::create(array_merge([
            'name' => $name,
            'phone' => $phone,
            'is_active' => true,
            'credit_enabled' => true,
            'credit_status' => 'active',
            'credit_limit_laar' => 500000,
            'credit_balance_laar' => 0,
            'credit_payment_terms_days' => 14,
            'credit_approved_at' => now(),
            'credit_approved_by' => $this->owner->id,
        ], $attrs));
    }

    private function creditInvoice(Customer $customer, int $totalLaar, string $dueDate, ?string $number = null): Invoice
    {
        static $n = 0;
        $n++;
        $invoice = Invoice::create([
            'invoice_number' => $number ?? sprintf('INV-CR-%03d', $n),
            'type' => 'sale',
            'status' => 'sent',
            'customer_id' => $customer->id,
            'created_by' => $this->owner->id,
            'subtotal_laar' => $totalLaar,
            'tax_laar' => 0,
            'discount_laar' => 0,
            'total_laar' => $totalLaar,
            'amount_paid_laar' => 0,
            'credited_laar' => 0,
            'written_off_laar' => 0,
            'subtotal' => $totalLaar / 100,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => $totalLaar / 100,
            'issue_date' => now()->subDays(20)->toDateString(),
            'due_date' => $dueDate,
            'notes' => 'Charged to customer credit account.',
        ]);
        $customer->update(['credit_balance_laar' => (int) $customer->credit_balance_laar + $totalLaar]);
        CustomerCreditLedger::create([
            'customer_id' => $customer->id,
            'type' => 'charge',
            'amount_laar' => $totalLaar,
            'balance_after_laar' => (int) $customer->fresh()->credit_balance_laar,
            'invoice_id' => $invoice->id,
            'method' => 'house_account',
            'recorded_by' => $this->owner->id,
            'notes' => 'test charge',
        ]);

        return $invoice;
    }

    // ── The list ───────────────────────────────────────────────────────

    public function test_lists_every_account_with_balance_overdue_and_totals(): void
    {
        $aisha = $this->account('Aisha', '+9607771111');
        $this->creditInvoice($aisha, 12000, now()->subDays(5)->toDateString());
        $this->creditInvoice($aisha, 3000, now()->addDays(5)->toDateString());
        $hold = $this->account('Hassan', '+9607772222', ['credit_status' => 'on_hold']);
        $this->creditInvoice($hold, 5000, now()->addDays(3)->toDateString());
        $this->account('Blocked Bob', '+9607773333', ['credit_enabled' => false, 'credit_status' => 'blocked', 'credit_balance_laar' => 700]);
        Customer::create(['name' => 'Nobody', 'phone' => '+9607774444', 'is_active' => true]);

        $res = $this->getJson('/api/admin/customers/credit-accounts')->assertOk();

        $this->assertSame(3, $res->json('total'));
        $this->assertSame(['Aisha', 'Hassan', 'Blocked Bob'], array_column($res->json('data'), 'name'));

        $row = $res->json('data.0');
        $this->assertSame('active', $row['status']);
        $this->assertEquals(150.0, $row['balance_mvr']);
        $this->assertEquals(5000.0, $row['limit_mvr']);
        $this->assertEquals(4850.0, $row['available_mvr']);
        $this->assertSame(14, $row['terms_days']);
        $this->assertSame(2, $row['open_invoices']);
        $this->assertSame(1, $row['overdue_invoices']);
        $this->assertEquals(120.0, $row['overdue_mvr']);
        $this->assertSame(now()->subDays(5)->toDateString(), $row['oldest_due_date']);
        $this->assertNull($row['last_paid_at']);

        $this->assertSame('blocked', $res->json('data.2.status'));

        $totals = $res->json('totals');
        $this->assertSame(3, $totals['accounts']);
        $this->assertSame(1, $totals['active']);
        $this->assertSame(1, $totals['on_hold']);
        $this->assertSame(1, $totals['blocked']);
        $this->assertSame(3, $totals['with_balance']);
        $this->assertSame(1, $totals['overdue']);
        $this->assertEquals(207.0, $totals['balance_mvr']);
        $this->assertEquals(120.0, $totals['overdue_mvr']);
    }

    public function test_filters_and_search_narrow_the_list(): void
    {
        $aisha = $this->account('Aisha', '+9607771111');
        $this->creditInvoice($aisha, 12000, now()->subDays(5)->toDateString());
        $this->account('Hassan', '+9607772222', ['credit_status' => 'on_hold']);
        $this->account('Blocked Bob', '+9607773333', ['credit_enabled' => false, 'credit_status' => 'blocked']);

        $names = fn (string $qs) => array_column($this->getJson('/api/admin/customers/credit-accounts?' . $qs)->assertOk()->json('data'), 'name');

        $this->assertSame(['Aisha'], $names('filter=active'));
        $this->assertSame(['Hassan'], $names('filter=on_hold'));
        $this->assertSame(['Blocked Bob'], $names('filter=blocked'));
        $this->assertSame(['Aisha'], $names('filter=overdue'));
        $this->assertSame(['Aisha'], $names('filter=with_balance'));
        $this->assertSame(['Hassan'], $names('q=has'));
        $this->assertSame(['Blocked Bob'], $names('q=7773333'));
        $this->getJson('/api/admin/customers/credit-accounts?filter=nope')->assertStatus(422);
    }

    public function test_the_page_needs_the_credit_manage_permission(): void
    {
        Sanctum::actingAs($this->makeStaff('staff'), ['staff']);
        $this->getJson('/api/admin/customers/credit-accounts')->assertStatus(403);
    }

    // ── Reminder and pay-link texts ────────────────────────────────────

    public function test_reminder_names_the_oldest_open_invoice_and_links_its_page(): void
    {
        $aisha = $this->account('Aisha', '+9607771111');
        $old = $this->creditInvoice($aisha, 12000, now()->subDays(5)->toDateString(), 'INV-OLD');
        $this->creditInvoice($aisha, 3000, now()->addDays(5)->toDateString(), 'INV-NEW');

        $this->postJson("/api/admin/customers/{$aisha->id}/credit/remind")->assertOk()
            ->assertJsonPath('message', 'Reminder sent.');

        $log = SmsLog::where('customer_id', $aisha->id)->where('type', 'credit_payment_reminder')->firstOrFail();
        $this->assertStringContainsString('INV-OLD', $log->message);
        $this->assertStringNotContainsString('INV-NEW', $log->message);
        $this->assertStringContainsString('/invoices/' . $old->token, $log->message);
        $this->assertStringContainsString('120.00', $log->message);
        $this->assertSame('invoice', $log->reference_type);
        $this->assertSame((string) $old->id, (string) $log->reference_id);
    }

    public function test_reminder_without_an_invoice_states_the_balance_and_a_custom_text_is_used_as_written(): void
    {
        $aisha = $this->account('Aisha', '+9607771111', ['credit_balance_laar' => 4550]);

        $this->postJson("/api/admin/customers/{$aisha->id}/credit/remind")->assertOk();
        $first = SmsLog::where('customer_id', $aisha->id)->latest('id')->firstOrFail();
        $this->assertStringContainsString('balance is MVR 45.50', $first->message);

        $this->travel(1)->minutes();
        $this->postJson("/api/admin/customers/{$aisha->id}/credit/remind", [
            'message' => 'Hi {{name}}, please clear MVR {{balance}} by Friday. Bake & Grill',
        ])->assertOk();
        $second = SmsLog::where('customer_id', $aisha->id)->latest('id')->firstOrFail();
        $this->assertSame('Hi Aisha, please clear MVR 45.50 by Friday. Bake & Grill', $second->message);
    }

    public function test_reminder_refuses_a_customer_who_owes_nothing_or_opted_out(): void
    {
        $clear = $this->account('Clear', '+9607771111');
        $this->postJson("/api/admin/customers/{$clear->id}/credit/remind")
            ->assertStatus(422)->assertJsonPath('errors.message.0', 'This customer owes nothing.');

        $optOut = $this->account('Quiet', '+9607772222', ['credit_balance_laar' => 1000, 'sms_opt_out' => true]);
        $this->postJson("/api/admin/customers/{$optOut->id}/credit/remind")
            ->assertStatus(422)->assertJsonPath('errors.message.0', 'This customer has opted out of SMS and cannot be texted.');

        $this->assertSame(0, SmsLog::count());
    }

    public function test_pay_link_needs_an_open_invoice_and_points_at_its_page(): void
    {
        $noInvoice = $this->account('Balance only', '+9607771111', ['credit_balance_laar' => 1000]);
        $this->postJson("/api/admin/customers/{$noInvoice->id}/credit/pay-link")->assertStatus(422);

        $aisha = $this->account('Aisha', '+9607772222');
        $invoice = $this->creditInvoice($aisha, 12000, now()->addDays(5)->toDateString(), 'INV-PAY');

        $this->postJson("/api/admin/customers/{$aisha->id}/credit/pay-link")->assertOk()
            ->assertJsonPath('message', 'Pay link sent.');

        $log = SmsLog::where('customer_id', $aisha->id)->firstOrFail();
        $this->assertStringContainsString('INV-PAY', $log->message);
        $this->assertStringContainsString('120.00', $log->message);
        $this->assertStringContainsString('/invoices/' . $invoice->token, $log->message);
        $this->assertStringContainsString('online by card', $log->message);
    }

    // ── Paying the invoice online ──────────────────────────────────────

    public function test_invoice_page_offers_pay_online_for_a_credit_invoice(): void
    {
        $aisha = $this->account('Aisha', '+9607771111');
        $invoice = $this->creditInvoice($aisha, 12000, now()->addDays(5)->toDateString());

        $cta = InvoicePagePresenter::present($invoice->fresh())['pay_cta'];
        $this->assertSame('credit', $cta['kind']);
        $this->assertStringEndsWith('/invoices/' . $invoice->token . '/pay', $cta['href']);

        $this->get('/invoices/' . $invoice->token)->assertOk()
            ->assertSee('data-pay-cta="credit"', false)
            ->assertSee('Pay online');
    }

    public function test_pay_button_starts_a_bml_payment_and_returns_to_the_invoice_page(): void
    {
        $aisha = $this->account('Aisha', '+9607771111');
        $invoice = $this->creditInvoice($aisha, 12000, now()->addDays(5)->toDateString());

        $mock = Mockery::mock(BmlConnectService::class);
        $mock->shouldReceive('normalizeLocalId')->andReturnUsing(fn ($v) => (string) $v);
        $mock->shouldReceive('createPayment')->once()->withArgs(function ($amount, $localId, $currency, $returnUrl) use ($invoice) {
            return $amount === 12000
                && str_contains((string) $returnUrl, 'invoiceId=' . $invoice->id)
                && str_contains((string) $returnUrl, 'invoiceToken=' . $invoice->token);
        })->andReturn(['url' => 'https://bml.test/pay/c1', 'transactionId' => 'txn-c-1', 'id' => 'txn-c-1']);
        $this->app->instance(BmlConnectService::class, $mock);

        $this->post('/invoices/' . $invoice->token . '/pay')
            ->assertRedirect('https://bml.test/pay/c1');

        $payment = Payment::where('invoice_id', $invoice->id)->firstOrFail();
        $this->assertSame(12000, (int) $payment->amount_laar);
        $this->assertNull($payment->order_id);
    }

    public function test_pay_button_refuses_an_ordinary_invoice(): void
    {
        $plain = Invoice::create([
            'invoice_number' => 'INV-PLAIN', 'type' => 'sale', 'status' => 'sent',
            'customer_id' => $this->account('Walk in', '+9607771111')->id, 'created_by' => $this->owner->id,
            'subtotal_laar' => 1000, 'tax_laar' => 0, 'discount_laar' => 0, 'total_laar' => 1000,
            'amount_paid_laar' => 0, 'credited_laar' => 0, 'written_off_laar' => 0,
            'subtotal' => 10, 'tax_amount' => 0, 'discount_amount' => 0, 'total' => 10,
            'issue_date' => now()->toDateString(), 'notes' => 'Just a sale.',
        ]);

        $this->post('/invoices/' . $plain->token . '/pay')
            ->assertRedirect(route('invoices.show', $plain->token))
            ->assertSessionHas('error', 'This invoice cannot be paid online.');
        $this->assertSame(0, Payment::count());
    }

    public function test_a_confirmed_online_payment_settles_the_credit_ledger_once(): void
    {
        $aisha = $this->account('Aisha', '+9607771111');
        $invoice = $this->creditInvoice($aisha, 12000, now()->addDays(5)->toDateString());
        $this->assertSame(12000, (int) $aisha->fresh()->credit_balance_laar);

        $mock = Mockery::mock(BmlConnectService::class);
        $mock->shouldReceive('normalizeLocalId')->andReturnUsing(fn ($v) => (string) $v);
        $mock->shouldReceive('createPayment')->once()->andReturn(['url' => 'https://bml.test/pay/c2', 'transactionId' => 'txn-c-2', 'id' => 'txn-c-2']);
        $mock->shouldReceive('getTransactionStatus')->with('txn-c-2')->andReturn(['state' => 'CONFIRMED', 'transactionId' => 'txn-c-2']);
        $this->app->instance(BmlConnectService::class, $mock);

        app(PaymentService::class)->initiateBmlInvoicePayment($invoice);
        $payment = Payment::where('invoice_id', $invoice->id)->firstOrFail();
        $payment->update(['status' => 'initiated', 'provider_transaction_id' => 'txn-c-2']);

        // The customer comes back from the gateway: the return URL confirms
        // with BML and lands on the invoice page with a thank-you.
        $this->get(route('bml.return', [
            'invoiceId' => $invoice->id, 'invoiceToken' => $invoice->token,
            'state' => 'CONFIRMED', 'transactionId' => 'txn-c-2',
        ]))->assertRedirect(route('invoices.show', $invoice->token))
            ->assertSessionHas('success');

        // Twice more (webhook, refresh): still one repayment.
        app(CreditOnlinePaymentService::class)->settleConfirmedBmlPayment($payment->fresh(), $this->owner);
        app(CreditOnlinePaymentService::class)->settleConfirmedBmlPayment($payment->fresh(), $this->owner);

        $this->assertSame(1, CustomerCreditLedger::where('payment_id', $payment->id)->where('type', 'payment')->count());
        $this->assertSame(0, (int) $aisha->fresh()->credit_balance_laar);
        $invoice->refresh();
        $this->assertSame('paid', $invoice->status);
        $this->assertSame(12000, (int) $invoice->amount_paid_laar);
        $this->assertSame('confirmed', (string) $payment->fresh()->status);

        // Paid: no more Pay button, no more pay link.
        $this->assertNull(InvoicePagePresenter::present($invoice->fresh())['pay_cta']);
        $this->postJson("/api/admin/customers/{$aisha->id}/credit/pay-link")->assertStatus(422);
        $this->assertNotNull($this->getJson('/api/admin/customers/credit-accounts')->json('data.0.last_paid_at'));
    }

    public function test_an_unconfirmed_return_shows_an_error_and_keeps_the_balance(): void
    {
        $aisha = $this->account('Aisha', '+9607771111');
        $invoice = $this->creditInvoice($aisha, 12000, now()->addDays(5)->toDateString());

        $this->get(route('bml.return', [
            'invoiceId' => $invoice->id, 'invoiceToken' => $invoice->token,
            'state' => 'CANCELLED', 'transactionId' => 'txn-x',
        ]))->assertRedirect(route('invoices.show', $invoice->token))
            ->assertSessionHas('error');

        $this->assertSame(12000, (int) $aisha->fresh()->credit_balance_laar);
    }
}

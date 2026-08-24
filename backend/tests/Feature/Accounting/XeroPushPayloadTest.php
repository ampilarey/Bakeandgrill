<?php

declare(strict_types=1);

namespace Tests\Feature\Accounting;

use App\Domains\Accounting\Services\XeroSyncService;
use App\Models\Expense;
use App\Models\ExpenseCategory;
use App\Models\Invoice;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * What actually reaches Xero.
 *
 * Xero is where the audited numbers go to become the books, so a mapping bug
 * here reproduces in the accounts everything the code gets right. Two defects
 * lived in this payload: expenses were dated the day of the *push* (the code
 * read `$expense->date`, which is not a column, so the `?? now()` fallback
 * always fired), and neither push said anything about tax — leaving Xero to
 * derive GST from whatever default sits on the account there, which need not
 * match what was charged and declared.
 */
class XeroPushPayloadTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'services.xero.client_id' => 'test-client',
            'services.xero.client_secret' => 'test-secret',
        ]);

        // Both pushes resolve a live connection for the token and tenant
        // header before building any payload.
        \App\Models\XeroConnection::create([
            'tenant_id' => 'tenant-1',
            'tenant_name' => 'Bake & Grill Test',
            'access_token' => 'test-access-token',
            'refresh_token' => 'test-refresh-token',
            'token_expires_at' => now()->addHour(),
            'connected_at' => now(),
            'active' => true,
        ]);
    }

    /** @return array<string, mixed> The JSON body of the single push request. */
    private function capturePush(callable $push): array
    {
        $captured = [];

        Http::fake([
            '*' => function ($request) use (&$captured) {
                $captured = $request->data();

                return Http::response([
                    'Invoices' => [['InvoiceID' => 'xero-inv-1']],
                    'BankTransactions' => [['BankTransactionID' => 'xero-txn-1']],
                ], 200);
            },
        ]);

        $push();

        return $captured;
    }

    private function makeExpense(string $expenseDate): Expense
    {
        $user = User::factory()->create();
        $category = ExpenseCategory::create([
            'slug' => 'test-cat',
            'name' => 'Test category',
            'is_active' => true,
        ]);

        return Expense::create([
            'expense_number' => 'EXP-TEST-1',
            'expense_category_id' => $category->id,
            'user_id' => $user->id,
            'description' => 'Flour delivery',
            // MVR 108 gross with MVR 8 of GST inside it.
            'amount_laar' => 10800,
            'amount' => 108.00,
            'tax_laar' => 800,
            'tax_amount' => 8.00,
            'expense_date' => $expenseDate,
            'status' => 'approved',
        ]);
    }

    public function test_an_expense_is_dated_when_it_was_incurred_not_when_it_was_pushed(): void
    {
        // THE test. Push July's expense in August and it must still land in
        // July, or that month's books come out empty and August is
        // double-weighted.
        $expense = $this->makeExpense('2026-07-15');

        $body = $this->capturePush(fn () => app(XeroSyncService::class)->pushExpense($expense));

        $this->assertSame('2026-07-15', $body['BankTransactions'][0]['Date']);
    }

    public function test_an_expense_states_its_own_gst_rather_than_leaving_xero_to_guess(): void
    {
        // MVR 108 gross, MVR 8 GST → MVR 100 exclusive + an explicit tax
        // amount. Sent Inclusive with no tax information, Xero would apply
        // whatever rate the expense account defaults to.
        $expense = $this->makeExpense('2026-07-15');

        $body = $this->capturePush(fn () => app(XeroSyncService::class)->pushExpense($expense));

        $line = $body['BankTransactions'][0]['LineItems'][0];
        $this->assertSame('Exclusive', $body['BankTransactions'][0]['LineAmountTypes']);
        $this->assertSame(100.00, $line['UnitAmount']);
        $this->assertSame(8.00, $line['TaxAmount']);
    }

    public function test_an_invoice_states_the_tax_that_was_actually_charged(): void
    {
        // The invoice's own tax_laar — the figure GstReportService declares to
        // MIRA — rather than a gross lump for Xero to split.
        $invoice = Invoice::create([
            'invoice_number' => 'INV-TEST-1',
            'type' => 'sale',
            'status' => 'paid',
            'issue_date' => '2026-07-20',
            'due_date' => '2026-08-20',
            'subtotal_laar' => 10000,
            'tax_laar' => 800,
            'total_laar' => 10800,
            'subtotal' => 100.00,
            'tax_amount' => 8.00,
            'total' => 108.00,
        ]);

        $body = $this->capturePush(fn () => app(XeroSyncService::class)->pushInvoice($invoice));

        $line = $body['Invoices'][0]['LineItems'][0];
        $this->assertSame('Exclusive', $body['Invoices'][0]['LineAmountTypes']);
        $this->assertSame(100.00, $line['UnitAmount']);
        $this->assertSame(8.00, $line['TaxAmount']);
        // Regression guard on the old /100 bug: a 100 MVR invoice is 100.00,
        // never 1.00.
        $this->assertNotSame(1.0, $line['UnitAmount']);
    }

    public function test_a_configured_tax_type_is_sent_so_xero_honours_the_amount(): void
    {
        // Xero applies an explicit TaxAmount only against a rate it knows.
        // Unset, the account's own default stays in charge — which is why the
        // key exists rather than a hardcoded guess at someone's Xero org.
        config(['services.xero.expense_tax_type' => 'INPUT2']);
        $expense = $this->makeExpense('2026-07-15');

        $body = $this->capturePush(fn () => app(XeroSyncService::class)->pushExpense($expense));

        $this->assertSame('INPUT2', $body['BankTransactions'][0]['LineItems'][0]['TaxType']);
    }

    public function test_no_tax_type_is_sent_when_none_is_configured(): void
    {
        $expense = $this->makeExpense('2026-07-15');

        $body = $this->capturePush(fn () => app(XeroSyncService::class)->pushExpense($expense));

        $this->assertArrayNotHasKey('TaxType', $body['BankTransactions'][0]['LineItems'][0]);
    }
}

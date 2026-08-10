<?php

declare(strict_types=1);

namespace Tests\Feature\Invoices;

use App\Models\Customer;
use App\Models\Invoice;
use App\Models\InvoiceItem;
use App\Models\Item;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Receipt;
use App\Models\TradeAccount;
use App\Models\TradeDelivery;
use App\Models\TradeDeliveryLine;
use App\Models\TradeInvoiceAllocation;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class InvoiceStage5PageTest extends TestCase
{
    use RefreshDatabase;

    private function saleInvoice(array $overrides = []): Invoice
    {
        $customer = $this->makeCustomer([
            'phone' => '+9607'.str_pad((string) random_int(100000, 999999), 6, '0'),
        ]);
        $order = $this->makeOrder($customer, [
            'order_number' => 'BG-INV-'.Str::upper(Str::random(4)),
            'status' => 'pending',
            'payment_status' => 'unpaid',
            'paid_at' => null,
            'total' => 100,
            'total_laar' => 10000,
        ]);

        $defaults = [
            'invoice_number' => 'INV-S5-'.Str::upper(Str::random(4)),
            'token' => Str::random(48),
            'type' => 'sale',
            'status' => 'sent',
            'order_id' => $order->id,
            'customer_id' => $customer->id,
            'subtotal' => 100,
            'total' => 100,
            'subtotal_laar' => 10000,
            'total_laar' => 10000,
            'amount_paid_laar' => 0,
            'issue_date' => now()->toDateString(),
            'due_date' => now()->subDays(5)->toDateString(),
        ];
        $merged = array_merge($defaults, $overrides);
        if (array_key_exists('order_id', $overrides) && $overrides['order_id'] === null) {
            $merged['order_id'] = null;
        }

        return Invoice::create($merged);
    }

    public function test_pay_appears_for_payable_sale_invoice_and_routes_to_pay_page(): void
    {
        $invoice = $this->saleInvoice();
        $html = $this->get('/invoices/'.$invoice->token)->assertOk()->getContent();

        $this->assertStringContainsString('data-pay-cta="sale"', $html);
        $this->assertStringContainsString('/pay/', $html);
        $this->assertStringContainsString('Overdue by 5 days', $html);
        $this->assertStringContainsString('data-overdue-days="5"', $html);

        $receipt = Receipt::query()->where('order_id', $invoice->order_id)->first();
        $this->assertNotNull($receipt);
        $this->assertStringContainsString('/pay/'.$receipt->token, $html);
    }

    public function test_pay_routes_to_trade_portal_for_trade_invoice(): void
    {
        $customer = $this->makeCustomer();
        $account = TradeAccount::create([
            'customer_id' => $customer->id,
            'shop_name' => 'Corner Shop',
            'contact_phone' => '+9607700001',
            'missing_policy' => TradeAccount::MISSING_CHARGE,
            'settlement_mode' => TradeAccount::SETTLEMENT_SALE_OR_RETURN,
            'payment_terms_days' => 14,
            'is_active' => true,
        ]);
        $invoice = Invoice::create([
            'invoice_number' => 'INV-TR-'.Str::upper(Str::random(4)),
            'token' => Str::random(48),
            'type' => 'sale',
            'status' => 'sent',
            'customer_id' => $customer->id,
            'trade_account_id' => $account->id,
            'subtotal' => 4200,
            'total' => 4200,
            'subtotal_laar' => 420000,
            'total_laar' => 420000,
            'amount_paid_laar' => 0,
            'issue_date' => now()->toDateString(),
            'due_date' => now()->addDays(7)->toDateString(),
        ]);

        $html = $this->get('/invoices/'.$invoice->token)->assertOk()->getContent();
        $this->assertStringContainsString('data-pay-cta="trade"', $html);
        $this->assertStringContainsString('/order/account/statement', $html);
        $this->assertStringNotContainsString('data-pay-cta="sale"', $html);
    }

    public function test_pay_absent_for_paid_void_cancelled_credit_note_and_purchase(): void
    {
        foreach (['paid', 'void', 'cancelled'] as $status) {
            $invoice = $this->saleInvoice([
                'status' => $status,
                'amount_paid_laar' => $status === 'paid' ? 10000 : 0,
                'paid_at' => $status === 'paid' ? now() : null,
            ]);
            $html = $this->get('/invoices/'.$invoice->token)->assertOk()->getContent();
            $this->assertStringNotContainsString('data-pay-cta=', $html, "status {$status}");
        }

        $purchase = $this->saleInvoice(['type' => 'purchase', 'order_id' => null]);
        $this->assertStringNotContainsString(
            'data-pay-cta=',
            $this->get('/invoices/'.$purchase->token)->assertOk()->getContent(),
        );

        $cn = $this->saleInvoice([
            'type' => 'credit_note',
            'order_id' => null,
            'total' => 20,
            'total_laar' => 2000,
        ]);
        $this->assertStringNotContainsString(
            'data-pay-cta=',
            $this->get('/invoices/'.$cn->token)->assertOk()->getContent(),
        );
    }

    public function test_payment_history_has_no_gateway_references(): void
    {
        $invoice = $this->saleInvoice();
        Payment::create([
            'order_id' => $invoice->order_id,
            'method' => 'cash',
            'amount' => 40,
            'amount_laar' => 4000,
            'status' => 'completed',
            'provider_transaction_id' => 'GW-SECRET-999',
            'reference_number' => 'REF-SECRET',
            'gateway' => 'bml',
            'processed_at' => now(),
        ]);

        $html = $this->get('/invoices/'.$invoice->token)->assertOk()->getContent();
        $this->assertStringContainsString('data-payment-history', $html);
        $this->assertStringContainsString('cash', $html);
        $this->assertStringNotContainsString('GW-SECRET-999', $html);
        $this->assertStringNotContainsString('REF-SECRET', $html);
        $this->assertStringNotContainsString('provider_transaction', $html);
    }

    public function test_credit_note_reduces_displayed_balance(): void
    {
        $invoice = $this->saleInvoice([
            'due_date' => now()->addDays(10)->toDateString(),
        ]);
        Invoice::create([
            'invoice_number' => 'CN-'.Str::upper(Str::random(4)),
            'token' => Str::random(48),
            'type' => 'credit_note',
            'status' => 'sent',
            'parent_invoice_id' => $invoice->id,
            'customer_id' => $invoice->customer_id,
            'subtotal' => 30,
            'total' => 30,
            'subtotal_laar' => 3000,
            'total_laar' => 3000,
            'amount_paid_laar' => 0,
            'issue_date' => now()->toDateString(),
            'credit_note_reason' => 'Billing correction',
        ]);

        $html = $this->get('/invoices/'.$invoice->token)->assertOk()->getContent();
        $this->assertStringContainsString('data-credit-note', $html);
        $this->assertMatchesRegularExpression('/data-balance-due[\s\S]*MVR 70\.00/', $html);
        $this->assertStringNotContainsString('GW-', $html);
    }

    public function test_overdue_by_days_correct_without_mark_overdue_command(): void
    {
        $invoice = $this->saleInvoice([
            'status' => 'sent', // not marked overdue by command
            'due_date' => now()->subDays(3)->toDateString(),
        ]);
        $html = $this->get('/invoices/'.$invoice->token)->assertOk()->getContent();
        $this->assertStringContainsString('Overdue by 3 days', $html);
        $this->assertSame('sent', $invoice->fresh()->status);
    }

    public function test_trade_invoice_lists_deliveries(): void
    {
        $customer = $this->makeCustomer();
        $account = TradeAccount::create([
            'customer_id' => $customer->id,
            'shop_name' => 'Harbour Mart',
            'contact_phone' => '+9607700002',
            'missing_policy' => TradeAccount::MISSING_CHARGE,
            'settlement_mode' => TradeAccount::SETTLEMENT_SALE_OR_RETURN,
            'payment_terms_days' => 14,
            'is_active' => true,
        ]);
        $item = $this->makeItem(false, 10, ['name' => 'Trade loaf']);
        $invoice = Invoice::create([
            'invoice_number' => 'INV-DEL-'.Str::upper(Str::random(4)),
            'token' => Str::random(48),
            'type' => 'sale',
            'status' => 'sent',
            'customer_id' => $customer->id,
            'trade_account_id' => $account->id,
            'subtotal' => 200,
            'total' => 200,
            'subtotal_laar' => 20000,
            'total_laar' => 20000,
            'amount_paid_laar' => 0,
            'issue_date' => now()->toDateString(),
        ]);
        $delivery = TradeDelivery::create([
            'trade_account_id' => $account->id,
            'delivery_number' => 'TD-1001',
            'status' => TradeDelivery::STATUS_INVOICED,
            'dispatched_at' => now()->subDay(),
            'idempotency_key' => 'td-'.Str::random(8),
        ]);
        $line = TradeDeliveryLine::create([
            'trade_delivery_id' => $delivery->id,
            'item_id' => $item->id,
            'qty_sent' => 10,
            'unit_price_laar' => 2000,
            'unit_cost_laar' => 800,
            'qty_sold' => 10,
        ]);
        TradeInvoiceAllocation::create([
            'invoice_id' => $invoice->id,
            'trade_delivery_line_id' => $line->id,
            'qty_invoiced' => 10,
            'amount_laar' => 20000,
            'line_kind' => TradeInvoiceAllocation::KIND_SOLD,
        ]);

        $html = $this->get('/invoices/'.$invoice->token)->assertOk()->getContent();
        $this->assertStringContainsString('data-trade-deliveries', $html);
        $this->assertStringContainsString('TD-1001', $html);
        $this->assertStringContainsString('Trade loaf', $html);
    }

    public function test_invoice_complaint_uses_bill_categories_only(): void
    {
        $invoice = $this->saleInvoice(['due_date' => now()->addDay()->toDateString()]);
        $html = $this->get('/invoices/'.$invoice->token)->assertOk()->getContent();
        $this->assertStringContainsString('Something wrong with this bill?', $html);
        $this->assertStringContainsString('bill_wrong_amount', $html);
        $this->assertStringNotContainsString('food_quality', $html);
        $this->assertStringNotContainsString('data-star=', $html);
    }
}

<?php

declare(strict_types=1);

namespace Tests\Feature\Console;

use App\Models\Customer;
use App\Models\CustomerCreditLedger;
use App\Models\GiftCard;
use App\Models\Invoice;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Payment;
use App\Models\TradeAccount;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class PurgeOrdersCommandTest extends TestCase
{
    use RefreshDatabase;

    #[Test]
    public function purge_deletes_order_payments_but_keeps_trade_invoice_payments(): void
    {
        $order = Order::create([
            'order_number' => 'PURGE-ORD-1',
            'type' => 'pos',
            'status' => 'paid',
            'subtotal' => 10,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 10,
            'total_laar' => 1000,
        ]);
        OrderItem::create([
            'order_id' => $order->id,
            'item_name' => 'Test item',
            'quantity' => 1,
            'unit_price' => 10,
            'total_price' => 10,
            'status' => 'pending',
        ]);
        $orderPayment = Payment::create([
            'idempotency_key' => 'purge-order-pay-1',
            'order_id' => $order->id,
            'method' => 'cash',
            'amount' => 10,
            'amount_laar' => 1000,
            'status' => 'confirmed',
            'processed_at' => now(),
        ]);

        $customer = Customer::create([
            'name' => 'Wholesale Shop',
            'phone' => '+9607700999',
            'is_active' => true,
            'credit_enabled' => true,
            'credit_status' => 'active',
            'credit_limit_laar' => 1_000_000,
            'credit_balance_laar' => 25000,
        ]);
        $account = TradeAccount::create([
            'customer_id' => $customer->id,
            'shop_name' => 'Wholesale Shop',
            'is_active' => true,
        ]);
        $invoice = Invoice::create([
            'invoice_number' => 'TI-PURGE-1',
            'type' => 'sale',
            'status' => 'paid',
            'is_tax_invoice' => true,
            'customer_id' => $customer->id,
            'trade_account_id' => $account->id,
            'subtotal_laar' => 23148,
            'tax_laar' => 1852,
            'total_laar' => 25000,
            'amount_paid_laar' => 25000,
            'subtotal' => 231.48,
            'tax_amount' => 18.52,
            'total' => 250.00,
            'issue_date' => now()->toDateString(),
            'paid_at' => now(),
            'notes' => 'Wholesale consignment — charged to customer credit account.',
        ]);
        $invoicePayment = Payment::create([
            'idempotency_key' => 'purge-inv-pay-001',
            'order_id' => null,
            'invoice_id' => $invoice->id,
            'method' => 'cash',
            'amount' => 250,
            'amount_laar' => 25000,
            'status' => 'confirmed',
            'processed_at' => now(),
        ]);
        $ledger = CustomerCreditLedger::create([
            'customer_id' => $customer->id,
            'type' => 'payment',
            'amount_laar' => -25000,
            'balance_after_laar' => 0,
            'invoice_id' => $invoice->id,
            'payment_id' => $invoicePayment->id,
            'method' => 'cash',
            'notes' => 'Wholesale invoice repayment',
        ]);

        $exit = Artisan::call('orders:purge', ['--force' => true]);
        $output = Artisan::output();

        $this->assertSame(0, $exit);
        $this->assertDatabaseMissing('payments', ['id' => $orderPayment->id]);
        $this->assertDatabaseMissing('orders', ['id' => $order->id]);
        $this->assertDatabaseMissing('order_items', ['order_id' => $order->id]);

        $kept = Payment::find($invoicePayment->id);
        $this->assertNotNull($kept, 'Trade invoice payment must survive orders:purge');
        $this->assertSame($invoice->id, (int) $kept->invoice_id);
        $this->assertNull($kept->order_id);

        $invoice->refresh();
        $this->assertSame(25000, (int) $invoice->amount_paid_laar);
        $this->assertSame('paid', $invoice->status);

        $ledger->refresh();
        $this->assertSame(-25000, (int) $ledger->amount_laar);
        $this->assertSame($invoicePayment->id, (int) $ledger->payment_id);

        $this->assertStringContainsString('payment', strtolower($output));
        $this->assertMatchesRegularExpression('/deleted\s+1/i', $output);
        $this->assertMatchesRegularExpression('/kept\s+1/i', $output);
    }

    #[Test]
    public function purge_still_refuses_live_production_without_flag(): void
    {
        $src = file_get_contents(app_path('Console/Commands/PurgeOrdersCommand.php'));
        $this->assertIsString($src);
        $this->assertStringContainsString('--allow-production', $src);
        $this->assertStringContainsString('isLiveProductionInstall', $src);
        $this->assertStringContainsString('Refusing to purge on the live site', $src);
        $this->assertStringContainsString('test.bakeandgrill', $src);
        $this->assertStringContainsString('/public_html', $src);
    }

    #[Test]
    public function purge_keeps_gift_card_transactions_without_order_id(): void
    {
        if (! Schema::hasTable('gift_card_transactions')) {
            $this->markTestSkipped('gift_card_transactions missing');
        }

        $order = Order::create([
            'order_number' => 'PURGE-GC-1',
            'type' => 'pos',
            'status' => 'paid',
            'subtotal' => 5,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 5,
            'total_laar' => 500,
        ]);
        $card = GiftCard::create([
            'code_hash' => hash('sha256', 'purge-gc-test'),
            'code_last4' => 'PG01',
            'initial_balance' => 100,
            'current_balance' => 95,
            'status' => 'active',
        ]);
        $orderTxnId = DB::table('gift_card_transactions')->insertGetId([
            'gift_card_id' => $card->id,
            'order_id' => $order->id,
            'type' => 'redeem',
            'amount' => 5,
            'balance_after' => 95,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $keptId = DB::table('gift_card_transactions')->insertGetId([
            'gift_card_id' => $card->id,
            'order_id' => null,
            'type' => 'load',
            'amount' => 100,
            'balance_after' => 100,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        Artisan::call('orders:purge', ['--force' => true]);

        $this->assertDatabaseMissing('gift_card_transactions', ['id' => $orderTxnId]);
        $this->assertDatabaseHas('gift_card_transactions', ['id' => $keptId, 'order_id' => null]);
    }
}

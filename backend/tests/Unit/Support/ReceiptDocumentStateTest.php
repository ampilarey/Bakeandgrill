<?php

declare(strict_types=1);

namespace Tests\Unit\Support;

use App\Models\Order;
use App\Models\Payment;
use App\Support\ReceiptDocumentState;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ReceiptDocumentStateTest extends TestCase
{
    use RefreshDatabase;

    public function test_prepaid_dine_in_open_visit_shows_prepaid_online_not_final_paid(): void
    {
        $order = Order::create([
            'order_number' => 'BG-PREPAID-1',
            'type' => 'dine_in',
            'status' => 'pending',
            'payment_status' => 'paid',
            'user_id' => null,
            'subtotal' => 100,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 100,
            'total_laar' => 10000,
            'paid_at' => now(),
        ]);

        Payment::create([
            'order_id' => $order->id,
            'method' => 'bml_connect',
            'gateway' => 'bml',
            'amount' => 100,
            'amount_laar' => 10000,
            'status' => 'confirmed',
            'processed_at' => now(),
        ]);

        $doc = ReceiptDocumentState::forOrder($order->fresh('payments'));

        $this->assertSame('Prepayment', $doc['doc_title']);
        $this->assertSame('Prepaid online', $doc['badge']);
        $this->assertFalse($doc['is_final_paid']);
        $this->assertStringContainsString('dine-in visit is finished', (string) $doc['banner_text']);
        $this->assertStringNotContainsString('Payment confirmed', (string) $doc['banner_text']);
    }

    public function test_prepaid_dine_in_with_addons_shows_balance_due(): void
    {
        $order = Order::create([
            'order_number' => 'BG-PREPAID-2',
            'type' => 'dine_in',
            'status' => 'pending',
            'payment_status' => 'partial',
            'user_id' => null,
            'subtotal' => 150,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 150,
            'total_laar' => 15000,
            'paid_at' => now(),
        ]);

        Payment::create([
            'order_id' => $order->id,
            'method' => 'bml_connect',
            'gateway' => 'bml',
            'amount' => 100,
            'amount_laar' => 10000,
            'status' => 'confirmed',
            'processed_at' => now(),
        ]);

        $doc = ReceiptDocumentState::forOrder($order->fresh('payments'));

        $this->assertSame('Bill', $doc['doc_title']);
        $this->assertSame('Balance due', $doc['badge']);
        $this->assertSame(50.0, $doc['balance_due']);
        $this->assertFalse($doc['is_final_paid']);
        $this->assertStringContainsString('MVR 50.00 remaining', (string) $doc['banner_text']);
    }

    public function test_completed_prepaid_dine_in_shows_final_paid_receipt(): void
    {
        $order = Order::create([
            'order_number' => 'BG-PREPAID-3',
            'type' => 'dine_in',
            'status' => 'completed',
            'payment_status' => 'paid',
            'user_id' => null,
            'subtotal' => 100,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 100,
            'total_laar' => 10000,
            'paid_at' => now(),
        ]);

        $doc = ReceiptDocumentState::forOrder($order);

        $this->assertSame('Receipt', $doc['doc_title']);
        $this->assertSame('Paid', $doc['badge']);
        $this->assertTrue($doc['is_final_paid']);
        $this->assertStringContainsString('Payment confirmed', (string) $doc['banner_text']);
    }

    public function test_online_pickup_still_shows_final_paid(): void
    {
        $order = Order::create([
            'order_number' => 'BG-PICKUP-1',
            'type' => 'online_pickup',
            'status' => 'pending',
            'payment_status' => 'paid',
            'user_id' => null,
            'subtotal' => 40,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 40,
            'total_laar' => 4000,
            'paid_at' => now(),
        ]);

        $doc = ReceiptDocumentState::forOrder($order);

        $this->assertSame('Receipt', $doc['doc_title']);
        $this->assertSame('Paid', $doc['badge']);
        $this->assertTrue($doc['is_final_paid']);
    }
}

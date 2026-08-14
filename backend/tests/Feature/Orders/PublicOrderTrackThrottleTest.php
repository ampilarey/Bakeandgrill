<?php

declare(strict_types=1);

namespace Tests\Feature\Orders;

use App\Models\Customer;
use App\Models\Order;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class PublicOrderTrackThrottleTest extends TestCase
{
    use RefreshDatabase;

    public function test_track_endpoint_allows_more_than_ten_hits_per_minute_for_one_token(): void
    {
        $customer = Customer::create([
            'name' => 'Track Throttle',
            'phone' => '+9607443003',
            'is_active' => true,
        ]);

        $token = Str::random(32);
        Order::create([
            'order_number' => 'TRK-THR-001',
            'type' => 'online_pickup',
            'status' => 'pending',
            'payment_status' => 'paid',
            'customer_id' => $customer->id,
            'tracking_token' => $token,
            'subtotal' => 50,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 50,
            'total_laar' => 5000,
        ]);

        // Old IP throttle:10,1 would fail here (polling + WhatsApp preview).
        for ($i = 0; $i < 15; $i++) {
            $this->getJson('/api/orders/track/'.$token)->assertOk();
        }
    }

    public function test_invoice_page_loads_without_session_cookie(): void
    {
        $invoice = \App\Models\Invoice::create([
            'invoice_number' => 'INV-THR-001',
            'token' => Str::random(48),
            'type' => 'sale',
            'status' => 'sent',
            'subtotal' => 40,
            'total' => 40,
            'subtotal_laar' => 4000,
            'total_laar' => 4000,
            'amount_paid_laar' => 0,
            'issue_date' => now()->toDateString(),
        ]);

        $res = $this->get('/invoices/'.$invoice->token);
        $res->assertOk();
        $res->assertHeader('Cache-Control');
        $this->assertStringContainsString('private', (string) $res->headers->get('Cache-Control'));
    }
}

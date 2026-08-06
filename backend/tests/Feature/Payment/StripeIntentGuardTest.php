<?php

declare(strict_types=1);

namespace Tests\Feature\Payment;

use App\Models\Customer;
use App\Models\Order;
use App\Models\Payment;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * 2026-08 audit #6 — Stripe intent must charge the canonical remaining
 * balance, reject paid/terminal orders, and use a server-fixed currency.
 */
class StripeIntentGuardTest extends TestCase
{
    use RefreshDatabase;

    private Customer $customer;

    private Order $order;

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'services.stripe.secret_key' => 'sk_test_dummy',
            'services.stripe.webhook_secret' => 'whsec_test_dummy',
        ]);

        $this->customer = Customer::create([
            'name' => 'Stripe Customer',
            'phone' => '+9607005500',
        ]);

        $this->order = Order::create([
            'order_number' => 'STRIPE-1',
            'type' => 'online_pickup',
            'status' => 'pending',
            'payment_status' => 'unpaid',
            'customer_id' => $this->customer->id,
            'subtotal' => 100.00,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 100.00,
            'total_laar' => 10000,
        ]);
    }

    private function authHeaders(): array
    {
        $token = $this->customer->createToken('test', ['customer'])->plainTextToken;

        return ['Authorization' => "Bearer {$token}"];
    }

    private function fakeStripeCreate(): void
    {
        Http::fake([
            '*/payment_intents' => Http::response([
                'id' => 'pi_test_123',
                'client_secret' => 'pi_test_123_secret',
            ], 200),
        ]);
    }

    public function test_intent_uses_remaining_balance_not_full_total(): void
    {
        // 60 of 100 already confirmed → intent must be for 40.00 (4000 laari).
        Payment::create([
            'order_id' => $this->order->id,
            'method' => 'bml_connect',
            'gateway' => 'bml',
            'amount' => 60.00,
            'amount_laar' => 6000,
            'status' => 'confirmed',
            'local_id' => 'BML-PARTIAL-1',
        ]);
        $this->order->update(['payment_status' => 'partial']);

        $this->fakeStripeCreate();

        $this->postJson('/api/stripe/intent', [
            'order_id' => $this->order->id,
            'currency' => 'usd', // must be ignored
        ], $this->authHeaders())->assertOk();

        Http::assertSent(function ($request) {
            return $request->url() === 'https://api.stripe.com/v1/payment_intents'
                && (int) $request['amount'] === 4000
                && $request['currency'] === 'mvr';
        });
    }

    public function test_intent_rejected_for_fully_paid_order(): void
    {
        Payment::create([
            'order_id' => $this->order->id,
            'method' => 'bml_connect',
            'gateway' => 'bml',
            'amount' => 100.00,
            'amount_laar' => 10000,
            'status' => 'confirmed',
            'local_id' => 'BML-FULL-1',
        ]);
        $this->order->update(['payment_status' => 'paid']);

        Http::fake();

        $this->postJson('/api/stripe/intent', [
            'order_id' => $this->order->id,
        ], $this->authHeaders())->assertStatus(422);

        Http::assertNothingSent();
    }

    public function test_intent_rejected_for_cancelled_order(): void
    {
        $this->order->update(['status' => 'cancelled']);
        Http::fake();

        $this->postJson('/api/stripe/intent', [
            'order_id' => $this->order->id,
        ], $this->authHeaders())->assertStatus(422);

        Http::assertNothingSent();
    }

    public function test_customer_cannot_create_intent_for_other_order(): void
    {
        $other = Order::create([
            'order_number' => 'STRIPE-OTHER',
            'type' => 'online_pickup',
            'status' => 'pending',
            'payment_status' => 'unpaid',
            'customer_id' => null,
            'subtotal' => 50,
            'total' => 50,
            'total_laar' => 5000,
        ]);
        Http::fake();

        $this->postJson('/api/stripe/intent', [
            'order_id' => $other->id,
        ], $this->authHeaders())->assertStatus(403);
    }
}

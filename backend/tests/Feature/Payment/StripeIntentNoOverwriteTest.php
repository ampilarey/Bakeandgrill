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
 * Audit #3 — never overwrite a Stripe PI that may have succeeded; delayed webhooks still settle.
 */
class StripeIntentNoOverwriteTest extends TestCase
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
            'phone' => '+9607005501',
        ]);

        $this->order = Order::create([
            'order_number' => 'STRIPE-NOOW',
            'type' => 'online_pickup',
            'status' => 'pending',
            'payment_status' => 'unpaid',
            'customer_id' => $this->customer->id,
            'subtotal' => 100.00,
            'total' => 100.00,
            'total_laar' => 10000,
        ]);
    }

    private function authHeaders(): array
    {
        $token = $this->customer->createToken('test', ['customer'])->plainTextToken;

        return ['Authorization' => "Bearer {$token}"];
    }

    public function test_succeeded_intent_is_finalized_without_creating_second_intent(): void
    {
        Payment::create([
            'idempotency_key' => 'stripe:intent:' . $this->order->id . ':10000',
            'order_id' => $this->order->id,
            'method' => 'stripe',
            'gateway' => 'stripe',
            'amount' => 100,
            'amount_laar' => 10000,
            'provider_transaction_id' => 'pi_original_success',
            'status' => 'pending',
            'processed_at' => now(),
        ]);

        Http::fake([
            '*/payment_intents/pi_original_success' => Http::response([
                'id' => 'pi_original_success',
                'status' => 'succeeded',
                'amount' => 10000,
                'currency' => 'mvr',
            ], 200),
            '*/payment_intents' => Http::response([
                'id' => 'pi_should_not_create',
                'client_secret' => 'secret',
            ], 200),
        ]);

        $this->postJson('/api/stripe/intent', [
            'order_id' => $this->order->id,
        ], $this->authHeaders())
            ->assertOk()
            ->assertJsonPath('already_paid', true)
            ->assertJsonPath('payment_intent_id', 'pi_original_success');

        $this->assertSame(1, Payment::where('order_id', $this->order->id)->where('gateway', 'stripe')->count());
        $this->assertSame('completed', Payment::where('provider_transaction_id', 'pi_original_success')->value('status'));
        Http::assertNotSent(fn ($request) => str_ends_with($request->url(), '/payment_intents')
            && $request->method() === 'POST');
    }

    public function test_delayed_webhook_still_settles_original_provider_id(): void
    {
        Payment::create([
            'idempotency_key' => 'stripe:intent:' . $this->order->id . ':10000',
            'order_id' => $this->order->id,
            'method' => 'stripe',
            'gateway' => 'stripe',
            'amount' => 100,
            'amount_laar' => 10000,
            'provider_transaction_id' => 'pi_delayed_1',
            'status' => 'pending',
            'processed_at' => now(),
        ]);

        $payload = json_encode([
            'id' => 'evt_1',
            'type' => 'payment_intent.succeeded',
            'data' => [
                'object' => [
                    'id' => 'pi_delayed_1',
                    'amount' => 10000,
                    'currency' => 'mvr',
                    'metadata' => ['order_id' => (string) $this->order->id],
                ],
            ],
        ], JSON_THROW_ON_ERROR);

        $timestamp = time();
        $sig = hash_hmac('sha256', $timestamp . '.' . $payload, 'whsec_test_dummy');

        $this->call(
            'POST',
            '/api/stripe/webhook',
            [],
            [],
            [],
            [
                'CONTENT_TYPE' => 'application/json',
                'HTTP_STRIPE_SIGNATURE' => "t={$timestamp},v1={$sig}",
            ],
            $payload,
        )->assertOk();

        $this->assertSame('completed', Payment::where('provider_transaction_id', 'pi_delayed_1')->value('status'));

        // Repeated delivery is harmless.
        $this->call(
            'POST',
            '/api/stripe/webhook',
            [],
            [],
            [],
            [
                'CONTENT_TYPE' => 'application/json',
                'HTTP_STRIPE_SIGNATURE' => "t={$timestamp},v1={$sig}",
            ],
            $payload,
        )->assertOk();

        $this->assertSame(1, Payment::where('order_id', $this->order->id)->where('status', 'completed')->count());
    }
}

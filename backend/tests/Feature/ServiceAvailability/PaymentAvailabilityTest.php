<?php

declare(strict_types=1);

namespace Tests\Feature\ServiceAvailability;

use App\Domains\System\Services\ServiceAvailabilityService;
use App\Models\Customer;
use App\Models\Order;
use Database\Seeders\ServiceStateSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Verifies the `online_payment` service key only blocks gateway INITIATION.
 *
 * Callbacks (BML webhook, return URL) and reconciliation of already-initiated
 * payments must NEVER be blocked — plan §11 payment nuance.
 */
class PaymentAvailabilityTest extends TestCase
{
    use RefreshDatabase;

    private Customer $customer;

    private Order $order;

    private string $customerToken;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ServiceStateSeeder::class);
        Cache::flush();

        $this->customer = Customer::create([
            'name' => 'Pay Availability',
            'phone' => '+9607890199',
        ]);
        $this->customerToken = $this->customer->createToken('test', ['customer'])->plainTextToken;

        $this->order = Order::create([
            'order_number' => 'ORD-AVAIL-CONTRACT',
            'type' => 'takeaway',
            'status' => 'pending',
            'customer_id' => $this->customer->id,
            'subtotal' => 150.00,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 150.00,
            'total_laar' => 15000,
        ]);

        Http::fake([
            '*/v2/transactions' => Http::response([
                'transactionId' => 'TXN-AVAIL-001',
                'url' => 'https://pay.bml.mv/avail-test',
            ], 200),
        ]);
    }

    private function authHeaders(): array
    {
        return ['Authorization' => "Bearer {$this->customerToken}"];
    }

    private function disablePayment(): void
    {
        app(ServiceAvailabilityService::class)->setState('online_payment', [
            'status' => 'unavailable',
            'public_message' => 'Payment gateway maintenance',
        ]);
    }

    public function test_initiate_online_blocked_with_503_when_payment_unavailable(): void
    {
        $this->disablePayment();

        $response = $this->postJson(
            "/api/orders/{$this->order->id}/pay/bml",
            [],
            $this->authHeaders(),
        );
        $response->assertStatus(503);
        $response->assertJsonPath('code', 'SERVICE_UNAVAILABLE');
        $response->assertJsonPath('service_key', 'online_payment');
    }

    public function test_initiate_partial_blocked_with_503_when_payment_unavailable(): void
    {
        $this->disablePayment();

        $response = $this->postJson(
            '/api/payments/online/initiate-partial',
            [
                'order_id' => $this->order->id,
                'amount' => 7500,
                'idempotency_key' => 'avail-test-' . $this->order->id,
            ],
            $this->authHeaders(),
        );
        $response->assertStatus(503);
        $response->assertJsonPath('service_key', 'online_payment');
    }

    public function test_initiate_partial_still_works_when_payment_available(): void
    {
        $response = $this->postJson(
            '/api/payments/online/initiate-partial',
            [
                'order_id' => $this->order->id,
                'amount' => 7500,
                'idempotency_key' => 'avail-open-' . $this->order->id,
            ],
            $this->authHeaders(),
        );
        $response->assertOk();
        $response->assertJsonStructure(['payment_url', 'payment_id', 'amount_laar']);
    }

    public function test_bml_webhook_is_never_blocked_by_payment_gate(): void
    {
        $this->disablePayment();

        // BmlWebhookController itself may return 503 for a bad signature —
        // that is BML-domain 503, NOT our SERVICE_UNAVAILABLE overlay. What
        // matters here is that we never return the SERVICE_UNAVAILABLE JSON
        // shape (code + service_key) from the availability guard.
        $response = $this->postJson('/api/payments/bml/webhook', [
            'state' => 'CONFIRMED',
            'transactionId' => 'TXN-AVAIL-001',
            'orderId' => 'ORD-AVAIL-CONTRACT',
        ]);

        $this->assertNotSame('SERVICE_UNAVAILABLE', $response->json('code'), 'BML webhook must not carry SERVICE_UNAVAILABLE');
        $this->assertNull($response->json('service_key'), 'BML webhook must not report service_key');
    }

    public function test_bml_return_url_is_never_blocked_by_payment_gate(): void
    {
        $this->disablePayment();

        // The bmlReturn handler is a browser-facing redirect, not JSON. What
        // we assert here is: it does not 503 due to the availability guard.
        $response = $this->get('/api/payments/bml/return?state=CANCELLED&orderId=' . $this->order->id);
        $this->assertNotSame(503, $response->getStatusCode());
    }
}

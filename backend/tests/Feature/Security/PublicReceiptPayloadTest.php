<?php

declare(strict_types=1);

namespace Tests\Feature\Security;

use App\Models\Order;
use App\Models\Receipt;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * The public receipt page shows the customer their bill — and nothing about
 * how the shop runs.
 *
 * `GET /api/receipts/{token}` used to return `$receipt->order` whole, and
 * Order sets `protected $hidden = []` explicitly, so the payload carried
 * internal staff `notes`, the `user_id` / `shift_id` / `device_id` of whoever
 * rang the order up, and the order's own `tracking_token`. The token holder is
 * the customer, so this was over-exposure rather than a breach — but staff
 * notes about an order are not something you would choose to hand over.
 */
class PublicReceiptPayloadTest extends TestCase
{
    use RefreshDatabase;

    private function receiptForOrder(): Receipt
    {
        $order = Order::factory()->create([
            'status' => 'completed',
            'payment_status' => 'paid',
            'total' => 100,
            'total_laar' => 10000,
            'notes' => 'INTERNAL: customer argued about the bill, watch this one',
            'user_id' => User::factory()->create()->id,
        ]);

        return Receipt::create([
            'order_id' => $order->id,
            'channel' => 'sms',
            'recipient' => '7771234',
        ]);
    }

    public function test_internal_operational_fields_are_not_returned(): void
    {
        // THE test. None of this belongs on a customer's receipt page.
        $receipt = $this->receiptForOrder();

        $body = $this->getJson("/api/receipts/{$receipt->token}")
            ->assertOk()
            ->json();

        $encoded = json_encode($body);

        $this->assertStringNotContainsString('INTERNAL:', $encoded, 'staff notes leaked');
        $this->assertStringNotContainsString('tracking_token', $encoded);
        $this->assertArrayNotHasKey('user_id', $body['order']);
        $this->assertArrayNotHasKey('shift_id', $body['order']);
        $this->assertArrayNotHasKey('device_id', $body['order']);
        $this->assertArrayNotHasKey('customer_id', $body['receipt']);
    }

    public function test_the_customer_still_gets_their_bill(): void
    {
        // The guard must not gut the page — if this fails, receipts are blank.
        $receipt = $this->receiptForOrder();

        $this->getJson("/api/receipts/{$receipt->token}")
            ->assertOk()
            ->assertJsonPath('order.status', 'completed')
            ->assertJsonStructure([
                'receipt' => ['id', 'channel'],
                'order' => ['order_number', 'items', 'payments', 'total'],
                'feedback_count',
            ]);
    }

    public function test_an_unknown_token_is_a_404(): void
    {
        $this->getJson('/api/receipts/' . str_repeat('z', 48))->assertNotFound();
    }

    public function test_the_route_is_rate_limited(): void
    {
        // It was the only public token endpoint with no limiter at all, while
        // every sibling had one.
        $middleware = Route::getRoutes()
            ->getByAction('App\Http\Controllers\Api\ReceiptController@show')
            ?->gatherMiddleware() ?? [];

        $this->assertStringContainsString('throttle', implode(',', $middleware));
    }
}

<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domains\Realtime\Services\KdsStreamProvider;
use App\Domains\Realtime\Services\OrderStreamProvider;
use App\Domains\Realtime\Services\SseStreamService;
use App\Models\Category;
use App\Models\Customer;
use App\Models\Item;
use App\Models\Order;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SseStreamTest extends TestCase
{
    use RefreshDatabase;

    private User $staff;
    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();

        $role = Role::create(['name' => 'KDS', 'slug' => 'kds', 'description' => '', 'is_active' => true]);
        $this->staff = User::create([
            'name' => 'Staff', 'email' => 'sse-staff@test.com',
            'password' => Hash::make('password'), 'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'), 'is_active' => true,
        ]);

        $this->customer = Customer::create([
            'name' => 'SSE Customer', 'phone' => '+9607880001',
        ]);
    }

    /**
     * Test SSE headers on the orders stream endpoint.
     * We don't test the infinite loop here - just headers and auth.
     */
    public function test_orders_stream_returns_sse_headers(): void
    {
        Sanctum::actingAs($this->staff, ['staff']);

        // We call with a very short timeout via a custom approach.
        // Since the stream is infinite, we just test the response object headers.
        $sseService = app(SseStreamService::class);
        $headers = $sseService->sseHeaders();

        $this->assertEquals('text/event-stream', $headers['Content-Type']);
        $this->assertEquals('no-cache', $headers['Cache-Control']);
        $this->assertEquals('keep-alive', $headers['Connection']);
        $this->assertEquals('no', $headers['X-Accel-Buffering']);
    }

    public function test_orders_stream_requires_auth(): void
    {
        $response = $this->getJson('/api/stream/orders');
        $response->assertStatus(401);
    }

    public function test_kds_stream_requires_auth(): void
    {
        $response = $this->getJson('/api/stream/kds');
        $response->assertStatus(401);
    }

    public function test_order_status_stream_requires_auth(): void
    {
        $order = Order::create([
            'order_number' => 'SSE-001', 'type' => 'takeaway', 'status' => 'pending',
            'subtotal' => 0, 'tax_amount' => 0, 'discount_amount' => 0, 'total' => 0,
        ]);

        $response = $this->getJson("/api/stream/orders/{$order->id}/status");
        $response->assertStatus(401);
    }

    public function test_order_stream_provider_fetches_changed_orders(): void
    {
        $order = Order::create([
            'order_number' => 'STREAM-001', 'type' => 'takeaway',
            'status' => 'pending', 'subtotal' => 50, 'tax_amount' => 0,
            'discount_amount' => 0, 'total' => 50,
        ]);

        $provider = app(OrderStreamProvider::class);
        // Fetch from 10 seconds ago — should include the new order
        $events = $provider->fetchSince(now()->subSeconds(10)->toIso8601String());

        $ids = array_column(array_map(fn ($e) => json_decode($e->data, true), $events), 'id');
        $this->assertContains($order->id, $ids);
    }

    public function test_kds_stream_provider_only_fetches_active_statuses(): void
    {
        $pending = Order::create([
            'order_number' => 'KDS-P-001', 'type' => 'takeaway',
            'status' => 'pending', 'subtotal' => 50, 'tax_amount' => 0,
            'discount_amount' => 0, 'total' => 50,
        ]);

        $completed = Order::create([
            'order_number' => 'KDS-C-001', 'type' => 'takeaway',
            'status' => 'completed', 'subtotal' => 50, 'tax_amount' => 0,
            'discount_amount' => 0, 'total' => 50,
        ]);

        $provider = app(KdsStreamProvider::class);
        $events = $provider->fetchSince(now()->subSeconds(10)->toIso8601String());

        $ids = array_column(array_map(fn ($e) => json_decode($e->data, true), $events), 'id');
        $this->assertContains($pending->id, $ids);
        $this->assertNotContains($completed->id, $ids);
    }

    public function test_order_status_stream_forbidden_for_other_customer(): void
    {
        $otherCustomer = Customer::create([
            'name' => 'Other', 'phone' => '+9607880002',
        ]);

        $order = Order::create([
            'order_number' => 'SSE-GUARD-001', 'type' => 'takeaway',
            'status' => 'pending', 'customer_id' => $otherCustomer->id,
            'subtotal' => 50, 'tax_amount' => 0, 'discount_amount' => 0, 'total' => 50,
        ]);

        // this->customer does NOT own the order (otherCustomer does)
        $token = $this->customer->createToken('test', ['customer'])->plainTextToken;
        $response = $this->getJson(
            "/api/stream/orders/{$order->id}/status",
            ['Authorization' => "Bearer {$token}"],
        );
        $response->assertStatus(403);
    }

    public function test_stream_event_dto_serializes_correctly(): void
    {
        $event = new \App\Domains\Realtime\DTOs\StreamEvent(
            id: '1700000000000.42',
            type: 'order.updated',
            data: '{"id":42,"status":"pending"}',
        );

        $expected = "id: 1700000000000.42\nevent: order.updated\ndata: {\"id\":42,\"status\":\"pending\"}\n\n";
        $this->assertEquals($expected, $event->toSseString());
    }

    public function test_stream_event_cursor_resumes_correctly(): void
    {
        $provider = app(OrderStreamProvider::class);

        // Create order at known time
        $order = Order::create([
            'order_number' => 'CURSOR-001', 'type' => 'takeaway',
            'status' => 'pending', 'subtotal' => 50, 'tax_amount' => 0,
            'discount_amount' => 0, 'total' => 50,
        ]);

        // Fetch from far future — should return nothing
        $events = $provider->fetchSince(now()->addYear()->toIso8601String());
        $this->assertEmpty($events);

        // Fetch from past — should return the order
        $events = $provider->fetchSince(now()->subMinute()->toIso8601String());
        $ids = array_column(array_map(fn ($e) => json_decode($e->data, true), $events), 'id');
        $this->assertContains($order->id, $ids);
    }
}

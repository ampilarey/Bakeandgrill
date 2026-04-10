<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Device;
use App\Models\Item;
use App\Models\Order;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Tests for CustomerDisplayController (GET /api/display/{token}).
 *
 * Covers:
 * - Valid tracking_token returns order data
 * - Correct column mapping (tax_amount, discount_amount, tip_amount → tax/discount/tip)
 * - Only in-progress statuses are returned; terminal states return 404
 * - order_number (guessable) no longer works as the lookup key
 * - Non-existent token returns 404
 * - Minimum required fields only are returned (no customer PII)
 */
class CustomerDisplayTest extends TestCase
{
    use RefreshDatabase;

    private User $staff;
    private Device $device;
    private Item $item;

    protected function setUp(): void
    {
        parent::setUp();

        $role        = Role::create(['name' => 'Owner', 'slug' => 'owner', 'description' => '', 'is_active' => true]);
        $this->staff = User::create([
            'name'      => 'Staff',
            'email'     => 'staff@display-test.com',
            'password'  => Hash::make('password'),
            'role_id'   => $role->id,
            'pin_hash'  => Hash::make('1234'),
            'is_active' => true,
        ]);

        $this->device = Device::create(['name' => 'POS', 'identifier' => 'D-001', 'type' => 'pos', 'is_active' => true]);
        $this->withHeader('X-Device-Identifier', $this->device->identifier);

        $category    = Category::create(['name' => 'Food', 'slug' => 'food', 'is_active' => true]);
        $this->item  = Item::create([
            'category_id'  => $category->id,
            'name'         => 'Burger',
            'base_price'   => 25.00,
            'sku'          => 'BG-001',
            'barcode'      => 'BG-001',
            'is_active'    => true,
            'is_available' => true,
        ]);
    }

    private function createOrder(string $status = 'open'): Order
    {
        Sanctum::actingAs($this->staff, ['staff']);

        $response = $this->postJson('/api/orders', [
            'type'              => 'dine_in',
            'device_identifier' => $this->device->identifier,
            'print'             => false,
            'items'             => [['item_id' => $this->item->id, 'quantity' => 2]],
        ]);

        $order = Order::find($response->json('order.id'));
        if ($order->status !== $status) {
            $order->update(['status' => $status]);
        }

        return $order->fresh();
    }

    // ── Access via tracking_token ─────────────────────────────────────────────

    public function test_display_endpoint_returns_200_for_active_order_via_token(): void
    {
        $order = $this->createOrder('open');

        $response = $this->getJson("/api/display/{$order->tracking_token}");

        $response->assertOk()
            ->assertJsonStructure([
                'order' => ['order_number', 'status', 'type', 'items', 'subtotal', 'tax', 'discount', 'tip', 'total'],
            ]);
    }

    public function test_display_endpoint_returns_correct_order_number_in_body(): void
    {
        $order = $this->createOrder('preparing');

        $data = $this->getJson("/api/display/{$order->tracking_token}")->assertOk()->json('order');

        $this->assertSame($order->order_number, $data['order_number']);
        $this->assertSame('preparing', $data['status']);
    }

    public function test_display_response_does_not_expose_tracking_token(): void
    {
        $order = $this->createOrder('open');

        $data = $this->getJson("/api/display/{$order->tracking_token}")->assertOk()->json('order');

        // The token is the URL parameter; it must not be echoed in the response body
        $this->assertArrayNotHasKey('tracking_token', $data);
    }

    public function test_display_response_does_not_expose_customer_id(): void
    {
        $order = $this->createOrder('open');

        $data = $this->getJson("/api/display/{$order->tracking_token}")->assertOk()->json('order');

        $this->assertArrayNotHasKey('customer_id', $data);
        $this->assertArrayNotHasKey('user_id', $data);
    }

    // ── Guessable order_number no longer works ────────────────────────────────

    public function test_display_endpoint_rejects_order_number_as_lookup_key(): void
    {
        $order = $this->createOrder('open');

        // order_number (e.g. "BG-0001") should not match any tracking_token
        $this->getJson("/api/display/{$order->order_number}")->assertNotFound();
    }

    // ── Column mapping ────────────────────────────────────────────────────────

    public function test_display_endpoint_returns_non_null_numeric_totals(): void
    {
        $order = $this->createOrder('open');

        $order->update([
            'tax_amount'      => 3.50,
            'discount_amount' => 2.00,
            'tip_amount'      => 1.00,
        ]);

        $data = $this->getJson("/api/display/{$order->tracking_token}")->assertOk()->json('order');

        $this->assertNotNull($data['tax'],      'tax must not be null — check column name in select()');
        $this->assertNotNull($data['discount'], 'discount must not be null — check column name in select()');
        $this->assertNotNull($data['tip'],      'tip must not be null — check column name in select()');

        $this->assertEqualsWithDelta(3.50, (float) $data['tax'],      0.001);
        $this->assertEqualsWithDelta(2.00, (float) $data['discount'], 0.001);
        $this->assertEqualsWithDelta(1.00, (float) $data['tip'],      0.001);
    }

    public function test_display_endpoint_includes_line_items(): void
    {
        $order = $this->createOrder('open');

        $data = $this->getJson("/api/display/{$order->tracking_token}")->assertOk()->json('order');

        $this->assertNotEmpty($data['items']);
        $this->assertArrayHasKey('name',       $data['items'][0]);
        $this->assertArrayHasKey('quantity',   $data['items'][0]);
        $this->assertArrayHasKey('unit_price', $data['items'][0]);
        $this->assertArrayHasKey('total',      $data['items'][0]);
    }

    // ── Terminal and unknown states ───────────────────────────────────────────

    public function test_display_endpoint_returns_404_for_unknown_token(): void
    {
        $this->getJson('/api/display/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaX')->assertNotFound();
    }

    public function test_display_endpoint_hides_completed_orders(): void
    {
        $order = $this->createOrder('completed');

        $this->getJson("/api/display/{$order->tracking_token}")->assertNotFound();
    }

    public function test_display_endpoint_hides_cancelled_orders(): void
    {
        $order = $this->createOrder('cancelled');

        $this->getJson("/api/display/{$order->tracking_token}")->assertNotFound();
    }

    public function test_display_endpoint_hides_paid_orders(): void
    {
        $order = $this->createOrder('paid');

        $this->getJson("/api/display/{$order->tracking_token}")->assertNotFound();
    }

    public function test_display_endpoint_shows_pending_orders(): void
    {
        $order = $this->createOrder('pending');

        $this->getJson("/api/display/{$order->tracking_token}")->assertOk();
    }

    public function test_display_endpoint_shows_ready_orders(): void
    {
        $order = $this->createOrder('ready');

        $this->getJson("/api/display/{$order->tracking_token}")->assertOk();
    }

    // ── Tracking token must exist and be random ───────────────────────────────

    public function test_order_has_tracking_token_set_on_creation(): void
    {
        $order = $this->createOrder('open');

        $this->assertNotNull($order->tracking_token);
        $this->assertGreaterThanOrEqual(16, strlen($order->tracking_token));
    }

    public function test_two_orders_have_different_tracking_tokens(): void
    {
        $order1 = $this->createOrder('open');
        $order2 = $this->createOrder('open');

        $this->assertNotSame($order1->tracking_token, $order2->tracking_token);
    }
}

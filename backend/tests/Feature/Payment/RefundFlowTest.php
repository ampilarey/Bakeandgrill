<?php

declare(strict_types=1);

namespace Tests\Feature\Payment;

use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Refund;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Refund flow end-to-end.
 *
 * Covers: issue refund, partial refund, amount cap, stock restore, permission checks.
 */
class RefundFlowTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;
    private User $staff;
    private string $ownerToken;
    private string $staffToken;

    protected function setUp(): void
    {
        parent::setUp();

        $ownerRole = Role::firstOrCreate(
            ['slug' => 'owner'],
            ['name' => 'Owner', 'description' => '', 'is_active' => true],
        );
        $staffRole = Role::firstOrCreate(
            ['slug' => 'staff'],
            ['name' => 'Staff', 'description' => '', 'is_active' => true],
        );

        $this->owner = User::factory()->create([
            'role_id' => $ownerRole->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);

        $this->staff = User::factory()->create([
            'role_id' => $staffRole->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);

        $this->ownerToken = $this->owner->createToken('test', ['staff'])->plainTextToken;
        $this->staffToken = $this->staff->createToken('test', ['staff'])->plainTextToken;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private function makeRefundableOrder(float $total = 50.00, ?int $totalLaar = null): Order
    {
        $customer = $this->makeCustomer();

        return Order::factory()->paid()->create([
            'customer_id' => $customer->id,
            'total' => $total,
            'total_laar' => $totalLaar ?? (int) round($total * 100),
            'subtotal' => $total,
            'tax_amount' => 0,
        ]);
    }

    protected function authHeader(User $user): array
    {
        return ['Authorization' => 'Bearer ' . $user->createToken('test', ['staff'])->plainTextToken];
    }

    // ── Issue refund ──────────────────────────────────────────────────────────

    public function test_owner_can_create_refund_on_paid_order(): void
    {
        $order = $this->makeRefundableOrder(50.00);

        $response = $this->postJson(
            "/api/orders/{$order->id}/refunds",
            ['amount' => 10.00, 'reason' => 'Customer request'],
            $this->authHeader($this->owner),
        );

        $response->assertStatus(201)
            ->assertJsonPath('refund.order_id', $order->id)
            ->assertJsonPath('refund.amount', '10.00');

        $this->assertDatabaseHas('refunds', [
            'order_id' => $order->id,
            'amount' => 10.00,
        ]);
    }

    // ── Cannot refund without a valid amount ──────────────────────────────────

    public function test_refund_requires_positive_amount(): void
    {
        $order = $this->makeRefundableOrder(50.00);

        $this->postJson(
            "/api/orders/{$order->id}/refunds",
            ['amount' => 0],
            $this->authHeader($this->owner),
        )->assertStatus(422);
    }

    // ── Amount cap ────────────────────────────────────────────────────────────

    public function test_refund_amount_cannot_exceed_order_total(): void
    {
        $order = $this->makeRefundableOrder(50.00);

        $this->postJson(
            "/api/orders/{$order->id}/refunds",
            ['amount' => 99.99],
            $this->authHeader($this->owner),
        )->assertStatus(422);
    }

    public function test_cumulative_refunds_cannot_exceed_order_total(): void
    {
        $order = $this->makeRefundableOrder(50.00);

        // First partial refund — OK
        $this->postJson(
            "/api/orders/{$order->id}/refunds",
            ['amount' => 30.00],
            $this->authHeader($this->owner),
        )->assertStatus(201);

        // Second partial refund that would exceed total — should fail
        $this->postJson(
            "/api/orders/{$order->id}/refunds",
            ['amount' => 30.00],
            $this->authHeader($this->owner),
        )->assertStatus(422);
    }

    // ── Partial refund ────────────────────────────────────────────────────────

    public function test_partial_refund_does_not_mark_order_as_refunded(): void
    {
        $order = $this->makeRefundableOrder(100.00);

        $this->postJson(
            "/api/orders/{$order->id}/refunds",
            ['amount' => 40.00],
            $this->authHeader($this->owner),
        )->assertStatus(201);

        // Order status should NOT change — only a full refund marks it "refunded"
        $this->assertDatabaseMissing('orders', ['id' => $order->id, 'status' => 'refunded']);
    }

    // ── Full refund marks order as refunded ───────────────────────────────────

    public function test_full_refund_marks_order_as_refunded(): void
    {
        $order = $this->makeRefundableOrder(50.00);

        $this->postJson(
            "/api/orders/{$order->id}/refunds",
            ['amount' => 50.00],
            $this->authHeader($this->owner),
        )->assertStatus(201);

        $this->assertDatabaseHas('orders', ['id' => $order->id, 'status' => 'refunded']);
    }

    // ── Stock restore on full refund ──────────────────────────────────────────

    public function test_full_refund_restores_stock_for_tracked_items(): void
    {
        $category = $this->makeCategory();
        $item = $this->makeItem(trackStock: true, stock: 5);

        $customer = $this->makeCustomer();
        $order = Order::factory()->paid()->create([
            'customer_id' => $customer->id,
            'total' => 15.00,
            'total_laar' => 1500,
            'subtotal' => 15.00,
            'tax_amount' => 0,
        ]);

        OrderItem::create([
            'order_id' => $order->id,
            'item_id' => $item->id,
            'item_name' => $item->name,
            'quantity' => 2,
            'unit_price' => 7.50,
            'total_price' => 15.00,
        ]);

        $stockBefore = $item->fresh()->stock_quantity;

        $this->postJson(
            "/api/orders/{$order->id}/refunds",
            ['amount' => 15.00],
            $this->authHeader($this->owner),
        )->assertStatus(201);

        $item->refresh();
        $this->assertGreaterThanOrEqual($stockBefore, $item->stock_quantity);
    }

    // ── Permission check ──────────────────────────────────────────────────────

    public function test_unauthenticated_cannot_create_refund(): void
    {
        $order = $this->makeRefundableOrder(50.00);

        $this->postJson(
            "/api/orders/{$order->id}/refunds",
            ['amount' => 10.00],
        )->assertStatus(401);
    }

    public function test_customer_token_cannot_create_refund(): void
    {
        $customer = $this->makeCustomer();
        $order = $this->makeRefundableOrder();
        $token = $customer->createToken('test', ['customer'])->plainTextToken;

        $this->postJson(
            "/api/orders/{$order->id}/refunds",
            ['amount' => 10.00],
            ['Authorization' => "Bearer {$token}"],
        )->assertStatus(403);
    }
}

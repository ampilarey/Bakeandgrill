<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Device;
use App\Models\Item;
use App\Models\MenuGroup;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Refund;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\PreparesPosApi;
use Tests\TestCase;

/**
 * Regression: BE-004 — refund cap.
 *
 * The old controller capped refunds against `order.total`. That let a
 * partially-paid order (e.g. MVR 50 collected on a MVR 100 ticket) be
 * refunded for the FULL 100 MVR — direct money-out-the-door bug.
 *
 * After the fix, the cap is `min(amount_paid, order_total) - already_refunded`.
 */
class RefundCapTest extends TestCase
{
    use PreparesPosApi;
    use RefreshDatabase;

    private User $owner;
    private Item $item;

    protected function setUp(): void
    {
        parent::setUp();

        MenuGroup::firstOrCreate(['slug' => 'default'], ['name' => 'Default', 'is_active' => true]);
        $category = Category::create(['name' => 'Refund Test', 'slug' => 'refund-food', 'is_active' => true]);
        $this->item = Item::create([
            'category_id' => $category->id,
            'name' => 'Refund Test Item',
            'base_price' => 100.0,
            'sku' => 'REF-001',
            'is_active' => true,
            'is_available' => true,
        ]);

        $role = Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'slug' => 'owner', 'is_active' => true]);
        $this->owner = User::create([
            'name' => 'Owner',
            'email' => 'owner@refund.test',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        $device = Device::create(['name' => 'Refund POS', 'identifier' => 'REF-POS', 'type' => 'pos', 'is_active' => true]);
        $this->preparePosApi($this->owner, $device);
    }

    /**
     * Partial payment of MVR 50 on a MVR 100 order. Refund attempt for
     * MVR 75 must be rejected. The OLD code accepted this because it
     * compared against the order TOTAL (100), not the amount paid (50).
     */
    public function test_partially_paid_order_cannot_be_refunded_beyond_amount_paid(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);

        // Create a 100 MVR order in 'partial' status with 50 MVR collected.
        $order = Order::create([
            'order_number' => 'PAR-001',
            'type' => 'takeaway',
            'status' => 'partial',
            'subtotal' => 100.0,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 100.0,
            'total_laar' => 10000,
            'delivery_contact_phone' => '9607700001',
        ]);
        Payment::create([
            'order_id' => $order->id,
            'method' => 'cash',
            'amount' => 50.0,
            'amount_laar' => 5000,
            'status' => 'paid',
            'processed_at' => now(),
        ]);

        // BUG: old code allowed this. Should now be 422.
        $this->postJson("/api/orders/{$order->id}/refunds", [
            'amount' => 75.00,
            'reason_category' => 'other', 'reason' => 'over-refund attempt',
        ])->assertStatus(422)
            ->assertSeeText('exceed amount paid');

        $this->assertSame(
            0,
            Refund::where('order_id', $order->id)->count(),
            'over-refund attempt must NOT create a refund row',
        );
    }

    /**
     * Refunding exactly the paid amount must succeed (partial-paid refund
     * of the full collected amount — common cancellation case).
     */
    public function test_partially_paid_order_can_be_refunded_up_to_amount_paid(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);

        $order = Order::create([
            'order_number' => 'PAR-002',
            'type' => 'takeaway',
            'status' => 'partial',
            'subtotal' => 100.0,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 100.0,
            'total_laar' => 10000,
            'delivery_contact_phone' => '9607700002',
        ]);
        Payment::create([
            'order_id' => $order->id,
            'method' => 'cash',
            'amount' => 50.0,
            'amount_laar' => 5000,
            'status' => 'paid',
            'processed_at' => now(),
        ]);

        $this->postJson("/api/orders/{$order->id}/refunds", [
            'amount' => 50.00,
            'reason_category' => 'other', 'reason' => 'returning to customer',
        ])->assertCreated();

        $this->assertSame(1, Refund::where('order_id', $order->id)->count());
    }

    /**
     * Two successive refunds must aggregate against the same cap — second
     * one that would push past the paid amount is rejected.
     */
    public function test_sequential_refunds_respect_the_amount_paid_cap(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);

        $order = Order::create([
            'order_number' => 'PAR-003',
            'type' => 'takeaway',
            'status' => 'paid',
            'subtotal' => 100.0,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 100.0,
            'total_laar' => 10000,
            'paid_at' => now(),
            'delivery_contact_phone' => '9607700003',
        ]);
        Payment::create([
            'order_id' => $order->id,
            'method' => 'cash',
            'amount' => 100.0,
            'amount_laar' => 10000,
            'status' => 'paid',
            'processed_at' => now(),
        ]);

        // First refund — 60 MVR — fine.
        $this->postJson("/api/orders/{$order->id}/refunds", [
            'amount' => 60.00,
            'reason_category' => 'other', 'reason' => 'test refund',
        ])->assertCreated();

        // Second refund — 50 MVR — would push to 110 MVR refunded against
        // 100 MVR paid. Must be rejected.
        $this->postJson("/api/orders/{$order->id}/refunds", [
            'amount' => 50.00,
            'reason_category' => 'other', 'reason' => 'test refund',
        ])->assertStatus(422);

        $this->assertSame(1, Refund::where('order_id', $order->id)->count());
    }

    /**
     * Failed payments (status='failed') must NOT count towards the cap.
     */
    public function test_failed_payments_do_not_count_as_paid(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);

        $order = Order::create([
            'order_number' => 'PAR-004',
            'type' => 'takeaway',
            'status' => 'partial',
            'subtotal' => 100.0,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 100.0,
            'total_laar' => 10000,
            'delivery_contact_phone' => '9607700004',
        ]);
        // 50 MVR paid + 50 MVR failed (e.g. card declined retry)
        Payment::create([
            'order_id' => $order->id,
            'method' => 'cash',
            'amount' => 50.0,
            'amount_laar' => 5000,
            'status' => 'paid',
            'processed_at' => now(),
        ]);
        Payment::create([
            'order_id' => $order->id,
            'method' => 'card',
            'amount' => 50.0,
            'amount_laar' => 5000,
            'status' => 'failed',
        ]);

        // Cap is 50 (only the cash payment), not 100.
        $this->postJson("/api/orders/{$order->id}/refunds", [
            'amount' => 75.00,
            'reason_category' => 'other', 'reason' => 'test refund',
        ])->assertStatus(422);
    }
}

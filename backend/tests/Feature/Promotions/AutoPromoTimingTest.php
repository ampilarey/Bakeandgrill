<?php

declare(strict_types=1);

namespace Tests\Feature\Promotions;

use App\Domains\Payments\Services\PaymentService;
use App\Models\Category;
use App\Models\Device;
use App\Models\Item;
use App\Models\Order;
use App\Models\OrderPromotion;
use App\Models\Promotion;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\PreparesPosApi;
use Tests\TestCase;

/**
 * Owner, 2026-10-16: a discount on every sale in a period. What happens at the
 * edges: a ticket saved before the offer ends and paid after it, a ticket
 * changed after it ends, and what a cart that is not saved yet is shown.
 */
class AutoPromoTimingTest extends TestCase
{
    use PreparesPosApi;
    use RefreshDatabase;

    private User $staff;

    private Device $device;

    private Item $item;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-10-16 09:00:00');

        $role = Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'description' => '', 'is_active' => true]);
        $this->staff = User::create([
            'name' => 'Staff', 'email' => 'staff-timing@test.com',
            'password' => Hash::make('password'), 'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'), 'is_active' => true,
        ]);
        $this->device = Device::create(['name' => 'POS', 'identifier' => 'T-TIME', 'type' => 'pos', 'is_active' => true]);
        $this->withHeader('X-Device-Identifier', $this->device->identifier);
        $category = Category::create(['name' => 'Food', 'slug' => 'food-timing', 'is_active' => true]);
        $this->item = Item::create([
            'category_id' => $category->id, 'name' => 'Burger', 'base_price' => 100.00,
            'sku' => 'TIME-B001', 'barcode' => 'TIME-B001', 'is_active' => true, 'is_available' => true,
        ]);
        $this->preparePosApi($this->staff, $this->device);

        // 10% off everything until 10:00 today.
        Promotion::create([
            'name' => 'Morning 10%', 'code' => null, 'type' => 'percentage', 'discount_value' => 10,
            'is_active' => true, 'auto_apply' => true, 'stackable' => false, 'scope' => 'order',
            'starts_at' => '2026-10-16 08:00:00', 'expires_at' => '2026-10-16 10:00:00',
        ]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function saveTicket(): Order
    {
        Sanctum::actingAs($this->staff, ['staff']);
        $id = (int) $this->postJson('/api/orders', [
            'type' => 'takeaway', 'device_identifier' => $this->device->identifier, 'print' => false,
            'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
        ])->assertCreated()->json('order.id');
        $this->postJson("/api/orders/{$id}/hold")->assertOk();

        return Order::findOrFail($id);
    }

    public function test_the_cart_preview_shows_the_offer_during_the_period_and_nothing_after(): void
    {
        $lines = ['items' => [['item_id' => $this->item->id, 'quantity' => 2, 'unit_price' => 100]]];

        $this->postJson('/api/promotions/auto-preview', $lines)->assertOk()
            ->assertJsonPath('discount_laar', 2000)
            ->assertJsonPath('promotions.0.name', 'Morning 10%')
            ->assertJsonPath('ends_at', Carbon::parse('2026-10-16 10:00:00')->toIso8601String());

        Carbon::setTestNow('2026-10-16 10:00:01');
        $this->postJson('/api/promotions/auto-preview', $lines)->assertOk()
            ->assertJsonPath('discount_laar', 0)
            ->assertJsonPath('ends_at', null);
    }

    public function test_a_ticket_saved_before_the_end_and_paid_after_keeps_the_discount(): void
    {
        $order = $this->saveTicket();
        $this->assertSame(1000, (int) $order->promo_discount_laar);
        $total = (int) $order->total_laar;

        Carbon::setTestNow('2026-10-16 10:30:00');
        $this->postJson("/api/orders/{$order->id}/resume")->assertOk();
        // What the gateway or the till would collect: still the discounted total.
        $this->assertSame($total, app(PaymentService::class)->getRemainingBalanceLaar($order->fresh()));
        $this->postJson("/api/orders/{$order->id}/payments", [
            'payments' => [['method' => 'cash', 'amount' => $total / 100]],
        ])->assertOk();

        $order->refresh();
        $this->assertSame('paid', $order->payment_status);
        $this->assertSame($total, (int) $order->total_laar);
        $this->assertSame(1000, (int) $order->promo_discount_laar);
        $this->assertSame('consumed', OrderPromotion::where('order_id', $order->id)->value('status'));
    }

    public function test_a_ticket_changed_after_the_end_loses_the_discount(): void
    {
        $order = $this->saveTicket();

        Carbon::setTestNow('2026-10-16 10:30:00');
        $this->postJson("/api/orders/{$order->id}/resume")->assertOk();
        $res = $this->patchJson("/api/orders/{$order->id}/items", [
            'items' => [['item_id' => $this->item->id, 'name' => 'Burger', 'quantity' => 2]],
        ])->assertOk();

        $order->refresh();
        $this->assertSame(0, (int) $order->promo_discount_laar);
        $this->assertSame('released', OrderPromotion::where('order_id', $order->id)->value('status'));
        $this->assertSame(200.0, (float) $res->json('order.total') - (float) $order->tax_amount);
        // The offer's own note; CI once saw a loyalty clamp note beside it, which is not what this tests.
        $this->assertContains('Offer Morning 10% removed — the offer has ended.', $res->json('discount_notes'));
    }

    public function test_a_ticket_saved_after_the_end_gets_nothing(): void
    {
        Carbon::setTestNow('2026-10-16 10:00:01');
        $order = $this->saveTicket();
        $this->assertSame(0, (int) $order->promo_discount_laar);
    }
}

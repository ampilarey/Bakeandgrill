<?php

declare(strict_types=1);

namespace Tests\Feature\Stock;

use App\Domains\Payments\Listeners\RestoreGiftCardOnRefundListener;
use App\Domains\Payments\Services\GiftCardCodeService;
use App\Domains\Payments\Services\GiftCardRedemptionService;
use App\Domains\Orders\DTOs\OrderRefundedData;
use App\Domains\Orders\Events\OrderRefunded;
use App\Models\Customer;
use App\Models\GiftCardTransaction;
use App\Models\Order;
use App\Models\Refund;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Gift card lifecycle tests — hashed storage, balance, apply, redeem, throttle.
 */
class GiftCardStockTest extends TestCase
{
    use RefreshDatabase;

    private array $adminHeaders;

    protected function setUp(): void
    {
        parent::setUp();
        $this->adminHeaders = $this->staffHeaders($this->makeOwner());
    }

    // ── Admin: issue ──────────────────────────────────────────────────────────

    public function test_admin_can_issue_gift_card(): void
    {
        $response = $this->postJson('/api/admin/gift-cards', [
            'amount' => 50.00,
        ], $this->adminHeaders)
            ->assertStatus(201)
            ->assertJsonPath('gift_card.status', 'active')
            ->assertJsonPath('gift_card.initial_balance', 50);

        $this->assertNotEmpty($response->json('gift_card.code'));
        $this->assertNotEmpty($response->json('gift_card.masked_code'));
    }

    public function test_issue_requires_positive_amount(): void
    {
        $this->postJson('/api/admin/gift-cards', [
            'amount' => 0,
        ], $this->adminHeaders)->assertStatus(422);
    }

    public function test_issue_creates_load_transaction(): void
    {
        $this->postJson('/api/admin/gift-cards', ['amount' => 25], $this->adminHeaders)
            ->assertStatus(201);

        $this->assertDatabaseHas('gift_card_transactions', ['type' => 'load', 'amount' => 25]);
    }

    public function test_issue_generates_unique_code(): void
    {
        $r1 = $this->postJson('/api/admin/gift-cards', ['amount' => 10], $this->adminHeaders)->assertStatus(201);
        $r2 = $this->postJson('/api/admin/gift-cards', ['amount' => 10], $this->adminHeaders)->assertStatus(201);

        $this->assertNotEquals($r1->json('gift_card.code'), $r2->json('gift_card.code'));
    }

    public function test_issue_with_customer_id_links_card(): void
    {
        $customer = $this->makeCustomer();

        $this->postJson('/api/admin/gift-cards', [
            'amount' => 100,
            'customer_id' => $customer->id,
        ], $this->adminHeaders)->assertStatus(201);

        $this->assertDatabaseHas('gift_cards', [
            'issued_to_customer_id' => $customer->id,
        ]);
    }

    public function test_list_does_not_expose_full_code(): void
    {
        $this->makeGiftCard();

        $response = $this->getJson('/api/admin/gift-cards', $this->adminHeaders)->assertOk();
        $first = $response->json('data.0');

        $this->assertArrayHasKey('masked_code', $first);
        $this->assertArrayNotHasKey('code', $first);
    }

    public function test_card_not_stored_as_plaintext(): void
    {
        ['card' => $card, 'code' => $plain] = $this->makeGiftCard();

        $this->assertFalse(
            DB::table('gift_cards')->where('code_hash', $plain)->exists(),
        );
        $this->assertSame(app(GiftCardCodeService::class)->hash($plain), $card->fresh()->code_hash);
    }

    // ── Public: balance check ─────────────────────────────────────────────────

    public function test_balance_check_returns_current_balance(): void
    {
        ['code' => $code] = $this->makeGiftCard(['current_balance' => 75, 'initial_balance' => 75]);

        $response = $this->getJson('/api/gift-cards/' . urlencode($code) . '/balance')
            ->assertStatus(200);

        $this->assertEquals(75, $response->json('current_balance'));
        $this->assertArrayHasKey('masked_code', $response->json());
        $this->assertArrayNotHasKey('code', $response->json());
    }

    public function test_post_balance_check_returns_current_balance(): void
    {
        ['code' => $code] = $this->makeGiftCard(['current_balance' => 75, 'initial_balance' => 75]);

        $response = $this->postJson('/api/gift-cards/balance', ['code' => $code])
            ->assertStatus(200);

        $this->assertEquals(75, $response->json('current_balance'));
        $this->assertEquals(75, $response->json('available_balance'));
        $this->assertEquals(0, $response->json('held_balance'));
        $this->assertArrayHasKey('masked_code', $response->json());
        $this->assertArrayNotHasKey('code', $response->json());
    }

    public function test_balance_check_reports_held_on_unpaid_orders(): void
    {
        ['card' => $card, 'code' => $code] = $this->makeGiftCard([
            'initial_balance' => 50,
            'current_balance' => 50,
        ]);

        Order::create([
            'order_number' => 'BG-HELD-BAL',
            'tracking_token' => 'heldbal',
            'type' => 'takeaway',
            'status' => 'pending',
            'subtotal' => 30.00,
            'subtotal_laar' => 3000,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 30.00,
            'total_laar' => 3000,
            'gift_card_id' => $card->id,
            'gift_card_discount_laar' => 3000,
        ]);

        $this->postJson('/api/gift-cards/balance', ['code' => $code])
            ->assertOk()
            ->assertJsonPath('current_balance', 50)
            ->assertJsonPath('held_balance', 30)
            ->assertJsonPath('available_balance', 20);
    }

    public function test_post_balance_check_returns_404_for_cancelled_card(): void
    {
        ['code' => $code] = $this->makeGiftCard([
            'initial_balance' => 50,
            'current_balance' => 50,
            'status' => 'cancelled',
        ]);

        $this->postJson('/api/gift-cards/balance', ['code' => $code])
            ->assertStatus(404);
    }

    public function test_balance_check_returns_404_for_unknown_code(): void
    {
        $this->getJson('/api/gift-cards/FAKE-CODE-1234/balance')
            ->assertStatus(404);
    }

    public function test_balance_check_returns_404_for_depleted_card(): void
    {
        ['code' => $code] = $this->makeGiftCard([
            'initial_balance' => 50,
            'current_balance' => 0,
            'status' => 'depleted',
        ]);

        $this->getJson('/api/gift-cards/' . urlencode($code) . '/balance')
            ->assertStatus(404);
    }

    public function test_balance_check_returns_404_for_expired_card(): void
    {
        ['code' => $code] = $this->makeGiftCard([
            'initial_balance' => 50,
            'current_balance' => 50,
            'status' => 'active',
            'expires_at' => now()->subDay(),
        ]);

        $this->getJson('/api/gift-cards/' . urlencode($code) . '/balance')
            ->assertStatus(404);
    }

    public function test_balance_check_throttles_after_limit(): void
    {
        for ($i = 0; $i < 10; $i++) {
            $this->getJson('/api/gift-cards/FAKE-CODE-1234/balance');
        }

        $this->getJson('/api/gift-cards/FAKE-CODE-1234/balance')
            ->assertStatus(429);
    }

    // ── Customer: apply gift card to order ────────────────────────────────────

    public function test_customer_can_apply_gift_card_to_pending_order(): void
    {
        ['card' => $card, 'code' => $code] = $this->makeGiftCard([
            'initial_balance' => 20,
            'current_balance' => 20,
        ]);

        $customer = $this->makeCustomer();
        $item = $this->makeItem(false, 10, ['base_price' => 30.00]);
        $order = $this->makeOrder($customer, [
            'order_number' => 'BG-TEST-0001',
            'tracking_token' => 'abc123',
            'type' => 'online_pickup',
            'status' => 'pending',
            'subtotal' => 30.00,
            'subtotal_laar' => 3000,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 30.00,
            'total_laar' => 3000,
        ]);
        $order->items()->create([
            'item_id' => $item->id,
            'item_name' => $item->name,
            'quantity' => 1,
            'unit_price' => 30.00,
            'total_price' => 30.00,
        ]);

        $token = $this->customerHeaders($customer);

        $response = $this->postJson("/api/orders/{$order->id}/apply-gift-card", [
            'code' => $code,
        ], $token)->assertStatus(200);

        $order->refresh();
        $this->assertEquals($card->id, $order->gift_card_id);
        $this->assertGreaterThan(0, (int) $response->json('discount_laar'));
        $this->assertGreaterThan(0, (int) $order->gift_card_discount_laar);
    }

    public function test_invalid_gift_card_code_is_rejected(): void
    {
        $customer = $this->makeCustomer();
        $order = Order::create([
            'order_number' => 'BG-TEST-0002',
            'tracking_token' => 'def456',
            'type' => 'online_pickup',
            'status' => 'pending',
            'customer_id' => $customer->id,
            'subtotal' => 30.00,
            'subtotal_laar' => 3000,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 30.00,
            'total_laar' => 3000,
            'delivery_fee' => 0,
            'delivery_fee_laar' => 0,
        ]);

        $token = $this->customerHeaders($customer);

        $this->postJson("/api/orders/{$order->id}/apply-gift-card", [
            'code' => 'NOPE-FAKE-0000',
        ], $token)->assertStatus(422);
    }

    public function test_customer_cannot_apply_gift_card_to_another_customers_order(): void
    {
        ['code' => $code] = $this->makeGiftCard([
            'initial_balance' => 50,
            'current_balance' => 50,
        ]);

        $customerA = $this->makeCustomer(['phone' => '+9607800001']);
        $customerB = $this->makeCustomer(['phone' => '+9607800002']);

        $order = Order::create([
            'order_number' => 'BG-IDOR-0001',
            'tracking_token' => 'ghi789',
            'type' => 'online_pickup',
            'status' => 'pending',
            'customer_id' => $customerA->id,
            'subtotal' => 20.00,
            'subtotal_laar' => 2000,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 20.00,
            'total_laar' => 2000,
            'delivery_fee' => 0,
            'delivery_fee_laar' => 0,
        ]);

        $tokenB = $this->customerHeaders($customerB);

        $this->postJson("/api/orders/{$order->id}/apply-gift-card", [
            'code' => $code,
        ], $tokenB)->assertStatus(404);
    }

    // ── Redemption ────────────────────────────────────────────────────────────

    public function test_payment_redemption_depletes_gift_card_balance(): void
    {
        ['card' => $card, 'code' => $code] = $this->makeGiftCard([
            'initial_balance' => 20,
            'current_balance' => 20,
        ]);

        $order = Order::create([
            'order_number' => 'BG-REDEEM-01',
            'tracking_token' => 'redeem01',
            'type' => 'takeaway',
            'status' => 'pending',
            'subtotal' => 25.00,
            'subtotal_laar' => 2500,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 25.00,
            'total_laar' => 2500,
            'gift_card_id' => $card->id,
            'gift_card_discount_laar' => 2000,
        ]);

        DB::transaction(function () use ($order): void {
            app(GiftCardRedemptionService::class)->redeemForOrder($order->fresh());
        });

        $card->refresh();
        $this->assertEquals(0.0, (float) $card->current_balance);
        $this->assertEquals('depleted', $card->status);
        $this->assertDatabaseHas('gift_card_transactions', [
            'gift_card_id' => $card->id,
            'order_id' => $order->id,
            'type' => 'redeem',
        ]);
    }

    public function test_duplicate_redeem_does_not_double_debit(): void
    {
        ['card' => $card] = $this->makeGiftCard([
            'initial_balance' => 15,
            'current_balance' => 15,
        ]);

        $order = Order::create([
            'order_number' => 'BG-REDEEM-02',
            'tracking_token' => 'redeem02',
            'type' => 'takeaway',
            'status' => 'pending',
            'subtotal' => 20.00,
            'subtotal_laar' => 2000,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 20.00,
            'total_laar' => 2000,
            'gift_card_id' => $card->id,
            'gift_card_discount_laar' => 1500,
        ]);

        $service = app(GiftCardRedemptionService::class);
        DB::transaction(fn () => $service->redeemForOrder($order->fresh()));
        DB::transaction(fn () => $service->redeemForOrder($order->fresh()));

        $this->assertEquals(1, GiftCardTransaction::where('order_id', $order->id)->where('type', 'redeem')->count());
    }

    public function test_negative_balance_is_prevented_on_set_balance_laar(): void
    {
        ['card' => $card] = $this->makeGiftCard([
            'initial_balance' => 10,
            'current_balance' => 10,
        ]);

        $card->setBalanceLaar(-500);
        $card->save();

        $this->assertEquals(0, $card->balanceLaar());
        $this->assertEquals('depleted', $card->fresh()->status);
    }

    // ── Admin: list ───────────────────────────────────────────────────────────

    public function test_admin_can_list_gift_cards(): void
    {
        $this->makeGiftCard();

        $this->getJson('/api/admin/gift-cards', $this->adminHeaders)
            ->assertStatus(200)
            ->assertJsonStructure(['data']);
    }

    public function test_list_requires_auth(): void
    {
        $this->getJson('/api/admin/gift-cards')->assertStatus(401);
    }

    public function test_customer_token_cannot_issue_or_list_admin_gift_cards(): void
    {
        $customer = Customer::create(['name' => 'Gift Guard', 'phone' => '+9607333001']);
        $token = $customer->createToken('cust', ['customer'])->plainTextToken;
        $headers = ['Authorization' => "Bearer {$token}"];

        $this->getJson('/api/admin/gift-cards', $headers)->assertForbidden();
        $this->postJson('/api/admin/gift-cards', ['amount' => 25], $headers)->assertForbidden();
    }

    // ── Staff POS: apply / remove ─────────────────────────────────────────────

    public function test_staff_can_apply_gift_card_to_pos_order(): void
    {
        ['card' => $card, 'code' => $code] = $this->makeGiftCard([
            'initial_balance' => 20,
            'current_balance' => 20,
        ]);

        $item = $this->makeItem(false, 10, ['base_price' => 30.00]);
        $order = $this->makeOrder(null, [
            'type' => 'takeaway',
            'status' => 'pending',
            'subtotal' => 30.00,
            'subtotal_laar' => 3000,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 30.00,
            'total_laar' => 3000,
        ]);
        $order->items()->create([
            'item_id' => $item->id,
            'item_name' => $item->name,
            'quantity' => 1,
            'unit_price' => 30.00,
            'total_price' => 30.00,
        ]);

        $response = $this->postJson(
            "/api/pos/orders/{$order->id}/gift-card",
            ['code' => $code],
            $this->adminHeaders,
        )->assertOk();

        $order->refresh();
        $this->assertEquals($card->id, $order->gift_card_id);
        $this->assertGreaterThan(0, (int) $response->json('discount_laar'));
        $this->assertSame($card->masked_code, $response->json('order.gift_card_masked'));
    }

    public function test_staff_can_remove_gift_card_from_pos_order(): void
    {
        ['card' => $card] = $this->makeGiftCard([
            'initial_balance' => 20,
            'current_balance' => 20,
        ]);

        $order = $this->makeOrder(null, [
            'type' => 'takeaway',
            'status' => 'pending',
            'subtotal' => 30.00,
            'subtotal_laar' => 3000,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 30.00,
            'total_laar' => 3000,
            'gift_card_id' => $card->id,
            'gift_card_discount_laar' => 2000,
        ]);

        $this->deleteJson(
            "/api/pos/orders/{$order->id}/gift-card",
            [],
            $this->adminHeaders,
        )->assertOk();

        $order->refresh();
        $this->assertNull($order->gift_card_id);
        $this->assertSame(0, (int) $order->gift_card_discount_laar);
    }

    // ── Soft reservation + refund restore ─────────────────────────────────────

    public function test_second_unpaid_order_cannot_over_allocate_gift_card(): void
    {
        ['card' => $card, 'code' => $code] = $this->makeGiftCard([
            'initial_balance' => 40,
            'current_balance' => 40,
        ]);

        $customer = $this->makeCustomer();
        $item = $this->makeItem(false, 10, ['base_price' => 40.00]);

        $makeOrder = function (string $number) use ($customer, $item) {
            $order = $this->makeOrder($customer, [
                'order_number' => $number,
                'tracking_token' => $number,
                'type' => 'online_pickup',
                'status' => 'pending',
                'subtotal' => 40.00,
                'subtotal_laar' => 4000,
                'tax_amount' => 0,
                'discount_amount' => 0,
                'total' => 40.00,
                'total_laar' => 4000,
            ]);
            $order->items()->create([
                'item_id' => $item->id,
                'item_name' => $item->name,
                'quantity' => 1,
                'unit_price' => 40.00,
                'total_price' => 40.00,
            ]);

            return $order;
        };

        $orderA = $makeOrder('BG-HOLD-A');
        $orderB = $makeOrder('BG-HOLD-B');
        $token = $this->customerHeaders($customer);

        $this->postJson("/api/orders/{$orderA->id}/apply-gift-card", ['code' => $code], $token)
            ->assertOk()
            ->assertJsonPath('discount_laar', 4000);

        $this->postJson("/api/orders/{$orderB->id}/apply-gift-card", ['code' => $code], $token)
            ->assertStatus(422);

        $card->refresh();
        $this->assertSame(40.0, (float) $card->current_balance);
        $this->assertNull($orderB->fresh()->gift_card_id);
    }

    public function test_redeem_fails_closed_when_balance_short(): void
    {
        ['card' => $card] = $this->makeGiftCard([
            'initial_balance' => 10,
            'current_balance' => 10,
        ]);

        $order = Order::create([
            'order_number' => 'BG-SHORT-01',
            'tracking_token' => 'short01',
            'type' => 'takeaway',
            'status' => 'pending',
            'subtotal' => 25.00,
            'subtotal_laar' => 2500,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 25.00,
            'total_laar' => 2500,
            'gift_card_id' => $card->id,
            'gift_card_discount_laar' => 2500,
        ]);

        $this->expectException(\RuntimeException::class);

        DB::transaction(function () use ($order): void {
            app(GiftCardRedemptionService::class)->redeemForOrder($order->fresh());
        });
    }

    public function test_refund_restores_gift_card_balance(): void
    {
        ['card' => $card] = $this->makeGiftCard([
            'initial_balance' => 30,
            'current_balance' => 30,
        ]);

        $order = Order::create([
            'order_number' => 'BG-REFUND-GC',
            'tracking_token' => 'refundgc',
            'type' => 'takeaway',
            'status' => 'paid',
            'subtotal' => 30.00,
            'subtotal_laar' => 3000,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 30.00,
            'total_laar' => 3000,
            'gift_card_id' => $card->id,
            'gift_card_discount_laar' => 3000,
        ]);

        DB::transaction(function () use ($order): void {
            app(GiftCardRedemptionService::class)->redeemForOrder($order->fresh());
        });

        $card->refresh();
        $this->assertSame(0.0, (float) $card->current_balance);
        $this->assertSame('depleted', $card->status);

        $refund = Refund::create([
            'order_id' => $order->id,
            'user_id' => $this->makeOwner()->id,
            'amount' => 30.00,
            'status' => 'completed',
            'reason' => 'test restore',
        ]);

        app(RestoreGiftCardOnRefundListener::class)->handle(new OrderRefunded(
            new OrderRefundedData(
                refundId: $refund->id,
                orderId: $order->id,
                orderNumber: $order->order_number,
                amount: 30.00,
                reason: 'test restore',
                refundRatio: 1.0,
            ),
        ));

        $card->refresh();
        $this->assertSame(30.0, (float) $card->current_balance);
        $this->assertSame('active', $card->status);
        $this->assertDatabaseHas('gift_card_transactions', [
            'gift_card_id' => $card->id,
            'order_id' => $order->id,
            'refund_id' => $refund->id,
            'type' => 'refund',
            'amount' => 30,
        ]);

        // Idempotent on replay
        app(RestoreGiftCardOnRefundListener::class)->handle(new OrderRefunded(
            new OrderRefundedData(
                refundId: $refund->id,
                orderId: $order->id,
                orderNumber: $order->order_number,
                amount: 30.00,
                reason: 'test restore',
                refundRatio: 1.0,
            ),
        ));

        $this->assertSame(1, GiftCardTransaction::where('order_id', $order->id)->where('type', 'refund')->count());
        $this->assertSame(30.0, (float) $card->fresh()->current_balance);
    }
}

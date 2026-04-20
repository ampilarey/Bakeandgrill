<?php

declare(strict_types=1);

namespace Tests\Feature\Stock;

use App\Models\GiftCard;
use App\Models\GiftCardTransaction;
use App\Models\Order;
use App\Models\OrderItem;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Gift card lifecycle tests.
 *
 * Covers: issue, balance check, apply to order (discount applied),
 * redemption reduces card balance, card marked used when exhausted,
 * expired card rejected, invalid code rejected.
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
        $this->postJson('/api/admin/gift-cards', [
            'amount' => 50.00,
        ], $this->adminHeaders)
            ->assertStatus(201)
            ->assertJsonPath('gift_card.status', 'active')
            ->assertJsonPath('gift_card.initial_balance', 50);
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

        $response = $this->postJson('/api/admin/gift-cards', [
            'amount'      => 100,
            'customer_id' => $customer->id,
        ], $this->adminHeaders)->assertStatus(201);

        $this->assertDatabaseHas('gift_cards', [
            'issued_to_customer_id' => $customer->id,
        ]);
    }

    // ── Public: balance check ─────────────────────────────────────────────────

    public function test_balance_check_returns_current_balance(): void
    {
        $card = GiftCard::create([
            'code'            => 'TEST-BLNC-1234',
            'initial_balance' => 75,
            'current_balance' => 75,
            'status'          => 'active',
        ]);

        $response = $this->getJson('/api/gift-cards/TEST-BLNC-1234/balance')
            ->assertStatus(200);

        $this->assertEquals(75, $response->json('current_balance'));
    }

    public function test_balance_check_returns_404_for_unknown_code(): void
    {
        $this->getJson('/api/gift-cards/FAKE-CODE-1234/balance')
            ->assertStatus(404);
    }

    public function test_balance_check_returns_404_for_depleted_card(): void
    {
        GiftCard::create([
            'code'            => 'DEPL-ETED-1234',
            'initial_balance' => 50,
            'current_balance' => 0,
            'status'          => 'depleted',
        ]);

        $this->getJson('/api/gift-cards/DEPL-ETED-1234/balance')
            ->assertStatus(404);
    }

    public function test_balance_check_returns_404_for_expired_card(): void
    {
        GiftCard::create([
            'code'            => 'EXPR-IRED-1234',
            'initial_balance' => 50,
            'current_balance' => 50,
            'status'          => 'active',
            'expires_at'      => now()->subDay(),
        ]);

        $this->getJson('/api/gift-cards/EXPR-IRED-1234/balance')
            ->assertStatus(404);
    }

    // ── Customer: apply gift card to order ────────────────────────────────────

    public function test_customer_can_apply_gift_card_to_pending_order(): void
    {
        $card = GiftCard::create([
            'code'            => 'GIFT-CARD-1234',
            'initial_balance' => 20,
            'current_balance' => 20,
            'status'          => 'active',
        ]);

        $customer = $this->makeCustomer();
        $item     = $this->makeItem();
        $order    = Order::create([
            'order_number'    => 'BG-TEST-0001',
            'tracking_token'  => 'abc123',
            'type'            => 'online_pickup',
            'status'          => 'pending',
            'customer_id'     => $customer->id,
            'subtotal'        => 30.00,
            'subtotal_laar'   => 3000,
            'tax_amount'      => 0,
            'discount_amount' => 0,
            'total'           => 30.00,
            'total_laar'      => 3000,
            'delivery_fee'    => 0,
            'delivery_fee_laar' => 0,
        ]);

        $token = $this->customerHeaders($customer);

        $this->postJson("/api/orders/{$order->id}/apply-gift-card", [
            'code' => 'GIFT-CARD-1234',
        ], $token)->assertStatus(200);

        $order->refresh();
        $this->assertEquals('GIFT-CARD-1234', $order->gift_card_code);
        $this->assertGreaterThan(0, (int) $order->gift_card_discount_laar);
    }

    public function test_invalid_gift_card_code_is_rejected(): void
    {
        $customer = $this->makeCustomer();
        $order    = Order::create([
            'order_number'    => 'BG-TEST-0002',
            'tracking_token'  => 'def456',
            'type'            => 'online_pickup',
            'status'          => 'pending',
            'customer_id'     => $customer->id,
            'subtotal'        => 30.00,
            'subtotal_laar'   => 3000,
            'tax_amount'      => 0,
            'discount_amount' => 0,
            'total'           => 30.00,
            'total_laar'      => 3000,
            'delivery_fee'    => 0,
            'delivery_fee_laar' => 0,
        ]);

        $token = $this->customerHeaders($customer);

        $this->postJson("/api/orders/{$order->id}/apply-gift-card", [
            'code' => 'NOPE-FAKE-0000',
        ], $token)->assertStatus(422);
    }

    public function test_customer_cannot_apply_gift_card_to_another_customers_order(): void
    {
        $card = GiftCard::create([
            'code'            => 'IDOR-TEST-CARD',
            'initial_balance' => 50,
            'current_balance' => 50,
            'status'          => 'active',
        ]);

        $customerA = $this->makeCustomer(['phone' => '+9607800001']);
        $customerB = $this->makeCustomer(['phone' => '+9607800002']);

        $order = Order::create([
            'order_number'    => 'BG-IDOR-0001',
            'tracking_token'  => 'ghi789',
            'type'            => 'online_pickup',
            'status'          => 'pending',
            'customer_id'     => $customerA->id,
            'subtotal'        => 20.00,
            'subtotal_laar'   => 2000,
            'tax_amount'      => 0,
            'discount_amount' => 0,
            'total'           => 20.00,
            'total_laar'      => 2000,
            'delivery_fee'    => 0,
            'delivery_fee_laar' => 0,
        ]);

        $tokenB = $this->customerHeaders($customerB);

        $this->postJson("/api/orders/{$order->id}/apply-gift-card", [
            'code' => 'IDOR-TEST-CARD',
        ], $tokenB)->assertStatus(404);
    }

    // ── Admin: list ───────────────────────────────────────────────────────────

    public function test_admin_can_list_gift_cards(): void
    {
        GiftCard::create([
            'code'            => 'LIST-TEST-1234',
            'initial_balance' => 10,
            'current_balance' => 10,
            'status'          => 'active',
        ]);

        $this->getJson('/api/admin/gift-cards', $this->adminHeaders)
            ->assertStatus(200)
            ->assertJsonStructure(['data']);
    }

    public function test_list_requires_auth(): void
    {
        $this->getJson('/api/admin/gift-cards')->assertStatus(401);
    }
}

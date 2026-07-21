<?php

declare(strict_types=1);

namespace Tests\Feature\GiftCard;

use App\Domains\Orders\Services\OrderTotalsCalculator;
use App\Domains\Payments\Services\GiftCardCodeService;
use App\Models\GiftCard;
use App\Models\GiftCardTransaction;
use App\Models\Order;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class GiftCardLifecycleFixesTest extends TestCase
{
    use RefreshDatabase;

    // FIX 7 — expired reason payload -----------------------------------------

    public function test_balance_endpoint_returns_reason_expired_with_expires_at(): void
    {
        $svc = app(GiftCardCodeService::class);
        $gen = $svc->generate();
        $expiry = now()->subDay()->toDateString();

        GiftCard::create([
            'code_hash' => $gen['hash'],
            'code_last4' => $gen['last4'],
            'initial_balance' => 100,
            'current_balance' => 100,
            'status' => 'active',
            'expires_at' => $expiry,
        ]);

        $this->postJson('/api/gift-cards/balance', ['code' => $gen['plain']])
            ->assertStatus(404)
            ->assertJsonPath('reason', 'expired')
            ->assertJsonPath('expires_at', $expiry);
    }

    public function test_balance_endpoint_keeps_404_for_unknown(): void
    {
        $this->postJson('/api/gift-cards/balance', ['code' => 'AAAA-AAAA-AAAA-AAAA'])
            ->assertStatus(404);
    }

    public function test_apply_to_order_returns_reason_expired(): void
    {
        $customer = $this->makeCustomer();
        $svc = app(GiftCardCodeService::class);
        $gen = $svc->generate();
        $expiry = now()->subDay()->toDateString();

        GiftCard::create([
            'code_hash' => $gen['hash'],
            'code_last4' => $gen['last4'],
            'initial_balance' => 100,
            'current_balance' => 100,
            'status' => 'active',
            'expires_at' => $expiry,
        ]);

        $order = Order::create([
            'order_number' => 'GC-EXP-1',
            'tracking_token' => 'gcexp1',
            'type' => 'takeaway',
            'status' => 'payment_pending',
            'customer_id' => $customer->id,
            'subtotal' => 50,
            'subtotal_laar' => 5000,
            'tax_amount' => 0,
            'tax_laar' => 0,
            'total' => 50,
            'total_laar' => 5000,
        ]);

        $this->postJson(
            "/api/orders/{$order->id}/apply-gift-card",
            ['code' => $gen['plain']],
            $this->customerHeaders($customer),
        )
            ->assertStatus(422)
            ->assertJsonPath('reason', 'expired')
            ->assertJsonPath('expires_at', $expiry);
    }

    // FIX 8a — cancel write-off ---------------------------------------------

    public function test_cancel_writes_void_txn_for_residual_and_zeros_balance(): void
    {
        $owner = $this->makeOwner();
        $card = GiftCard::create([
            'code_hash' => hash('sha256', 'cancel-void'),
            'code_last4' => 'CVOD',
            'initial_balance' => 80,
            'current_balance' => 60,
            'status' => 'active',
        ]);

        $this->postJson("/api/admin/gift-cards/{$card->id}/cancel", [], $this->staffHeaders($owner))
            ->assertOk()
            ->assertJsonPath('gift_card.status', 'cancelled')
            ->assertJsonPath('gift_card.current_balance', 0);

        $this->assertEqualsWithDelta(0.0, (float) $card->fresh()->current_balance, 0.001);
        $void = GiftCardTransaction::where('gift_card_id', $card->id)
            ->where('type', 'void')->first();
        $this->assertNotNull($void);
        $this->assertEqualsWithDelta(-60.0, (float) $void->amount, 0.001);
        $this->assertEqualsWithDelta(0.0, (float) $void->balance_after, 0.001);
    }

    public function test_cancel_of_already_zero_card_writes_no_void_txn(): void
    {
        $owner = $this->makeOwner();
        $card = GiftCard::create([
            'code_hash' => hash('sha256', 'cancel-zero'),
            'code_last4' => 'CZRO',
            'initial_balance' => 80,
            'current_balance' => 0,
            // Not depleted yet — controller rejects depleted for cancel.
            'status' => 'active',
        ]);

        $this->postJson("/api/admin/gift-cards/{$card->id}/cancel", [], $this->staffHeaders($owner))
            ->assertOk();

        $this->assertSame(
            0,
            GiftCardTransaction::where('gift_card_id', $card->id)->where('type', 'void')->count(),
        );
    }

    // FIX 8b — OrderTotalsCalculator early-return ---------------------------

    public function test_recalculate_leaves_gift_card_order_unchanged(): void
    {
        $order = Order::create([
            'order_number' => 'GC-CALC-1',
            'tracking_token' => 'gccalc1',
            'type' => 'gift_card',
            'status' => 'payment_pending',
            'subtotal' => 200,
            'subtotal_laar' => 20000,
            'tax_amount' => 0,
            'tax_laar' => 0,
            'total' => 200,
            'total_laar' => 20000,
        ]);

        app(OrderTotalsCalculator::class)->recalculateAndPersist($order);

        $fresh = $order->fresh();
        $this->assertEqualsWithDelta(200.0, (float) $fresh->total, 0.001);
        $this->assertSame(20000, (int) $fresh->total_laar);
        $this->assertSame(20000, (int) $fresh->subtotal_laar);
    }

    // FIX 8d — purchase requires integer MVR --------------------------------

    public function test_purchase_rejects_fractional_amount(): void
    {
        $this->mock(\App\Domains\Payments\Services\PaymentService::class, function ($mock): void {
            $mock->shouldReceive('initiateBmlPayment')->never();
        });

        $customer = $this->makeCustomer(['phone' => '+9607010101']);

        $this->postJson('/api/gift-cards/purchase', [
            'amount' => 100.50,
            'recipient_phone' => '+9607010101',
            'sender_name' => 'Buyer',
        ], $this->customerHeaders($customer))
            ->assertStatus(422);
    }

    // FIX 8f — GiftCardCodeService alphabet ---------------------------------

    public function test_generate_produces_only_alphabet_characters(): void
    {
        $svc = app(GiftCardCodeService::class);
        $seen = '';
        for ($i = 0; $i < 20; $i++) {
            $gen = $svc->generate();
            $seen .= str_replace('-', '', $gen['plain']);
        }
        $allowed = str_split(GiftCardCodeService::CODE_ALPHABET);
        foreach (str_split($seen) as $c) {
            $this->assertContains($c, $allowed, "Generated char '{$c}' not in alphabet");
        }
        // Forbidden lookalikes must never appear.
        foreach (['0', '1', 'O', 'I', 'L'] as $bad) {
            $this->assertStringNotContainsString($bad, $seen);
        }
    }

    public function test_find_by_code_still_matches_direct_hash_insert_with_lookalikes(): void
    {
        // Legacy code that DID contain lookalikes (pre-alphabet change) — its
        // stored hash still resolves via findByCode because hashing itself is
        // untouched.
        $svc = app(GiftCardCodeService::class);
        $legacy = 'ABCD-1O0I-EFGH-IJKL';

        GiftCard::create([
            'code_hash' => $svc->hash($legacy),
            'code_last4' => $svc->last4($legacy),
            'initial_balance' => 25,
            'current_balance' => 25,
            'status' => 'active',
        ]);

        $found = $svc->findByCode($legacy);
        $this->assertNotNull($found);
        $this->assertSame(25.0, (float) $found->initial_balance);
    }
}

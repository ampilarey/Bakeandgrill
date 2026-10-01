<?php

declare(strict_types=1);

namespace Tests\Feature\GiftCard;

use App\Domains\Deposits\Services\DepositLedgerService;
use App\Domains\Payments\Services\GiftCardRedemptionService;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\CashMovement;
use App\Models\GiftCard;
use App\Models\GiftCardTransaction;
use App\Models\Shift;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\Helpers\ModelHelpers;
use Tests\TestCase;

/**
 * Gift cards and customer deposits audit, 2026-10-01.
 */
class GiftCardDepositAuditTest extends TestCase
{
    use ModelHelpers;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
    }

    public function test_a_card_is_good_for_the_whole_of_its_last_day(): void
    {
        ['code' => $today] = $this->makeGiftCard(['expires_at' => now()->toDateString()]);
        ['code' => $yesterday] = $this->makeGiftCard(['expires_at' => now()->subDay()->toDateString()]);

        $this->postJson('/api/gift-cards/balance', ['code' => $today])->assertOk()->assertJsonPath('current_balance', 50);
        $this->postJson('/api/gift-cards/balance', ['code' => $yesterday])->assertNotFound()->assertJsonPath('reason', 'expired');
    }

    public function test_extending_a_card_to_today_does_not_expire_it_on_the_spot(): void
    {
        ['card' => $card] = $this->makeGiftCard(['expires_at' => now()->subDays(3)->toDateString(), 'status' => 'expired']);

        $this->patchJson("/api/admin/gift-cards/{$card->id}/expiry", ['expires_at' => now()->toDateString()], $this->staffHeaders($this->makeOwner()))
            ->assertOk();

        $this->assertFalse($card->fresh()->isExpired());
        $this->assertSame('active', $card->fresh()->status);
    }

    public function test_an_order_placed_while_the_card_was_good_is_still_paid_by_it(): void
    {
        ['card' => $card] = $this->makeGiftCard(['expires_at' => now()->subDay()->toDateString()]);
        $order = $this->makeOrder(null, [
            'gift_card_id' => $card->id, 'gift_card_discount_laar' => 2000, 'status' => 'payment_pending',
            'created_at' => now()->subDay()->setTime(23, 50), 'total' => 30, 'subtotal' => 50,
        ]);

        DB::transaction(fn () => app(GiftCardRedemptionService::class)->redeemForOrder($order->fresh()));

        $this->assertSame(1, GiftCardTransaction::where('order_id', $order->id)->where('type', 'redeem')->count());
        $this->assertEquals(30.0, (float) $card->fresh()->current_balance);

        // An order placed after the last day is still refused.
        ['card' => $card2] = $this->makeGiftCard(['expires_at' => now()->subDay()->toDateString()]);
        $late = $this->makeOrder(null, [
            'gift_card_id' => $card2->id, 'gift_card_discount_laar' => 2000, 'status' => 'payment_pending',
            'total' => 30, 'subtotal' => 50,
        ]);
        $this->expectException(\RuntimeException::class);
        DB::transaction(fn () => app(GiftCardRedemptionService::class)->redeemForOrder($late->fresh()));
    }

    public function test_a_refund_onto_an_expired_card_reopens_it_so_the_money_can_be_spent(): void
    {
        ['card' => $card] = $this->makeGiftCard(['current_balance' => 0, 'status' => 'depleted', 'expires_at' => now()->addDay()->toDateString()]);
        $order = $this->makePaidOrder(null, ['gift_card_id' => $card->id, 'gift_card_discount_laar' => 5000]);
        GiftCardTransaction::create(['gift_card_id' => $card->id, 'order_id' => $order->id, 'amount' => -50, 'type' => 'redeem', 'balance_after' => 0]);
        $card->forceFill(['expires_at' => now()->subDays(5)->toDateString(), 'status' => 'expired'])->save();

        app(GiftCardRedemptionService::class)->restoreForOrder($order, 1.0, null);

        $card->refresh();
        $this->assertEquals(50.0, (float) $card->current_balance);
        $this->assertSame('active', $card->status);
        $this->assertSame(now()->addDays(GiftCardRedemptionService::REFUND_GRACE_DAYS)->toDateString(), $card->expires_at->toDateString());
    }

    public function test_an_admin_issued_card_says_how_it_was_paid_and_cash_goes_in_the_drawer(): void
    {
        $manager = $this->makeManager();
        $headers = $this->staffHeaders($manager);
        $shift = Shift::create(['user_id' => $manager->id, 'opened_at' => now(), 'opening_cash' => 0]);

        $this->postJson('/api/admin/gift-cards', ['amount' => 200, 'paid_by' => 'cash'], $headers)->assertCreated();
        $this->assertSame(1, CashMovement::where('shift_id', $shift->id)->where('type', 'cash_in')->where('amount', 200)->count());
        $this->assertSame('cash', GiftCardTransaction::where('type', 'load')->latest('id')->value('paid_by'));
        $this->assertSame($manager->id, (int) GiftCardTransaction::where('type', 'load')->latest('id')->value('user_id'));

        // Free value above the owner limit needs an owner.
        $this->postJson('/api/admin/gift-cards', ['amount' => 600, 'paid_by' => 'complimentary'], $headers)
            ->assertStatus(422)
            ->assertJsonFragment(['message' => 'Complimentary gift cards above MVR 500.00 need an owner. Ask an owner to issue this one.']);
        $this->postJson('/api/admin/gift-cards', ['amount' => 400, 'paid_by' => 'complimentary'], $headers)->assertCreated();
        $this->app['auth']->forgetGuards();
        $this->postJson('/api/admin/gift-cards', ['amount' => 600, 'paid_by' => 'complimentary'], $this->staffHeaders($this->makeOwner()))->assertCreated();
        $this->app['auth']->forgetGuards();

        // A top-up says how it was paid too.
        $card = GiftCard::latest('id')->first();
        $this->postJson("/api/admin/gift-cards/{$card->id}/top-up", ['amount' => 900, 'paid_by' => 'complimentary'], $headers)->assertStatus(422);
        $this->postJson("/api/admin/gift-cards/{$card->id}/top-up", ['amount' => 900, 'paid_by' => 'card', 'reference' => 'SLIP 4411'], $headers)->assertOk();
        $this->assertSame('SLIP 4411', GiftCardTransaction::where('gift_card_id', $card->id)->latest('id')->value('reference'));
    }

    public function test_cash_for_a_card_needs_an_open_shift(): void
    {
        $this->postJson('/api/admin/gift-cards', ['amount' => 50, 'paid_by' => 'cash'], $this->staffHeaders($this->makeManager()))
            ->assertStatus(422)
            ->assertJsonFragment(['message' => 'Open a shift before taking cash for a gift card.']);
        $this->assertSame(0, GiftCard::count());
    }

    public function test_deposit_payouts_cannot_be_split_under_the_owner_limit(): void
    {
        /** @var User $manager */
        $manager = $this->makeManager();
        $customer = $this->makeCustomer();
        $ledger = app(DepositLedgerService::class);
        $ledger->topUp($customer, 100000, 'bank_transfer', $this->makeOwner());

        $ledger->payoutDeposit($customer, 30000, 'bank_transfer', $manager);

        try {
            $ledger->payoutDeposit($customer, 30000, 'bank_transfer', $manager);
            $this->fail('the second half of a split payout should need an owner');
        } catch (HttpException $e) {
            $this->assertSame(422, $e->getStatusCode());
            $this->assertStringContainsString('you have paid out MVR 300.00 in the last 24 hours', $e->getMessage());
        }

        // An owner can still record it.
        $ledger->payoutDeposit($customer, 30000, 'bank_transfer', $this->makeOwner());
    }
}

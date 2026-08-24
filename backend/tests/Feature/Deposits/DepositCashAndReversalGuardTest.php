<?php

declare(strict_types=1);

namespace Tests\Feature\Deposits;

use App\Domains\Deposits\Services\DepositLedgerService;
use App\Models\CashMovement;
use App\Models\Customer;
use App\Models\CustomerDepositLedger;
use App\Models\Role;
use App\Models\Shift;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Two gaps around customer deposits.
 *
 * An owner may pay out deposit cash without a shift of their own — they are
 * not drawer-bound. But the money is still physical: with no CashMovement the
 * drawer it came out of just counts short with nothing to explain it, and a
 * cashier gets asked why.
 *
 * And the reversal guard against double-crediting a wallet was a
 * check-then-insert with no unique constraint behind it, unlike deposit usage
 * which has `unique(payment_id)` underneath the same shape.
 */
class DepositCashAndReversalGuardTest extends TestCase
{
    use RefreshDatabase;

    private function owner(): User
    {
        $role = Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner']);

        return User::factory()->create(['role_id' => $role->id]);
    }

    private function cashier(): User
    {
        $role = Role::firstOrCreate(['slug' => 'cashier'], ['name' => 'Cashier']);

        return User::factory()->create(['role_id' => $role->id]);
    }

    private function openShiftFor(User $user): Shift
    {
        return Shift::create([
            'user_id' => $user->id,
            'opening_cash' => 100.0,
            'opened_at' => now()->subHour(),
            'expected_cash' => 100.0,
            'closing_cash' => 100.0,
            'variance' => 0,
        ]);
    }

    private function customerWithBalance(int $balanceLaar): Customer
    {
        $customer = Customer::factory()->create();
        $owner = $this->owner();
        $account = app(DepositLedgerService::class)->getOrCreateAccount($customer, $owner);
        $account->update(['balance_laar' => $balanceLaar, 'status' => 'active']);

        return $customer->fresh();
    }

    public function test_an_owner_payout_is_charged_to_the_one_open_drawer(): void
    {
        // THE test. The owner has no shift, but a cashier's drawer is open and
        // that is where the cash came from — so the drawer's expectation has
        // to drop with it.
        $cashier = $this->cashier();
        $shift = $this->openShiftFor($cashier);
        $customer = $this->customerWithBalance(20000);

        app(DepositLedgerService::class)->payoutDeposit(
            $customer,
            5000,
            'cash',
            $this->owner(),
        );

        $movement = CashMovement::where('shift_id', $shift->id)->where('type', 'cash_out')->first();
        $this->assertNotNull($movement, 'the open drawer must show the payout');
        $this->assertSame(50.0, (float) $movement->amount);
    }

    public function test_no_movement_is_invented_when_no_drawer_is_open(): void
    {
        // Nothing to attribute to, and guessing would be worse than silence.
        $customer = $this->customerWithBalance(20000);

        app(DepositLedgerService::class)->payoutDeposit(
            $customer,
            5000,
            'cash',
            $this->owner(),
        );

        $this->assertSame(0, CashMovement::count());
        $this->assertSame(15000, (int) $customer->fresh()->depositAccount->balance_laar);
    }

    public function test_no_movement_is_invented_when_several_drawers_are_open(): void
    {
        // Two tills open: which one the note came from is genuinely unknown.
        $this->openShiftFor($this->cashier());
        $this->openShiftFor($this->cashier());
        $customer = $this->customerWithBalance(20000);

        app(DepositLedgerService::class)->payoutDeposit(
            $customer,
            5000,
            'cash',
            $this->owner(),
        );

        $this->assertSame(0, CashMovement::count());
    }

    public function test_a_cashier_still_pays_out_of_their_own_drawer(): void
    {
        // The ordinary path is unchanged — an owner with a shift, or any
        // cashier, charges their own till, not "the one open drawer".
        $cashier = $this->cashier();
        $ownShift = $this->openShiftFor($cashier);
        $otherShift = $this->openShiftFor($this->cashier());
        $customer = $this->customerWithBalance(20000);

        app(DepositLedgerService::class)->payoutDeposit(
            $customer,
            5000,
            'cash',
            $cashier,
        );

        $this->assertSame(1, CashMovement::where('shift_id', $ownShift->id)->count());
        $this->assertSame(0, CashMovement::where('shift_id', $otherShift->id)->count());
    }

    public function test_the_database_refuses_a_second_reversal_for_one_refund(): void
    {
        // The guard in reverseUsageForOrderRefund stops this in the
        // application; this proves the constraint holds even if a future
        // caller forgets, which is the whole point of putting it in the
        // schema rather than in a method.
        $customer = $this->customerWithBalance(10000);
        $owner = $this->owner();
        $account = $customer->depositAccount;

        $row = [
            'customer_id' => $customer->id,
            'deposit_account_id' => $account->id,
            'type' => 'reversal',
            'amount_laar' => 2500,
            'balance_before_laar' => 10000,
            'balance_after_laar' => 12500,
            'actor_user_id' => $owner->id,
        ];

        $refund = \App\Models\Refund::create([
            'order_id' => \App\Models\Order::factory()->create()->id,
            'amount' => 25.00,
            'status' => 'approved',
            'reason' => 'Test',
            'requested_at' => now(),
        ]);

        CustomerDepositLedger::create(array_merge($row, ['refund_id' => $refund->id]));

        $this->expectException(\Illuminate\Database\QueryException::class);
        CustomerDepositLedger::create(array_merge($row, ['refund_id' => $refund->id]));
    }

    public function test_rows_without_a_refund_are_unaffected_by_the_constraint(): void
    {
        // Top-ups, payouts and usage all carry a null refund_id. NULLs are
        // distinct in a unique index, so many of them coexist — if this
        // breaks, ordinary deposit activity stops.
        $customer = $this->customerWithBalance(0);
        $owner = $this->owner();

        app(DepositLedgerService::class)->topUp($customer, 5000, 'cash', $owner);
        app(DepositLedgerService::class)->topUp($customer, 5000, 'cash', $owner);

        $this->assertSame(2, CustomerDepositLedger::where('type', 'top_up')->count());
    }
}

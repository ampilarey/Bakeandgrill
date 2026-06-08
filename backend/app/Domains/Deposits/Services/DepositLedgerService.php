<?php

declare(strict_types=1);

namespace App\Domains\Deposits\Services;

use App\Domains\Credit\Services\CustomerCreditService;
use App\Models\CashMovement;
use App\Models\Customer;
use App\Models\CustomerDepositAccount;
use App\Models\CustomerDepositLedger;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Refund;
use App\Models\User;
use App\Services\AuditLogService;
use App\Services\ShiftAccessService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

final class DepositLedgerService
{
    public function __construct(
        private readonly DepositEligibilityService $eligibility,
        private readonly AuditLogService $audit,
        private readonly ShiftAccessService $shifts,
    ) {}

    public function getOrCreateAccount(Customer $customer, ?User $actor = null): CustomerDepositAccount
    {
        return CustomerDepositAccount::firstOrCreate(
            ['customer_id' => $customer->id],
            [
                'balance_laar' => 0,
                'status' => 'active',
                'created_by' => $actor?->id,
                'updated_by' => $actor?->id,
            ],
        );
    }

    public function receiveDeposit(
        Customer $customer,
        int $amountLaar,
        string $method,
        User $actor,
        ?string $reference = null,
        ?string $notes = null,
        ?Request $request = null,
    ): CustomerDepositLedger {
        return $this->topUp($customer, $amountLaar, $method, $actor, $reference, $notes, $request);
    }

    public function topUp(
        Customer $customer,
        int $amountLaar,
        string $method,
        User $actor,
        ?string $reference = null,
        ?string $notes = null,
        ?Request $request = null,
    ): CustomerDepositLedger {
        $allowedMethods = ['cash', 'card', 'bank_transfer', 'online', 'bml'];
        if (!in_array($method, $allowedMethods, true)) {
            abort(422, 'Invalid top-up method.');
        }

        if ($amountLaar <= 0) {
            abort(422, 'Top-up amount must be greater than zero.');
        }

        return DB::transaction(function () use ($customer, $amountLaar, $method, $actor, $reference, $notes, $request) {
            $account = CustomerDepositAccount::lockForUpdate()
                ->firstOrCreate(
                    ['customer_id' => $customer->id],
                    [
                        'balance_laar' => 0,
                        'status' => 'active',
                        'created_by' => $actor->id,
                    ],
                );

            if ($account->status === 'closed') {
                abort(422, 'Deposit account is closed.');
            }

            $shift = null;
            if ($method === 'cash') {
                $isOwner = $actor->role?->slug === 'owner';
                $shift = $this->shifts->findOpenShift($actor);
                if ($shift === null && !$isOwner) {
                    abort(422, 'Open a shift before recording a cash deposit top-up.');
                }
            }

            $balanceBefore = (int) $account->balance_laar;
            $newBalance = $balanceBefore + $amountLaar;
            $account->update([
                'balance_laar' => $newBalance,
                'status' => $account->status === 'closed' ? 'active' : $account->status,
                'updated_by' => $actor->id,
            ]);

            if ($method === 'cash' && $shift !== null) {
                CashMovement::create([
                    'shift_id' => $shift->id,
                    'user_id' => $actor->id,
                    'type' => 'cash_in',
                    'amount' => round($amountLaar / 100, 2),
                    'reason' => 'Customer deposit received — ' . ($customer->name ?? $customer->phone),
                ]);
            }

            $ledger = $this->writeLedger($account, 'top_up', $amountLaar, $balanceBefore, $newBalance, $actor, [
                'method' => $method,
                'shift_id' => $shift?->id,
                'reference' => $reference,
                'notes' => $notes ?? $reference,
            ]);

            $this->audit->log(
                'customer.deposit.top_up',
                'Customer',
                $customer->id,
                ['balance_laar' => $balanceBefore],
                ['balance_laar' => $newBalance, 'amount_laar' => $amountLaar, 'method' => $method],
                ['ledger_id' => $ledger->id],
                $request,
            );

            return $ledger;
        });
    }

    public function adjust(
        Customer $customer,
        int $amountLaar,
        User $actor,
        ?string $notes = null,
        ?Request $request = null,
    ): CustomerDepositLedger {
        if ($amountLaar === 0) {
            abort(422, 'Adjustment amount cannot be zero.');
        }

        return DB::transaction(function () use ($customer, $amountLaar, $actor, $notes, $request) {
            $account = $this->getOrCreateAccount($customer, $actor);
            $locked = CustomerDepositAccount::lockForUpdate()->findOrFail($account->id);

            if ($locked->status === 'closed') {
                abort(422, 'Deposit account is closed.');
            }

            $balanceBefore = (int) $locked->balance_laar;
            $newBalance = $balanceBefore + $amountLaar;
            if ($newBalance < 0) {
                abort(422, 'Adjustment would make deposit balance negative.');
            }

            $locked->update([
                'balance_laar' => $newBalance,
                'updated_by' => $actor->id,
            ]);

            $type = $amountLaar > 0 ? 'adjustment_add' : 'adjustment_deduct';

            $ledger = $this->writeLedger($locked, $type, $amountLaar, $balanceBefore, $newBalance, $actor, [
                'method' => 'adjustment',
                'notes' => $notes,
            ]);

            $this->audit->log(
                'customer.deposit.adjustment',
                'Customer',
                $customer->id,
                [],
                ['amount_laar' => $amountLaar, 'balance_after_laar' => $newBalance],
                ['ledger_id' => $ledger->id],
                $request,
            );

            return $ledger;
        });
    }

    public function freezeAccount(Customer $customer, User $actor, ?Request $request = null): CustomerDepositAccount
    {
        return $this->setStatus($customer, 'frozen', $actor, $request);
    }

    public function unfreezeAccount(Customer $customer, User $actor, ?Request $request = null): CustomerDepositAccount
    {
        return $this->setStatus($customer, 'active', $actor, $request);
    }

    public function setStatus(
        Customer $customer,
        string $status,
        User $actor,
        ?Request $request = null,
    ): CustomerDepositAccount {
        if (!in_array($status, ['active', 'frozen', 'closed'], true)) {
            abort(422, 'Invalid deposit account status.');
        }

        return DB::transaction(function () use ($customer, $status, $actor, $request) {
            $account = $this->getOrCreateAccount($customer, $actor);
            $locked = CustomerDepositAccount::lockForUpdate()->findOrFail($account->id);
            $old = $this->eligibility->depositSummary($customer, $locked);

            $locked->update([
                'status' => $status,
                'updated_by' => $actor->id,
            ]);

            $this->audit->log(
                'customer.deposit.status_updated',
                'Customer',
                $customer->id,
                $old,
                $this->eligibility->depositSummary($customer, $locked->fresh()),
                ['status' => $status],
                $request,
            );

            return $locked->fresh();
        });
    }

    public function useDepositForOrder(
        Customer $customer,
        Order $order,
        Payment $payment,
        User $actor,
        ?Request $request = null,
    ): ?CustomerDepositLedger {
        return $this->recordUsage($customer, $order, $payment, $actor, $request);
    }

    public function recordUsage(
        Customer $customer,
        Order $order,
        Payment $payment,
        User $actor,
        ?Request $request = null,
    ): ?CustomerDepositLedger {
        if (CustomerDepositLedger::where('payment_id', $payment->id)->exists()) {
            return CustomerDepositLedger::where('payment_id', $payment->id)->first();
        }

        return DB::transaction(function () use ($customer, $order, $payment, $actor, $request) {
            $account = CustomerDepositAccount::lockForUpdate()
                ->where('customer_id', $customer->id)
                ->first();

            if ($account === null) {
                abort(422, 'This customer has no prepaid deposit balance.');
            }

            $amountLaar = (int) $payment->amount_laar;
            $this->eligibility->assertCanUseDeposit($customer, $amountLaar, $account);

            $balanceBefore = (int) $account->balance_laar;
            $newBalance = $balanceBefore - $amountLaar;
            $account->update([
                'balance_laar' => $newBalance,
                'updated_by' => $actor->id,
            ]);

            $ledger = $this->writeLedger($account, 'usage', -$amountLaar, $balanceBefore, $newBalance, $actor, [
                'method' => 'wallet',
                'order_id' => $order->id,
                'payment_id' => $payment->id,
                'shift_id' => $payment->shift_id,
                'notes' => 'Customer deposit payment for order ' . ($order->order_number ?? $order->id),
            ]);

            $this->audit->log(
                'customer.deposit.usage',
                'Customer',
                $customer->id,
                [],
                [
                    'amount_laar' => $amountLaar,
                    'balance_after_laar' => $newBalance,
                    'order_id' => $order->id,
                    'payment_id' => $payment->id,
                ],
                [],
                $request,
            );

            return $ledger;
        });
    }

    /**
     * Payout unused deposit balance back to the customer (cash/card/bank).
     */
    public function payoutDeposit(
        Customer $customer,
        int $amountLaar,
        string $method,
        User $actor,
        ?string $reference = null,
        ?string $notes = null,
        ?Request $request = null,
    ): CustomerDepositLedger {
        $allowedMethods = ['cash', 'card', 'bank_transfer'];
        if (!in_array($method, $allowedMethods, true)) {
            abort(422, 'Invalid payout method.');
        }

        if ($amountLaar <= 0) {
            abort(422, 'Payout amount must be greater than zero.');
        }

        return DB::transaction(function () use ($customer, $amountLaar, $method, $actor, $reference, $notes, $request) {
            $account = CustomerDepositAccount::lockForUpdate()
                ->where('customer_id', $customer->id)
                ->first();

            if ($account === null || $account->status !== 'active') {
                abort(422, 'Deposit account is not available for payout.');
            }

            $balanceBefore = (int) $account->balance_laar;
            if ($amountLaar > $balanceBefore) {
                abort(422, sprintf(
                    'Payout exceeds available deposit balance (MVR %.2f).',
                    $balanceBefore / 100,
                ));
            }

            $shift = null;
            if ($method === 'cash') {
                $isOwner = $actor->role?->slug === 'owner';
                $shift = $this->shifts->findOpenShift($actor);
                if ($shift === null && !$isOwner) {
                    abort(422, 'Open a shift before recording a cash deposit payout.');
                }
            }

            $newBalance = $balanceBefore - $amountLaar;
            $account->update([
                'balance_laar' => $newBalance,
                'updated_by' => $actor->id,
            ]);

            if ($method === 'cash' && $shift !== null) {
                CashMovement::create([
                    'shift_id' => $shift->id,
                    'user_id' => $actor->id,
                    'type' => 'cash_out',
                    'amount' => round($amountLaar / 100, 2),
                    'reason' => 'Customer deposit payout — ' . ($customer->name ?? $customer->phone),
                ]);
            }

            $ledger = $this->writeLedger($account, 'payout', -$amountLaar, $balanceBefore, $newBalance, $actor, [
                'method' => $method,
                'shift_id' => $shift?->id,
                'reference' => $reference,
                'notes' => $notes ?? $reference,
            ]);

            $this->audit->log(
                'customer.deposit.payout',
                'Customer',
                $customer->id,
                ['balance_laar' => $balanceBefore],
                ['amount_laar' => $amountLaar, 'balance_after_laar' => $newBalance, 'method' => $method],
                ['ledger_id' => $ledger->id],
                $request,
            );

            return $ledger;
        });
    }

    /**
     * Restore deposit balance when an order paid with wallet is refunded.
     */
    public function reverseUsageForOrderRefund(
        Order $order,
        int $refundAmountLaar,
        Refund $refund,
        User $actor,
    ): void {
        if (CustomerDepositLedger::where('refund_id', $refund->id)->where('type', 'reversal')->exists()) {
            return;
        }

        $walletPaidLaar = (int) $order->payments()
            ->where('method', 'wallet')
            ->whereIn('status', ['paid', 'completed', 'confirmed'])
            ->selectRaw('COALESCE(SUM(amount_laar), SUM(ROUND(amount * 100))) as total')
            ->value('total');

        if ($walletPaidLaar <= 0 || !$order->customer_id) {
            return;
        }

        $orderTotalLaar = (int) ($order->total_laar ?? round((float) $order->total * 100));
        $reversalLaar = $orderTotalLaar > 0
            ? (int) min($refundAmountLaar, (int) round($walletPaidLaar * ($refundAmountLaar / $orderTotalLaar)))
            : 0;

        if ($reversalLaar <= 0) {
            return;
        }

        DB::transaction(function () use ($order, $reversalLaar, $refund, $actor) {
            $account = CustomerDepositAccount::lockForUpdate()
                ->where('customer_id', $order->customer_id)
                ->first();

            if ($account === null) {
                $account = $this->getOrCreateAccount(Customer::findOrFail((int) $order->customer_id), $actor);
                $account = CustomerDepositAccount::lockForUpdate()->findOrFail($account->id);
            }

            $balanceBefore = (int) $account->balance_laar;
            $newBalance = $balanceBefore + $reversalLaar;
            $account->update([
                'balance_laar' => $newBalance,
                'updated_by' => $actor->id,
            ]);

            $this->writeLedger($account, 'reversal', $reversalLaar, $balanceBefore, $newBalance, $actor, [
                'method' => 'wallet',
                'order_id' => $order->id,
                'refund_id' => $refund->id,
                'notes' => 'Deposit restored for refund on order ' . ($order->order_number ?? $order->id),
            ]);
        });
    }

    /**
     * @deprecated Use reverseUsageForOrderRefund for order refunds. Credits balance (legacy name).
     */
    public function refundToDeposit(
        Customer $customer,
        int $amountLaar,
        User $actor,
        ?Order $order = null,
        ?string $notes = null,
        ?Request $request = null,
    ): CustomerDepositLedger {
        if ($amountLaar <= 0) {
            abort(422, 'Refund amount must be greater than zero.');
        }

        return DB::transaction(function () use ($customer, $amountLaar, $actor, $order, $notes, $request) {
            $account = $this->getOrCreateAccount($customer, $actor);
            $locked = CustomerDepositAccount::lockForUpdate()->findOrFail($account->id);

            $balanceBefore = (int) $locked->balance_laar;
            $newBalance = $balanceBefore + $amountLaar;
            $locked->update([
                'balance_laar' => $newBalance,
                'updated_by' => $actor->id,
            ]);

            $ledger = $this->writeLedger($locked, 'refund', $amountLaar, $balanceBefore, $newBalance, $actor, [
                'order_id' => $order?->id,
                'notes' => $notes,
            ]);

            $this->audit->log(
                'customer.deposit.refund',
                'Customer',
                $customer->id,
                [],
                ['amount_laar' => $amountLaar, 'balance_after_laar' => $newBalance],
                ['ledger_id' => $ledger->id],
                $request,
            );

            return $ledger;
        });
    }

    public function transferToCredit(
        Customer $customer,
        int $amountLaar,
        User $actor,
        ?string $notes = null,
        ?Request $request = null,
    ): array {
        if ($amountLaar <= 0) {
            abort(422, 'Transfer amount must be greater than zero.');
        }

        if (!$customer->credit_enabled) {
            abort(422, 'Customer does not have an active credit account.');
        }

        $creditBalance = (int) $customer->credit_balance_laar;
        if ($creditBalance <= 0) {
            abort(422, 'Customer has no outstanding credit balance to pay down.');
        }

        return DB::transaction(function () use ($customer, $amountLaar, $actor, $notes, $request, $creditBalance) {
            $account = CustomerDepositAccount::lockForUpdate()
                ->where('customer_id', $customer->id)
                ->first();

            if ($account === null || $account->status !== 'active') {
                abort(422, 'Deposit account is not active.');
            }

            $depositBalance = (int) $account->balance_laar;
            $transferLaar = min($amountLaar, $depositBalance, $creditBalance);

            if ($transferLaar <= 0) {
                abort(422, 'Nothing to transfer — check deposit and credit balances.');
            }

            $balanceBefore = $depositBalance;
            $newBalance = $balanceBefore - $transferLaar;
            $account->update([
                'balance_laar' => $newBalance,
                'updated_by' => $actor->id,
            ]);

            $depositLedger = $this->writeLedger($account, 'transfer_to_credit', -$transferLaar, $balanceBefore, $newBalance, $actor, [
                'method' => 'transfer',
                'notes' => $notes ?? 'Deposit applied to credit account',
            ]);

            $creditLedger = app(CustomerCreditService::class)->recordRepayment(
                $customer->fresh(),
                $transferLaar,
                'bank_transfer',
                $actor,
                null,
                'DEPOSIT-TRANSFER-' . $depositLedger->id,
                $notes ?? 'Paid from customer deposit balance',
                $request,
            );

            $this->audit->log(
                'customer.deposit.transfer_to_credit',
                'Customer',
                $customer->id,
                ['deposit_balance_laar' => $balanceBefore, 'credit_balance_laar' => $creditBalance],
                [
                    'amount_laar' => $transferLaar,
                    'deposit_balance_after_laar' => $newBalance,
                    'deposit_ledger_id' => $depositLedger->id,
                    'credit_ledger_id' => $creditLedger->id,
                ],
                [],
                $request,
            );

            return [
                'deposit_ledger' => $depositLedger,
                'credit_ledger' => $creditLedger,
                'amount_laar' => $transferLaar,
            ];
        });
    }

    /**
     * @return array{total_received_laar: int, total_used_laar: int}
     */
    public function activityTotals(int $customerId): array
    {
        $received = (int) CustomerDepositLedger::where('customer_id', $customerId)
            ->whereIn('type', ['top_up', 'adjustment_add', 'reversal', 'refund'])
            ->selectRaw('COALESCE(SUM(ABS(amount_laar)), 0) as t')
            ->value('t');

        $used = (int) CustomerDepositLedger::where('customer_id', $customerId)
            ->whereIn('type', ['usage', 'payout', 'transfer_to_credit', 'adjustment_deduct'])
            ->selectRaw('COALESCE(SUM(ABS(amount_laar)), 0) as t')
            ->value('t');

        return ['total_received_laar' => $received, 'total_used_laar' => $used];
    }

    /**
     * @param array<string, mixed> $extra
     */
    private function writeLedger(
        CustomerDepositAccount $account,
        string $type,
        int $amountLaar,
        int $balanceBefore,
        int $balanceAfter,
        User $actor,
        array $extra = [],
    ): CustomerDepositLedger {
        return CustomerDepositLedger::create([
            'customer_id' => $account->customer_id,
            'deposit_account_id' => $account->id,
            'type' => $type,
            'amount_laar' => $amountLaar,
            'balance_before_laar' => $balanceBefore,
            'balance_after_laar' => $balanceAfter,
            'order_id' => $extra['order_id'] ?? null,
            'payment_id' => $extra['payment_id'] ?? null,
            'refund_id' => $extra['refund_id'] ?? null,
            'shift_id' => $extra['shift_id'] ?? null,
            'method' => $extra['method'] ?? null,
            'actor_user_id' => $actor->id,
            'notes' => $extra['notes'] ?? null,
            'reference' => $extra['reference'] ?? null,
        ]);
    }
}

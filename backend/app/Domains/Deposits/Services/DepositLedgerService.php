<?php

declare(strict_types=1);

namespace App\Domains\Deposits\Services;

use App\Models\CashMovement;
use App\Models\Customer;
use App\Models\CustomerDepositAccount;
use App\Models\CustomerDepositLedger;
use App\Models\Order;
use App\Models\Payment;
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

    public function topUp(
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

            $newBalance = (int) $account->balance_laar + $amountLaar;
            $account->update([
                'balance_laar' => $newBalance,
                'status' => $account->status === 'closed' ? 'active' : $account->status,
                'updated_by' => $actor->id,
            ]);

            if ($method === 'cash' && $shift !== null) {
                CashMovement::create([
                    'shift_id' => $shift->id,
                    'user_id' => $actor->id,
                    'type' => 'in',
                    'amount' => round($amountLaar / 100, 2),
                    'reason' => 'Customer deposit top-up — ' . ($customer->name ?? $customer->phone),
                ]);
            }

            $ledger = CustomerDepositLedger::create([
                'customer_id' => $customer->id,
                'type' => 'top_up',
                'amount_laar' => $amountLaar,
                'balance_after_laar' => $newBalance,
                'shift_id' => $shift?->id,
                'actor_user_id' => $actor->id,
                'notes' => $notes ?? $reference,
            ]);

            $this->audit->log(
                'customer.deposit.top_up',
                'Customer',
                $customer->id,
                ['balance_laar' => $newBalance - $amountLaar],
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

            $newBalance = (int) $locked->balance_laar + $amountLaar;
            if ($newBalance < 0) {
                abort(422, 'Adjustment would make deposit balance negative.');
            }

            $locked->update([
                'balance_laar' => $newBalance,
                'updated_by' => $actor->id,
            ]);

            $ledger = CustomerDepositLedger::create([
                'customer_id' => $customer->id,
                'type' => 'adjustment',
                'amount_laar' => $amountLaar,
                'balance_after_laar' => $newBalance,
                'actor_user_id' => $actor->id,
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

            $newBalance = (int) $account->balance_laar - $amountLaar;
            $account->update([
                'balance_laar' => $newBalance,
                'updated_by' => $actor->id,
            ]);

            $ledger = CustomerDepositLedger::create([
                'customer_id' => $customer->id,
                'type' => 'usage',
                'amount_laar' => -$amountLaar,
                'balance_after_laar' => $newBalance,
                'order_id' => $order->id,
                'payment_id' => $payment->id,
                'actor_user_id' => $actor->id,
                'notes' => 'POS deposit payment for order ' . ($order->order_number ?? $order->id),
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

            $newBalance = (int) $locked->balance_laar + $amountLaar;
            $locked->update([
                'balance_laar' => $newBalance,
                'updated_by' => $actor->id,
            ]);

            $ledger = CustomerDepositLedger::create([
                'customer_id' => $customer->id,
                'type' => 'refund',
                'amount_laar' => $amountLaar,
                'balance_after_laar' => $newBalance,
                'order_id' => $order?->id,
                'actor_user_id' => $actor->id,
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
}

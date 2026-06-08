<?php

declare(strict_types=1);

namespace App\Domains\Payments\Services;

use App\Domains\Customers\Services\CustomerCreditService;
use App\Domains\Deposits\Services\CustomerDepositService;
use App\Models\Customer;
use App\Models\Order;
use App\Models\User;
use App\Services\PermissionService;

final class PaymentAllocationService
{
    public const GATEWAY_METHODS = ['bml_pay', 'bml', 'online'];

    /** @return list<string> */
    public function nonShiftMethods(): array
    {
        return self::GATEWAY_METHODS;
    }

    /**
     * @param list<array<string, mixed>> $payments
     */
    public function needsCollectorShift(array $payments): bool
    {
        $nonShift = $this->nonShiftMethods();

        return collect($payments)->contains(
            fn (array $row) => !in_array($row['method'] ?? '', $nonShift, true),
        );
    }

    /**
     * @param list<array<string, mixed>> $payments
     */
    public function needsCreditShift(array $payments): bool
    {
        return collect($payments)->contains(
            fn (array $row) => ($row['method'] ?? '') === 'house_account',
        );
    }

    /**
     * @param list<array<string, mixed>> $payments
     */
    public function needsDepositShift(array $payments): bool
    {
        return collect($payments)->contains(
            fn (array $row) => in_array($row['method'] ?? '', ['wallet', 'customer_deposit'], true),
        );
    }

    public function canUseDepositPayment(User $collector, PermissionService $permissions): bool
    {
        return $permissions->hasPermission($collector, 'payments.deposit')
            || $permissions->hasPermission($collector, 'payments.wallet');
    }

    /**
     * @param list<array<string, mixed>> $payments
     * @return array{credit: ?Customer, deposit: ?Customer}
     */
    public function resolveAccountCustomers(
        Order $order,
        array $payments,
        User $collector,
        CustomerCreditService $creditService,
        CustomerDepositService $depositService,
        PermissionService $permissions,
    ): array {
        $creditCustomer = null;
        $depositCustomer = null;

        foreach ($payments as $paymentPayload) {
            if (($paymentPayload['method'] ?? '') === 'house_account') {
                if (!$order->customer_id) {
                    abort(422, 'This customer is not approved for credit.');
                }
                if (!$permissions->hasPermission($collector, 'payments.credit')) {
                    abort(403, 'You do not have permission to charge customer credit.');
                }
                $creditCustomer = Customer::findOrFail((int) $order->customer_id);
                $creditService->assertCanCharge(
                    $creditCustomer,
                    (int) round((float) $paymentPayload['amount'] * 100),
                );
            }
            $method = $paymentPayload['method'] ?? '';
            if (in_array($method, ['wallet', 'customer_deposit'], true)) {
                if (!$order->customer_id) {
                    abort(422, 'This customer has no prepaid deposit balance.');
                }
                if (!$this->canUseDepositPayment($collector, $permissions)) {
                    abort(403, 'You do not have permission to use customer deposit balance.');
                }
                $depositCustomer = Customer::findOrFail((int) $order->customer_id);
                $depositService->assertCanUseDeposit(
                    $depositCustomer,
                    (int) round((float) $paymentPayload['amount'] * 100),
                );
            }
        }

        return ['credit' => $creditCustomer, 'deposit' => $depositCustomer];
    }

    /**
     * @param list<array<string, mixed>> $payments
     */
    public function assertTenderPermissions(User $collector, array $payments, PermissionService $permissions): void
    {
        $tenderMethods = collect($payments)->pluck('method')->unique()->values();
        if ($tenderMethods->count() > 1) {
            if (!$permissions->hasPermission($collector, 'payments.split')) {
                abort(403, 'You do not have permission to take split payments.');
            }

            return;
        }

        $method = (string) ($tenderMethods->first() ?? 'cash');
        if (in_array($method, ['house_account', 'wallet', 'customer_deposit'], true)) {
            return;
        }

        $tenderPermission = $method === 'cash' ? 'payments.cash' : 'payments.card';
        if (!$permissions->hasPermission($collector, $tenderPermission)) {
            abort(403, 'You do not have permission to take this payment type.');
        }
    }

    /**
     * @param list<array<string, mixed>> $payments
     */
    public function assertTenderCap(Order $order, array $payments): void
    {
        $orderTotalLaarPre = (int) ($order->total_laar ?? round((float) $order->total * 100));
        $alreadyPaidLaar = (int) $order->payments()
            ->whereIn('status', ['paid', 'completed', 'confirmed'])
            ->selectRaw('COALESCE(SUM(amount_laar), SUM(ROUND(amount * 100))) as t')
            ->value('t');
        $remainingLaar = max(0, $orderTotalLaarPre - $alreadyPaidLaar);

        $incomingLaar = 0;
        $anyNonCash = false;
        foreach ($payments as $row) {
            $incomingLaar += (int) round((float) $row['amount'] * 100);
            if ($row['method'] !== 'cash') {
                $anyNonCash = true;
            }
        }

        if ($remainingLaar <= 0) {
            return;
        }

        $capLaar = $anyNonCash
            ? $remainingLaar + 50
            : max($remainingLaar * 5, $remainingLaar + 10000);

        if ($incomingLaar > $capLaar) {
            abort(422, sprintf(
                'Tender (MVR %.2f) far exceeds remaining balance (MVR %.2f). Re-check the amount.',
                $incomingLaar / 100,
                $remainingLaar / 100,
            ));
        }
    }
}

<?php

declare(strict_types=1);

namespace App\Domains\Payments\Services;

use App\Domains\Customers\Services\CustomerCreditService;
use App\Domains\Deposits\Services\CustomerDepositService;
use App\Models\Customer;
use App\Models\Order;
use App\Models\User;
use App\Services\PermissionService;
use App\Support\LaariConverter;

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
                    LaariConverter::toLaar($paymentPayload['amount']),
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
                    LaariConverter::toLaar($paymentPayload['amount']),
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
        $orderTotalLaarPre = (int) ($order->total_laar ?? LaariConverter::toLaar($order->total));
        $alreadyPaidLaar = (int) $order->payments()
            ->whereIn('status', ['paid', 'completed', 'confirmed'])
            ->selectRaw('SUM(COALESCE(amount_laar, ROUND(amount * 100))) as t')
            ->value('t');
        // Soft-held gift tender counts as covered when no gift_card payment row yet.
        $giftTenderLaar = max(0, (int) ($order->gift_card_discount_laar ?? 0));
        if ($giftTenderLaar > 0) {
            $giftPaid = (int) $order->payments()
                ->where('method', 'gift_card')
                ->whereIn('status', ['paid', 'completed', 'confirmed'])
                ->selectRaw('SUM(COALESCE(amount_laar, ROUND(amount * 100))) as t')
                ->value('t');
            if ($giftPaid <= 0) {
                $alreadyPaidLaar += $giftTenderLaar;
            }
        }
        $remainingLaar = max(0, $orderTotalLaarPre - $alreadyPaidLaar);

        $incomingLaar = 0;
        $anyNonCash = false;
        foreach ($payments as $row) {
            $incomingLaar += LaariConverter::toLaar($row['amount']);
            if ($row['method'] !== 'cash') {
                $anyNonCash = true;
            }
        }

        if ($remainingLaar <= 0) {
            // Order is already fully covered by confirmed payments. A positive
            // new tender would over-collect (2026-08 audit #3) — e.g. taking
            // cash on a BML-paid online order that sits at status=pending /
            // payment_status=paid. A legitimate prepaid dine-in add-on raises
            // the order total first, so remainingLaar would be > 0 here.
            if ($incomingLaar > 0) {
                abort(422, 'This order is already fully paid — no additional payment can be added.');
            }

            return;
        }

        // FIX 11 — tighten cash-only cap to remaining + 1 laari. Cashiers
        // now express overpay via the dedicated `tendered_amount` field
        // (see SettleOrderPaymentAction), so the applied `amount` should
        // never exceed the remaining balance beyond a rounding laari.
        // Non-cash rows keep the tiny +50-laari tolerance for gateway
        // rounding drift.
        $capLaar = $anyNonCash
            ? $remainingLaar + 50
            : $remainingLaar + 1;

        if ($incomingLaar > $capLaar) {
            abort(422, sprintf(
                'Tender (MVR %.2f) far exceeds remaining balance (MVR %.2f). Re-check the amount%s.',
                $incomingLaar / 100,
                $remainingLaar / 100,
                $anyNonCash ? '' : ' — use the "cash received" field to record overpay',
            ));
        }
    }
}

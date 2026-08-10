<?php

declare(strict_types=1);

namespace App\Domains\Trade\Services;

use App\Domains\Trade\DTOs\TradeCreditExposure;
use App\Models\Customer;
use App\Models\TradeDelivery;
use App\Models\TradeDeliveryLine;

/**
 * One function for dispatch checks and screens.
 * exposure = credit_balance_laar + stamped value of dispatched (not yet invoiced) lines.
 * Stage B+C has no invoices yet — every dispatched delivery counts as unbilled.
 */
final class TradeCreditExposureService
{
    public function forCustomer(Customer $customer): TradeCreditExposure
    {
        $holding = (int) TradeDeliveryLine::query()
            ->whereHas('delivery', function ($q) use ($customer) {
                $q->where('status', TradeDelivery::STATUS_DISPATCHED)
                    ->whereHas('tradeAccount', fn ($aq) => $aq->where('customer_id', $customer->id));
            })
            ->selectRaw('COALESCE(SUM(qty_sent * unit_price_laar), 0) as total')
            ->value('total');

        $balance = (int) ($customer->credit_balance_laar ?? 0);
        $limit = (int) ($customer->credit_limit_laar ?? 0);

        return new TradeCreditExposure(
            balanceOwedLaar: $balance,
            holdingUnbilledLaar: $holding,
            exposureLaar: $balance + $holding,
            creditLimitLaar: $limit,
            creditEnabled: (bool) $customer->credit_enabled,
            creditStatus: (string) ($customer->credit_status ?? 'active'),
        );
    }

    /**
     * @throws \Illuminate\Http\Exceptions\HttpResponseException
     */
    public function assertCanDispatch(
        Customer $customer,
        int $thisDeliveryValueLaar,
        bool $ownerOverride = false,
    ): TradeCreditExposure {
        $exposure = $this->forCustomer($customer);

        if (! $exposure->creditEnabled) {
            abort(422, 'Credit is not enabled for this customer. Approve credit before dispatching on account.');
        }

        if ($exposure->creditStatus !== 'active') {
            abort(422, 'Customer credit is '.$exposure->creditStatus.'. Dispatch on account is blocked.');
        }

        $projected = $exposure->exposureLaar + $thisDeliveryValueLaar;
        if ($projected > $exposure->creditLimitLaar && ! $ownerOverride) {
            abort(422, sprintf(
                'This delivery would put exposure over the credit limit. Owes MVR %s, holding MVR %s of our stock, limit MVR %s, this delivery MVR %s.',
                number_format($exposure->balanceOwedLaar / 100, 2, '.', ''),
                number_format($exposure->holdingUnbilledLaar / 100, 2, '.', ''),
                number_format($exposure->creditLimitLaar / 100, 2, '.', ''),
                number_format($thisDeliveryValueLaar / 100, 2, '.', ''),
            ));
        }

        return $exposure;
    }
}

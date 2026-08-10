<?php

declare(strict_types=1);

namespace App\Domains\Trade\Services;

use App\Domains\Trade\DTOs\TradeCreditExposure;
use App\Models\Customer;
use App\Models\TradeAccount;
use App\Models\TradeDelivery;
use App\Models\TradeDeliveryLine;
use App\Models\TradeInvoiceAllocation;

/**
 * One function for dispatch checks and screens.
 *
 * exposure = credit_balance_laar
 *          + stamped value of every delivery line NOT YET ALLOCATED TO AN INVOICE
 *
 * Holding quantity per line (before subtracting allocations):
 *   - cancelled → 0
 *   - dispatched (not yet reconciled) → qty_sent (goods out, unbilled)
 *   - reconciled / invoiced → qty_sold + charged-missing (returned goods are back)
 */
final class TradeCreditExposureService
{
    public function forCustomer(Customer $customer): TradeCreditExposure
    {
        $holding = $this->unallocatedHoldingLaar($customer);
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
     * Must be called with the customer row already locked for update when used
     * as a dispatch gate (see TradeDispatchService).
     *
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

    public function unallocatedHoldingLaar(Customer $customer): int
    {
        $lines = TradeDeliveryLine::query()
            ->with(['delivery.tradeAccount'])
            ->whereHas('delivery', function ($q) use ($customer) {
                $q->where('status', '!=', TradeDelivery::STATUS_CANCELLED)
                    ->whereHas('tradeAccount', fn ($aq) => $aq->where('customer_id', $customer->id));
            })
            ->get();

        $allocatedByLine = TradeInvoiceAllocation::query()
            ->whereIn('trade_delivery_line_id', $lines->pluck('id'))
            ->selectRaw('trade_delivery_line_id, SUM(qty_invoiced) as qty')
            ->groupBy('trade_delivery_line_id')
            ->pluck('qty', 'trade_delivery_line_id');

        $total = 0;
        foreach ($lines as $line) {
            $holdingQty = $this->holdingQty($line);
            $allocated = (int) ($allocatedByLine[$line->id] ?? 0);
            $unallocated = max(0, $holdingQty - $allocated);
            $total += $unallocated * (int) $line->unit_price_laar;
        }

        return $total;
    }

    public function holdingQty(TradeDeliveryLine $line): int
    {
        $delivery = $line->delivery;
        if ($delivery === null) {
            return 0;
        }

        if ($delivery->status === TradeDelivery::STATUS_CANCELLED) {
            return 0;
        }

        if ($delivery->status === TradeDelivery::STATUS_DISPATCHED) {
            return (int) $line->qty_sent;
        }

        // reconciled / invoiced / settled — returned goods are not held
        $sold = (int) $line->qty_sold;
        $missing = $this->chargeableMissingQty($line, $delivery->tradeAccount);

        return $sold + $missing;
    }

    public function chargeableMissingQty(TradeDeliveryLine $line, ?TradeAccount $account): int
    {
        $missing = (int) $line->qty_missing;
        if ($missing <= 0) {
            return 0;
        }

        $delivery = $line->delivery;
        if ($delivery && $delivery->missing_charge_waived) {
            return 0;
        }

        $policy = $account?->missing_policy ?? TradeAccount::MISSING_CHARGE;
        if ($policy === TradeAccount::MISSING_WRITE_OFF) {
            return 0;
        }

        // charge and dispute both count as holding until resolved/waived;
        // dispute blocks invoicing but still counts against exposure.
        return $missing;
    }

    public function invoiceableQty(TradeDeliveryLine $line, ?TradeAccount $account): int
    {
        $sold = (int) $line->qty_sold;
        $missing = 0;
        $policy = $account?->missing_policy ?? TradeAccount::MISSING_CHARGE;
        $delivery = $line->delivery;

        if ($policy === TradeAccount::MISSING_CHARGE
            && (! $delivery || ! $delivery->missing_charge_waived)) {
            $missing = (int) $line->qty_missing;
        }

        return $sold + $missing;
    }

    public function allocatedQty(int $deliveryLineId): int
    {
        return (int) TradeInvoiceAllocation::query()
            ->where('trade_delivery_line_id', $deliveryLineId)
            ->sum('qty_invoiced');
    }
}

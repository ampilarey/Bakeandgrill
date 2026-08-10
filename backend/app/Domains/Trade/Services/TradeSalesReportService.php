<?php

declare(strict_types=1);

namespace App\Domains\Trade\Services;

use App\Models\Customer;
use App\Models\TradeAccount;
use App\Models\TradeDelivery;
use App\Models\TradeDeliveryLine;
use App\Models\TradeSalesReportSubmission;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Stage E — shop sales claims. Writes reported_sold_qty only.
 * Does not touch stock, qty_sold, invoices, ledger, or payments.
 */
final class TradeSalesReportService
{
    /**
     * @param  list<array{line_id: int, sold_qty: int}>  $lines
     */
    public function report(
        Customer $customer,
        int $deliveryId,
        array $lines,
        string $idempotencyKey,
    ): TradeDelivery {
        $existing = TradeSalesReportSubmission::query()
            ->where('idempotency_key', $idempotencyKey)
            ->first();
        if ($existing) {
            return TradeDelivery::with(['lines.item'])
                ->findOrFail($existing->trade_delivery_id);
        }

        $account = $this->requireTradeAccount($customer);

        return DB::transaction(function () use ($customer, $account, $deliveryId, $lines, $idempotencyKey) {
            $again = TradeSalesReportSubmission::query()
                ->where('idempotency_key', $idempotencyKey)
                ->lockForUpdate()
                ->first();
            if ($again) {
                return TradeDelivery::with(['lines.item'])
                    ->findOrFail($again->trade_delivery_id);
            }

            $delivery = TradeDelivery::query()
                ->where('trade_account_id', $account->id)
                ->whereKey($deliveryId)
                ->lockForUpdate()
                ->first();

            if ($delivery === null) {
                abort(404);
            }

            if ($delivery->status !== TradeDelivery::STATUS_DISPATCHED) {
                throw ValidationException::withMessages([
                    'delivery' => ['This delivery has already been checked by us. You can no longer change the sales numbers.'],
                ]);
            }

            if ($lines === []) {
                throw ValidationException::withMessages([
                    'lines' => ['Tell us how many of each item you sold.'],
                ]);
            }

            $delivery->load('lines');
            $byId = $delivery->lines->keyBy('id');
            $payload = [];

            foreach ($lines as $row) {
                $lineId = (int) $row['line_id'];
                $soldQty = (int) $row['sold_qty'];
                /** @var TradeDeliveryLine|null $line */
                $line = $byId->get($lineId);
                if ($line === null) {
                    throw ValidationException::withMessages([
                        'lines' => ['One of the items is not on this delivery.'],
                    ]);
                }
                if ($soldQty < 0 || $soldQty > (int) $line->qty_sent) {
                    throw ValidationException::withMessages([
                        'lines' => ['Sold quantity cannot be more than what was delivered.'],
                    ]);
                }
                $payload[] = ['line_id' => $lineId, 'sold_qty' => $soldQty];
            }

            foreach ($payload as $row) {
                TradeDeliveryLine::whereKey($row['line_id'])->update([
                    'reported_sold_qty' => $row['sold_qty'],
                ]);
            }

            $delivery->update([
                'reported_at' => now(),
                'reported_by_customer_id' => $customer->id,
            ]);

            TradeSalesReportSubmission::create([
                'trade_delivery_id' => $delivery->id,
                'customer_id' => $customer->id,
                'idempotency_key' => $idempotencyKey,
                'lines_json' => $payload,
            ]);

            return $delivery->fresh(['lines.item']);
        });
    }

    public function requireTradeAccount(Customer $customer): TradeAccount
    {
        $account = TradeAccount::query()
            ->where('customer_id', $customer->id)
            ->where('is_active', true)
            ->first();

        if ($account === null) {
            abort(404);
        }

        return $account;
    }

    public function findOwnDelivery(Customer $customer, int $deliveryId): ?TradeDelivery
    {
        $account = TradeAccount::query()
            ->where('customer_id', $customer->id)
            ->where('is_active', true)
            ->first();

        if ($account === null) {
            return null;
        }

        return TradeDelivery::query()
            ->where('trade_account_id', $account->id)
            ->whereKey($deliveryId)
            ->whereNotIn('status', [TradeDelivery::STATUS_DRAFT, TradeDelivery::STATUS_CANCELLED])
            ->with(['lines.item'])
            ->first();
    }
}

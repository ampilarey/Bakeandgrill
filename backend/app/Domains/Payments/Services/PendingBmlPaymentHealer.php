<?php

declare(strict_types=1);

namespace App\Domains\Payments\Services;

use App\Models\Order;
use App\Models\Payment;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

/**
 * Settle a card payment the bank took but we never heard about.
 *
 * Owner, 2026-10-05: a bill sent from the POS, paid online by the customer,
 * "payment processed but customer sees pending payment and pos also shows
 * unpaid". The two ways a BML payment normally reaches us are the signed
 * webhook and the return URL, and both can miss: the webhook does not always
 * arrive, and the return URL fails closed when the status API cannot be
 * asked or does not say CONFIRMED yet. The online ordering app recovers by
 * asking the bank again whenever the customer's order page loads
 * (PaymentService::reconcilePendingBmlPayment). The pay-link flow had no
 * such recovery: the receipt page said "Payment pending", the POS said
 * unpaid, and nothing ever asked the bank again.
 *
 * This is that recovery, in one place, for every page a pay-link customer
 * can land on and for a scheduled sweep so the POS catches up even when the
 * customer closes the browser. It asks the bank at most once a minute per
 * order, so a refreshed page does not hammer the status API.
 */
final class PendingBmlPaymentHealer
{
    public const PENDING_STATUSES = ['created', 'initiated', 'pending'];

    /** How far back a pending card payment is still worth asking the bank about. */
    public const LOOKBACK_HOURS = 48;

    /** Give the webhook and the return URL this long before the sweep steps in. */
    public const SWEEP_MIN_AGE_MINUTES = 2;

    private const THROTTLE_SECONDS = 60;

    public function __construct(private readonly PaymentService $payments) {}

    /**
     * Ask the bank about the order's in-flight card payment and settle it if
     * confirmed. Returns true when the order is paid afterwards (whether it
     * already was or was settled now). Never throws: a page must render
     * whatever the bank says.
     */
    public function heal(Order $order, bool $force = false): bool
    {
        if ($this->orderLooksPaid($order)) {
            return true;
        }
        if (!$this->hasPendingCardPayment($order)) {
            return false;
        }
        if (!$force && !Cache::add($this->throttleKey($order), 1, self::THROTTLE_SECONDS)) {
            return false;
        }

        try {
            $state = $this->payments->pendingBmlState($order);
        } catch (\Throwable $e) {
            Log::warning('BML heal: could not ask the bank', ['order_id' => $order->id, 'error' => $e->getMessage()]);

            return false;
        }

        if ($state === 'paid') {
            Log::info('BML heal: settled a payment the bank had confirmed', ['order_id' => $order->id]);
        }

        return $state === 'paid';
    }

    /**
     * The scheduled sweep: every order with a card payment the bank may have
     * taken while we still show it unpaid.
     *
     * @return array{checked: int, settled: int}
     */
    public function sweep(): array
    {
        $orderIds = Payment::query()
            ->whereNotNull('order_id')
            ->whereNotNull('provider_transaction_id')
            ->whereIn('status', self::PENDING_STATUSES)
            ->where('created_at', '>=', now()->subHours(self::LOOKBACK_HOURS))
            ->where('created_at', '<=', now()->subMinutes(self::SWEEP_MIN_AGE_MINUTES))
            ->distinct()
            ->pluck('order_id');

        $checked = 0;
        $settled = 0;
        foreach (Order::query()->whereIn('id', $orderIds)->get() as $order) {
            if ($this->orderLooksPaid($order) || in_array((string) $order->status, ['cancelled', 'refunded'], true)) {
                continue;
            }
            $checked++;
            if ($this->heal($order, force: true)) {
                $settled++;
            }
        }

        return ['checked' => $checked, 'settled' => $settled];
    }

    public function hasPendingCardPayment(Order $order): bool
    {
        return Payment::query()
            ->where('order_id', $order->id)
            ->whereNotNull('provider_transaction_id')
            ->whereIn('status', self::PENDING_STATUSES)
            ->where('created_at', '>=', now()->subHours(self::LOOKBACK_HOURS))
            ->exists();
    }

    private function orderLooksPaid(Order $order): bool
    {
        return $order->paid_at !== null
            || $order->payment_status === 'paid'
            || in_array((string) $order->status, ['paid', 'completed', 'delivered'], true);
    }

    private function throttleKey(Order $order): string
    {
        return 'bml:heal:order:' . $order->id;
    }
}

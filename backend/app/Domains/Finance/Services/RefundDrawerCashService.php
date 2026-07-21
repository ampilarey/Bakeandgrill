<?php

declare(strict_types=1);

namespace App\Domains\Finance\Services;

use App\Models\Order;

/**
 * Compute how much of a refund actually leaves the cash drawer.
 *
 * A refund can partially reverse:
 *   - customer credit balance   (house_account tender)
 *   - gift-card ledger balance  (gift_card tender)
 *   - customer deposit balance  (wallet tender)
 *   - external gateway tenders  (card / bml* / bank_transfer / cheque / qr / digital_wallet)
 *
 * The remainder is what the cashier hands back in cash. This service
 * mirrors the reversal formulas used by the domain listeners (reference
 * only — this service NEVER writes to the domain ledgers). The listeners
 * themselves remain the source of truth for the actual balance moves.
 *
 * @see \App\Domains\Credit\Services\CreditLedgerService::reverseChargeForRefund
 * @see \App\Domains\Payments\Services\GiftCardRedemptionService::restoreForOrder
 * @see \App\Domains\Deposits\Services\DepositLedgerService::reverseUsageForOrderRefund
 */
final class RefundDrawerCashService
{
    /**
     * External (non-cash, non-house-account, non-wallet, non-gift-card)
     * tenders. Refunds against these are usually reversed on the
     * gateway/card terminal rather than out of the till, so by default
     * they are NOT paid out of the drawer.
     */
    public const EXTERNAL_METHODS = [
        'card',
        'card_pos',
        'qr',
        'bank_transfer',
        'digital_wallet',
        'cheque',
        'bml',
        'bml_pay',
        'bml_connect',
        'online',
        'stripe',
    ];

    /**
     * @return array{
     *     credit_reversed_laar: int,
     *     gift_reversed_laar: int,
     *     wallet_reversed_laar: int,
     *     external_tender_laar: int,
     *     default_drawer_cash_out_laar: int
     * }
     */
    public function breakdown(Order $order, int $refundLaar, int $paidLaar, int $orderTotalLaar): array
    {
        $refundLaar = max(0, $refundLaar);

        $creditReversed = $this->creditReversedLaar($order, $refundLaar, $orderTotalLaar);
        $giftReversed = $this->giftReversedLaar($order, $refundLaar, $paidLaar);
        $walletReversed = $this->walletReversedLaar($order, $refundLaar, $orderTotalLaar);
        $external = $this->externalTenderLaar($order, $refundLaar, $orderTotalLaar);

        $nonCash = $creditReversed + $giftReversed + $walletReversed + $external;
        $drawer = max(0, $refundLaar - $nonCash);

        return [
            'credit_reversed_laar' => $creditReversed,
            'gift_reversed_laar' => $giftReversed,
            'wallet_reversed_laar' => $walletReversed,
            'external_tender_laar' => $external,
            'default_drawer_cash_out_laar' => $drawer,
        ];
    }

    /**
     * Same formula as CreditLedgerService::reverseChargeForRefund.
     */
    private function creditReversedLaar(Order $order, int $refundLaar, int $orderTotalLaar): int
    {
        if (!$order->customer_id) {
            return 0;
        }

        $creditPaidLaar = (int) $order->payments()
            ->where('method', 'house_account')
            ->whereIn('status', ['paid', 'completed', 'confirmed'])
            ->selectRaw('SUM(COALESCE(amount_laar, ROUND(amount * 100))) as total')
            ->value('total');

        if ($creditPaidLaar <= 0 || $orderTotalLaar <= 0) {
            return 0;
        }

        return max(0, (int) min(
            $refundLaar,
            (int) round($creditPaidLaar * ($refundLaar / $orderTotalLaar)),
        ));
    }

    /**
     * Same formula as GiftCardRedemptionService::restoreForOrder — that
     * service uses refundRatio × redeemed_amount. RefundController
     * computes the ratio as refundLaar / paidLaar (capped at 1.0), so we
     * mirror that here.
     */
    private function giftReversedLaar(Order $order, int $refundLaar, int $paidLaar): int
    {
        if (empty($order->gift_card_id)) {
            return 0;
        }

        $redeemedLaar = (int) ($order->gift_card_discount_laar ?? 0);
        if ($redeemedLaar <= 0 || $paidLaar <= 0 || $refundLaar <= 0) {
            return 0;
        }

        $ratio = min(1.0, $refundLaar / $paidLaar);

        return max(0, min($redeemedLaar, (int) round($redeemedLaar * $ratio)));
    }

    /**
     * Same formula as DepositLedgerService::reverseUsageForOrderRefund.
     */
    private function walletReversedLaar(Order $order, int $refundLaar, int $orderTotalLaar): int
    {
        if (!$order->customer_id) {
            return 0;
        }

        $walletPaidLaar = (int) $order->payments()
            ->where('method', 'wallet')
            ->whereIn('status', ['paid', 'completed', 'confirmed'])
            ->selectRaw('SUM(COALESCE(amount_laar, ROUND(amount * 100))) as total')
            ->value('total');

        if ($walletPaidLaar <= 0 || $orderTotalLaar <= 0) {
            return 0;
        }

        return max(0, (int) min(
            $refundLaar,
            (int) round($walletPaidLaar * ($refundLaar / $orderTotalLaar)),
        ));
    }

    /**
     * Proportional share of external tenders (card / gateway / bank / cheque).
     * Uses the same refundLaar / orderTotalLaar ratio as credit so
     * partial refunds don't attribute the whole card amount to the drawer.
     */
    private function externalTenderLaar(Order $order, int $refundLaar, int $orderTotalLaar): int
    {
        if ($orderTotalLaar <= 0) {
            return 0;
        }

        $externalPaidLaar = (int) $order->payments()
            ->whereIn('method', self::EXTERNAL_METHODS)
            ->whereIn('status', ['paid', 'completed', 'confirmed'])
            ->selectRaw('SUM(COALESCE(amount_laar, ROUND(amount * 100))) as total')
            ->value('total');

        if ($externalPaidLaar <= 0) {
            return 0;
        }

        return max(0, (int) min(
            $refundLaar,
            (int) round($externalPaidLaar * ($refundLaar / $orderTotalLaar)),
        ));
    }
}

<?php

declare(strict_types=1);

namespace App\Support;

use App\Models\Order;

/**
 * Customer-facing receipt / invoice presentation for the public receipt page.
 *
 * Prepaid online dine-in is special: online pay is a prepayment for an open
 * visit, not a final closed bill. Until the visit is completed (or cancelled /
 * refunded), the document should not look like a final "Paid" receipt.
 */
final class ReceiptDocumentState
{
    /**
     * @return array{
     *   doc_title: string,
     *   badge: string,
     *   badge_class: string,
     *   banner_kind: 'ok'|'warn'|'info'|null,
     *   banner_text: string|null,
     *   is_final_paid: bool,
     *   show_payments: bool,
     *   show_feedback: bool,
     *   show_pdf: bool,
     *   balance_due: float,
     *   mistake_noun: string
     * }
     */
    public static function forOrder(Order $order): array
    {
        $settlement = OrderSettlement::forOrder($order);
        $paidOnCredit = (bool) ($settlement['paid_on_credit'] ?? false);
        $paymentStatus = (string) ($order->payment_status ?? 'unpaid');
        $lifecycle = (string) ($order->status ?? '');
        $hasPaidAt = $order->paid_at !== null;
        $isLifecyclePaid = in_array($lifecycle, ['paid', 'completed', 'delivered', 'refunded'], true);

        $isPrepaidDineIn = $order->type === 'dine_in' && $order->user_id === null;
        $visitClosed = in_array($lifecycle, ['completed', 'cancelled', 'refunded'], true);
        $visitOpen = $isPrepaidDineIn && ! $visitClosed;

        $balanceDue = self::balanceDueMvr($order);

        // Prepaid dine-in visit still open — never present as a final paid receipt.
        if ($visitOpen && ($hasPaidAt || in_array($paymentStatus, ['paid', 'partial'], true))) {
            if ($paymentStatus === 'partial' || $balanceDue > 0.009) {
                return [
                    'doc_title' => 'Bill',
                    'badge' => 'Balance due',
                    'badge_class' => 'doc-badge--unpaid',
                    'banner_kind' => 'warn',
                    'banner_text' => 'Prepaid online — MVR '.number_format($balanceDue, 2)
                        .' remaining. Final bill will be completed when your dine-in visit is finished.',
                    'is_final_paid' => false,
                    'show_payments' => true,
                    'show_feedback' => false,
                    'show_pdf' => false,
                    'balance_due' => $balanceDue,
                    'mistake_noun' => 'bill',
                ];
            }

            return [
                'doc_title' => 'Prepayment',
                'badge' => 'Prepaid online',
                'badge_class' => 'doc-badge--sent',
                'banner_kind' => 'info',
                'banner_text' => 'Prepayment received'
                    .($order->paid_at
                        ? ' — '.$order->paid_at->timezone(config('app.timezone', 'Indian/Maldives'))->format('D, j M Y g:i A')
                        : '')
                    .'. Order will be completed when your dine-in visit is finished.',
                'is_final_paid' => false,
                'show_payments' => true,
                'show_feedback' => false,
                'show_pdf' => true,
                'balance_due' => 0.0,
                'mistake_noun' => 'bill',
            ];
        }

        $isPaid = $hasPaidAt || $isLifecyclePaid;

        if (! $isPaid) {
            return [
                'doc_title' => 'Invoice',
                'badge' => 'Payment pending',
                'badge_class' => 'doc-badge--unpaid',
                'banner_kind' => 'warn',
                'banner_text' => 'Payment pending — this is your bill. Totals may update until payment is received. Refresh after you pay to see your receipt.',
                'is_final_paid' => false,
                'show_payments' => false,
                'show_feedback' => false,
                'show_pdf' => false,
                'balance_due' => $balanceDue,
                'mistake_noun' => 'bill',
            ];
        }

        return [
            'doc_title' => 'Receipt',
            'badge' => $paidOnCredit ? 'On credit' : 'Paid',
            'badge_class' => 'doc-badge--paid',
            'banner_kind' => 'ok',
            'banner_text' => ($paidOnCredit ? 'Charged to credit account' : 'Payment confirmed')
                .($order->paid_at
                    ? ' — '.$order->paid_at->timezone(config('app.timezone', 'Indian/Maldives'))->format('D, j M Y g:i A')
                    : ''),
            'is_final_paid' => true,
            'show_payments' => true,
            'show_feedback' => true,
            'show_pdf' => true,
            'balance_due' => 0.0,
            'mistake_noun' => 'receipt',
        ];
    }

    private static function balanceDueMvr(Order $order): float
    {
        $orderTotalLaar = (int) ($order->total_laar ?? round((float) $order->total * 100));
        $payments = $order->relationLoaded('payments')
            ? $order->payments
            : $order->payments()->get();

        $paidLaar = (int) $payments
            ->filter(fn ($p) => in_array((string) ($p->status ?? ''), ['paid', 'completed', 'confirmed'], true))
            ->sum(fn ($p) => (int) ($p->amount_laar ?? round((float) $p->amount * 100)));

        return max(0, round(($orderTotalLaar - $paidLaar) / 100, 2));
    }
}

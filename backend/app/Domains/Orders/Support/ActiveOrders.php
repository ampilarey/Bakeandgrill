<?php

declare(strict_types=1);

namespace App\Domains\Orders\Support;

use Illuminate\Database\Eloquent\Builder;

/**
 * The till's Active orders, as one rule: what `GET /api/orders?active_only=1` lists and what the
 * Telegram Today report counts as open (owner, 2026-11-07: "How about adding the open/saved
 * orders in this").
 *
 *   - dine_in / takeaway: only while UNPAID (or partial). Once paid the sale is done and
 *     belongs in Receipts, except a takeaway paid online, which waits for Collected.
 *   - online_pickup / delivery: stay until physically fulfilled, even when paid, so staff can
 *     Start cooking → Ready → Picked up / Delivered.
 */
final class ActiveOrders
{
    public const ONLINE_PAYMENT_METHODS = ['bml_connect', 'bml_pay', 'bml', 'online', 'stripe'];

    private const PAID = ['paid', 'completed', 'confirmed'];

    /**
     * @template T of Builder
     *
     * @param T $query
     * @return T
     */
    public static function apply(Builder $query): Builder
    {
        $query->whereNotIn('status', ['cancelled', 'refunded', 'completed', 'payment_pending']);
        // Online gift-card purchases are not kitchen/cashier tickets.
        $query->where('type', '!=', 'gift_card');
        // Event orders live on the dedicated POS Events tab — never Active Orders.
        $query->where('type', '!=', 'catering');

        $query->where(function ($w) {
            $w->whereIn('type', ['online_pickup', 'delivery'])
                ->orWhere(function ($w2) {
                    $w2->whereIn('type', ['dine_in', 'takeaway'])
                        ->where(function ($w3) {
                            $w3->whereNull('payment_status')
                                ->orWhereIn('payment_status', ['unpaid', 'partial']);
                        });
                })
                // Prepaid dine-in (customer paid online, user_id null) stays visible even while
                // fully paid: staff still have to fire the kitchen, seat the guest, and possibly
                // ring add-ons.
                ->orWhere(function ($w4) {
                    $w4->where('type', 'dine_in')->whereNull('user_id');
                })
                // A takeaway the customer paid online (owner, 2026-10-15: the cashier sent the
                // invoice or pay link, the customer paid it): it stays until the till marks it
                // Collected, as an online pickup does. A takeaway paid at the till still leaves
                // as soon as it is paid.
                ->orWhere(function ($w5) {
                    $w5->where('type', 'takeaway')
                        ->whereHas('payments', fn ($p) => $p->whereIn('method', self::ONLINE_PAYMENT_METHODS)->whereIn('status', self::PAID));
                });
        });

        return $query;
    }

    /** A till ticket still waiting to be paid (a saved ticket), as opposed to online work in the kitchen. */
    public static function isUnpaidTicket(string $type, ?string $paymentStatus): bool
    {
        return in_array($type, ['dine_in', 'takeaway'], true)
            && ($paymentStatus === null || in_array($paymentStatus, ['unpaid', 'partial'], true));
    }
}

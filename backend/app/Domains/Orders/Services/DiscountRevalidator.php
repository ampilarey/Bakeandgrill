<?php

declare(strict_types=1);

namespace App\Domains\Orders\Services;

use App\Domains\Orders\Support\DiscountSettings;
use App\Domains\Promotions\Services\PromotionEvaluator;
use App\Models\Order;
use Illuminate\Support\Facades\Log;

/**
 * Re-measures an order's discounts against the cart as it now stands.
 *
 * Every discount used to be computed once, against the cart at that moment,
 * and stored as a fixed number of laari that nothing ever revisited. Take
 * items off the ticket afterwards and the discount did not shrink with them —
 * it kept its full size and ate whatever was left. Measured on the real
 * endpoints during the 2026-09-01 audit: a MVR 600 ticket with MVR 200 off,
 * cut back to MVR 100, settled at MVR 0.00. By promo code and by manual
 * discount alike, and the promo's MVR 500 minimum spend was never re-checked.
 *
 * It is not a fraud shape. It is a cashier ringing six items, applying a code,
 * and the customer changing their mind — the screen then shows a total nobody
 * has any reason to distrust.
 *
 * So the stored figures are treated as a request, not an answer. On every
 * recalculation of an unlocked order each one is re-measured, and the smaller
 * of "what was asked for" and "what the current cart allows" wins. Discounts
 * never grow here: a cart that gets bigger does not earn more off than the
 * cashier gave.
 */
final class DiscountRevalidator
{
    /**
     * @return list<string> human-readable notes on anything that changed
     */
    public function revalidate(Order $order, int $subtotalLaar): array
    {
        // A settled order is history. Its totals are frozen deliberately
        // (see OrderTotalsCalculator::orderTotalsLocked) and re-pricing one
        // would rewrite what a customer already paid.
        if (OrderTotalsCalculator::orderTotalsLocked($order)) {
            return [];
        }

        $notes = [];

        foreach ($this->promoNotes($order, $subtotalLaar) as $note) {
            $notes[] = $note;
        }

        $manualNote = $this->clampManual($order, $subtotalLaar);
        if ($manualNote !== null) {
            $notes[] = $manualNote;
        }

        foreach ($this->clampToRemainingRoom($order, $subtotalLaar) as $note) {
            $notes[] = $note;
        }

        if ($notes !== []) {
            Log::info('Order discounts re-measured against current cart', [
                'order_id' => $order->id,
                'subtotal_laar' => $subtotalLaar,
                'changes' => $notes,
            ]);
        }

        return $notes;
    }

    /**
     * Coded and automatic promotions, re-checked against the current cart.
     *
     * A promo carries objective rules — minimum spend, date window, budget —
     * and a cart that no longer satisfies them should no longer carry the
     * promo. This is the case where a stale discount is not merely too large
     * but plainly not earned.
     *
     * @return list<string>
     */
    private function promoNotes(Order $order, int $subtotalLaar): array
    {
        if ((int) ($order->promo_discount_laar ?? 0) <= 0) {
            return [];
        }

        try {
            return app(PromotionEvaluator::class)->revalidateOrderPromotions($order, $subtotalLaar);
        } catch (\Throwable $e) {
            // Never let a promo lookup break the totals: an order that cannot
            // be priced is worse than one priced with a stale promo, and the
            // subtotal clamp still stops it going negative.
            Log::warning('Promo revalidation failed; leaving stored promo discount alone', [
                'order_id' => $order->id,
                'error' => $e->getMessage(),
            ]);

            return [];
        }
    }

    /**
     * Manual discount, held to what the ticket can still bear.
     *
     * Two rules, in order.
     *
     * First the configured ceiling, measured on the cart as it stands — the
     * same check `ManualDiscountPolicy` runs at apply time, which the edit path
     * skipped whenever the discount field was not itself being changed. Role
     * caps only ever narrow this, and the role that applied it is not recorded
     * on the order, so the global cap is the honest bound to use here.
     *
     * A discount that still fits stops there. MVR 30 off a ticket that has come
     * down to MVR 200 is untouched: the customer should not lose a discount
     * because of an edit that had nothing to do with it.
     *
     * Only when the discount no longer fits does the recorded basis matter, and
     * then it decides how much survives. The approval SMS quotes a share — "a
     * 33.3% (MVR 200) discount" — so the share is what a manager agreed to.
     * MVR 200 off MVR 600 becomes MVR 33.33 on a MVR 100 ticket, rather than
     * swallowing it whole.
     *
     * Orders written before the basis column existed have no recorded share, so
     * those fall back to the cap alone rather than being re-scaled against a
     * subtotal nobody measured.
     */
    private function clampManual(Order $order, int $subtotalLaar): ?string
    {
        $stored = (int) ($order->manual_discount_laar ?? 0);
        if ($stored <= 0) {
            return null;
        }

        $allowed = min($stored, DiscountSettings::effectiveCapLaar($subtotalLaar, null));

        if ($allowed >= $stored) {
            return null;
        }

        $basis = (int) ($order->manual_discount_subtotal_laar ?? 0);
        if ($basis > 0 && $subtotalLaar < $basis) {
            $allowed = min($allowed, (int) floor($subtotalLaar * ($stored / $basis)));
        }

        $order->manual_discount_laar = max(0, $allowed);

        return sprintf(
            'Manual discount reduced from MVR %s to MVR %s — the ticket is smaller than when it was approved.',
            number_format($stored / 100, 2),
            number_format(max(0, $allowed) / 100, 2),
        );
    }

    /**
     * Loyalty and referral, held to the merchandise left after the others.
     *
     * Both are sized at apply time against the room available then. They are
     * clamped rather than recomputed: points already held and a referral
     * already claimed should not silently grow back if the cart recovers.
     *
     * @return list<string>
     */
    private function clampToRemainingRoom(Order $order, int $subtotalLaar): array
    {
        $notes = [];

        $promo = (int) ($order->promo_discount_laar ?? 0);
        $manual = (int) ($order->manual_discount_laar ?? 0);

        foreach ([
            'loyalty_discount_laar' => 'Loyalty discount',
            'referral_discount_laar' => 'Referral discount',
        ] as $column => $label) {
            $stored = (int) ($order->{$column} ?? 0);
            if ($stored <= 0) {
                continue;
            }

            // Room left once everything ranked above this one has taken its
            // share. Gift cards are tender, not discount, so they take none.
            $taken = $promo + $manual;
            foreach (['loyalty_discount_laar', 'referral_discount_laar'] as $other) {
                if ($other !== $column) {
                    $taken += (int) ($order->{$other} ?? 0);
                }
            }

            $room = max(0, $subtotalLaar - $taken);
            if ($stored <= $room) {
                continue;
            }

            $order->{$column} = $room;
            $notes[] = sprintf(
                '%s reduced from MVR %s to MVR %s — the ticket no longer covers it.',
                $label,
                number_format($stored / 100, 2),
                number_format($room / 100, 2),
            );
        }

        return $notes;
    }
}

<?php

declare(strict_types=1);

namespace App\Domains\Payments\Services;

use App\Domains\Shifts\Services\ShiftAccessService;
use App\Models\CashMovement;
use App\Models\Shift;
use App\Models\SiteSetting;
use App\Models\User;

/**
 * How a gift card issued or topped up from the admin panel was paid for
 * (gift card audit, 2026-10-01).
 *
 * Before, the panel just created value. Cash taken at the counter for a card
 * never reached the drawer, so the drawer counted over and the sale was
 * nowhere. Anyone allowed to manage promotions could also make themselves a
 * MVR 5,000 card, and nothing marked it as free.
 *
 * Now every load says how it was paid. Cash goes into the drawer as a
 * cash-in, the same as a deposit received. A complimentary card above the
 * owner threshold needs an owner.
 */
final class GiftCardFunding
{
    public const METHODS = ['cash', 'card', 'bank_transfer', 'complimentary'];

    public const COMP_THRESHOLD_KEY = 'gift_card_comp_owner_threshold_mvr';

    public function __construct(private readonly ShiftAccessService $shifts) {}

    /**
     * Check the load is allowed, and put cash in the drawer. Run inside the
     * caller's transaction.
     */
    public function record(User $actor, string $paidBy, float $amountMvr, string $reason): void
    {
        if (!in_array($paidBy, self::METHODS, true)) {
            abort(422, 'Choose how the gift card was paid for.');
        }

        $isOwner = $actor->role?->slug === 'owner';

        if ($paidBy === 'complimentary' && !$isOwner) {
            $threshold = (float) SiteSetting::get(self::COMP_THRESHOLD_KEY, '500');
            if ($threshold > 0 && $amountMvr > $threshold) {
                abort(422, sprintf(
                    'Complimentary gift cards above MVR %s need an owner. Ask an owner to issue this one.',
                    number_format($threshold, 2),
                ));
            }
        }

        if ($paidBy !== 'cash') {
            return;
        }

        $shift = $this->shifts->findOpenShift($actor);
        if ($shift === null && !$isOwner) {
            abort(422, 'Open a shift before taking cash for a gift card.');
        }
        if ($shift === null) {
            // Owners are not drawer-bound; charge the one open drawer when
            // there is exactly one, as a deposit received does.
            $open = Shift::query()->whereNull('closed_at')->limit(2)->get();
            $shift = $open->count() === 1 ? $open->first() : null;
        }
        if ($shift === null) {
            return;
        }

        CashMovement::create([
            'shift_id' => $shift->id,
            'user_id' => $actor->id,
            'type' => 'cash_in',
            'amount' => round($amountMvr, 2),
            'reason' => $reason,
        ]);
    }
}

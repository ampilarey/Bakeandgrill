<?php

declare(strict_types=1);

namespace App\Domains\Orders\Services;

use App\Domains\Orders\DTOs\DiscountDecision;
use App\Domains\Orders\Support\DiscountSettings;
use App\Models\User;
use App\Services\AuditLogService;
use Illuminate\Http\Request;

/**
 * Single choke point for manual POS discounts.
 * Cap is a hard ceiling — approval never raises it.
 */
final class ManualDiscountPolicy
{
    public function __construct(
        private readonly AuditLogService $audit,
    ) {}

    /**
     * Validate rules and return a decision (no audit, no persist).
     * Use before creating an approval OTP or before applying.
     */
    public function validate(
        ?User $actor,
        int $subtotalLaar,
        int $requestedDiscountLaar,
        ?string $reason,
        ?string $reasonNote,
        bool $requireApprovalGate = true,
    ): DiscountDecision {
        $requested = max(0, $requestedDiscountLaar);

        if ($requested <= 0) {
            return new DiscountDecision(0, null, null, null);
        }

        if (!DiscountSettings::manualEnabled()) {
            abort(403, 'Manual discounts are currently disabled.');
        }

        if (!$actor instanceof User || !$actor->hasPermission('promotions.discounts')) {
            abort(403, 'You do not have permission to apply manual discounts.');
        }

        $reason = $reason !== null ? trim($reason) : null;
        $reasonNote = $reasonNote !== null ? trim($reasonNote) : null;
        if ($reasonNote === '') {
            $reasonNote = null;
        }

        if (DiscountSettings::reasonRequired()) {
            $allowed = DiscountSettings::reasons();
            if ($reason === null || $reason === '' || !in_array($reason, $allowed, true)) {
                abort(422, 'A discount reason is required.');
            }
            if ($reason === 'Other (note required)' && ($reasonNote === null || $reasonNote === '')) {
                abort(422, 'A note is required for this discount reason.');
            }
        }

        $roleSlug = $actor->role?->slug;
        $capLaar = DiscountSettings::effectiveCapLaar($subtotalLaar, $roleSlug);

        if ($requested > $capLaar) {
            $capPct = $subtotalLaar > 0
                ? round($capLaar * 100 / $subtotalLaar, 1)
                : 0;
            abort(422, 'Discount exceeds the maximum allowed (' . $capPct . '%).');
        }

        $discountLaar = min($requested, max(0, $subtotalLaar));

        if ($requireApprovalGate && DiscountSettings::approvalRequired()) {
            abort(422, 'Manager approval code required.');
        }

        return new DiscountDecision($discountLaar, $reason, $reasonNote, null);
    }

    /**
     * Validate + audit. Call when persisting a discount.
     *
     * @param  bool  $viaApprovalConfirm  Skips the approval-required gate.
     */
    public function authorizeAndClamp(
        ?User $actor,
        int $subtotalLaar,
        int $requestedDiscountLaar,
        ?string $reason,
        ?string $reasonNote,
        ?int $orderId = null,
        ?int $approvedByUserId = null,
        bool $viaApprovalConfirm = false,
        ?Request $request = null,
    ): DiscountDecision {
        $decision = $this->validate(
            $actor,
            $subtotalLaar,
            $requestedDiscountLaar,
            $reason,
            $reasonNote,
            requireApprovalGate: !$viaApprovalConfirm,
        );

        if ($decision->discountLaar <= 0) {
            return $decision;
        }

        $final = new DiscountDecision(
            $decision->discountLaar,
            $decision->reason,
            $decision->reasonNote,
            $approvedByUserId,
        );

        $roleSlug = $actor?->role?->slug;
        $capLaar = DiscountSettings::effectiveCapLaar($subtotalLaar, $roleSlug);
        $percent = $subtotalLaar > 0
            ? round($final->discountLaar * 100 / $subtotalLaar, 2)
            : 0.0;

        $this->audit->log(
            'order.manual_discount.applied',
            'Order',
            $orderId,
            [],
            [
                'subtotal_laar' => $subtotalLaar,
                'discount_laar' => $final->discountLaar,
                'discount_percent' => $percent,
                'reason' => $final->reason,
                'reason_note' => $final->reasonNote,
                'approved_by' => $approvedByUserId,
                'via_approval' => $viaApprovalConfirm,
                'cap_laar' => $capLaar,
                'actor_role' => $roleSlug,
            ],
            [
                'approval_required' => DiscountSettings::approvalRequired(),
            ],
            $request,
        );

        return $final;
    }
}

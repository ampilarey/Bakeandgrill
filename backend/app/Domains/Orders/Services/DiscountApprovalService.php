<?php

declare(strict_types=1);

namespace App\Domains\Orders\Services;

use App\Domains\Auth\Services\ApprovalOtpCoder;
use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\CustomerSmsMessageBuilder;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Orders\Support\DiscountSettings;
use App\Models\DiscountApproval;
use App\Models\Order;
use App\Models\User;
use App\Services\AuditLogService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * SMS one-time-code approval for manual POS discounts (§3A).
 */
final class DiscountApprovalService
{
    public function __construct(
        private readonly ManualDiscountPolicy $policy,
        private readonly OrderTotalsCalculator $calculator,
        private readonly SmsService $sms,
        private readonly CustomerSmsMessageBuilder $messages,
        private readonly AuditLogService $audit,
        private readonly ApprovalOtpCoder $otp,
    ) {}

    /**
     * @return array{approval_id: int}
     */
    public function requestApproval(
        Order $order,
        User $actor,
        float $discountAmountMvr,
        ?string $reason,
        ?string $reasonNote,
        ?Request $request = null,
    ): array {
        $approvers = DiscountSettings::effectiveApprovers();
        if ($approvers === []) {
            abort(422, 'Nobody can approve discounts right now. Add approvers under Discount controls, or give a manager the "Approve POS discounts" permission and a phone number.');
        }

        $order->loadMissing('items');
        $subtotalLaar = (int) ($order->subtotal_laar ?? 0);
        if ($subtotalLaar <= 0) {
            $subtotalLaar = (int) round((float) $order->items->sum('total_price') * 100);
        }

        $requestedLaar = max(0, (int) round($discountAmountMvr * 100));

        $decision = $this->policy->validate(
            $actor,
            $subtotalLaar,
            $requestedLaar,
            $reason,
            $reasonNote,
            requireApprovalGate: false,
        );

        if ($decision->discountLaar <= 0) {
            abort(422, 'Discount amount must be greater than zero.');
        }

        // A code each, so the one that comes back says who gave it. A single
        // shared code left confirm() crediting the first name in the list
        // whoever actually approved. Expiry is shared — it belongs to the
        // request, not to each code.
        $ttl = null;
        $expiresAt = null;
        $codes = [];
        foreach ($approvers as $i => $approver) {
            $issued = $this->otp->issue();
            $ttl ??= $issued['ttl_minutes'];
            $expiresAt ??= $issued['expires_at'];
            $codes[$i] = [
                'plain' => $issued['plain'],
                'hash' => $issued['hash'],
            ];
        }

        $percent = $subtotalLaar > 0
            ? round($decision->discountLaar * 100 / $subtotalLaar, 1)
            : 0.0;
        $amountMvr = number_format($decision->discountLaar / 100, 2, '.', '');
        $orderLabel = (string) ($order->order_number ?? $order->id);

        $approval = DiscountApproval::create([
            'order_id' => $order->id,
            'requested_by' => $actor->id,
            'subtotal_laar' => $subtotalLaar,
            'discount_laar' => $decision->discountLaar,
            'discount_percent' => $percent,
            'reason' => $decision->reason,
            'reason_note' => $decision->reasonNote,
            // Kept for approvals already in flight across the deploy that
            // introduced per-approver codes; new rows match on approver_codes.
            'code_hash' => $codes[0]['hash'] ?? null,
            'approver_codes' => array_map(
                fn (int $i) => [
                    'user_id' => $approvers[$i]['user_id'],
                    'label' => $approvers[$i]['label'],
                    'phone' => $approvers[$i]['phone'],
                    'code_hash' => $codes[$i]['hash'],
                ],
                array_keys($codes),
            ),
            'expires_at' => $expiresAt,
            'attempts' => 0,
            'status' => 'pending',
        ]);

        $sentTo = [];
        $delivered = 0;
        foreach ($approvers as $i => $approver) {
            $plainCode = $codes[$i]['plain'];
            $fallback = "Bake & Grill: approval code {$plainCode} for a {$percent}% ({$amountMvr}) discount on order {$orderLabel}. Expires in {$ttl} min. Do not share.";
            $body = $this->messages->build(
                'discount_approval_otp',
                [
                    'code' => $plainCode,
                    'percent' => (string) $percent,
                    'amount' => 'MVR ' . $amountMvr,
                    'order' => $orderLabel,
                    'minutes' => (string) $ttl,
                ],
                $fallback,
            );

            $log = $this->sms->send(new SmsMessage(
                to: $approver['phone'],
                message: $body,
                type: 'discount_approval_otp',
                referenceType: 'discount_approval',
                referenceId: (string) $approval->id,
                idempotencyKey: 'discount_approval:' . $approval->id . ':approver:' . $i,
                actingUserId: $actor->id,
            ));
            $sentTo[] = [
                'phone' => $approver['phone'],
                'label' => $approver['label'],
                'user_id' => $approver['user_id'],
                'sms_status' => $log->status,
            ];
            // Telegram instead of SMS counts: the approver has it.
            if ($log->reachedRecipient()) {
                $delivered++;
            }
        }

        if ($delivered === 0) {
            $approval->update(['status' => 'failed']);
            abort(422, 'Could not send approval SMS. Check SMS settings (global kill switch may be on).');
        }

        $this->audit->log(
            'order.manual_discount.approval_requested',
            'DiscountApproval',
            (int) $approval->id,
            [],
            [
                'order_id' => $order->id,
                'discount_laar' => $decision->discountLaar,
                'reason' => $decision->reason,
                'approvers' => $sentTo,
            ],
            [],
            $request,
        );

        return ['approval_id' => (int) $approval->id];
    }

    public function confirm(
        Order $order,
        User $actor,
        int $approvalId,
        ?string $code,
        ?Request $request = null,
    ): Order {
        $approval = DiscountApproval::query()
            ->where('id', $approvalId)
            ->where('order_id', $order->id)
            ->first();

        if ($approval === null) {
            abort(422, 'Invalid approval request.');
        }

        // Approved by button on Telegram: no code to check.
        if ($approval->status === 'granted') {
            return $this->applyApproval($order, $actor, $approval, $this->decidedApprover($approval), $request);
        }
        if ($approval->status === 'declined') {
            abort(422, 'The approver declined this discount.');
        }
        if ($approval->status !== 'pending') {
            abort(422, 'This approval code is no longer valid.');
        }
        if ($code === null || $code === '') {
            abort(422, 'Enter the approval code, or wait for the approver to tap Approve.');
        }

        // Each approver got their own code, so the one typed in identifies who
        // gave it. Rows created before that change carry a single code_hash.
        $approverCodes = is_array($approval->approver_codes) ? $approval->approver_codes : [];
        $hashes = [];
        foreach ($approverCodes as $i => $row) {
            if (is_array($row) && is_string($row['code_hash'] ?? null)) {
                $hashes[$i] = $row['code_hash'];
            }
        }
        if ($hashes === [] && is_string($approval->code_hash)) {
            $hashes[0] = $approval->code_hash;
        }

        $matched = $this->otp->assertValidAny(
            $hashes,
            $approval->expires_at,
            (int) $approval->attempts,
            $code,
            function (array $state) use ($approval): void {
                if (!empty($state['expired'])) {
                    $approval->update(['status' => 'expired']);

                    return;
                }
                if (!empty($state['failed'])) {
                    $approval->update([
                        'attempts' => $state['attempts'] ?? $approval->attempts,
                        'status' => 'failed',
                    ]);

                    return;
                }
                if (isset($state['attempts'])) {
                    $approval->update(['attempts' => $state['attempts']]);
                }
            },
            'approval',
        );

        // The approver whose code was used — not simply the first one on the
        // list, which is what this credited before and got wrong every time a
        // second approver answered.
        $matchedApprover = $approverCodes[$matched] ?? null;
        if (!is_array($matchedApprover)) {
            $fallbackApprovers = DiscountSettings::effectiveApprovers();
            $matchedApprover = $fallbackApprovers[0] ?? null;
        }

        return $this->applyApproval($order, $actor, $approval, is_array($matchedApprover) ? $matchedApprover : null, $request);
    }

    /**
     * The approval is good (a code matched, or the approver tapped Approve
     * on Telegram): put the discount on the order.
     *
     * @param array<string, mixed>|null $matchedApprover
     */
    private function applyApproval(Order $order, User $actor, DiscountApproval $approval, ?array $matchedApprover, ?Request $request): Order
    {
        // Amount binding: optional body discount_amount must match the pending record.
        if ($request !== null && $request->has('discount_amount')) {
            $claimedLaar = max(0, (int) round((float) $request->input('discount_amount') * 100));
            if ($claimedLaar !== (int) $approval->discount_laar) {
                abort(422, 'Discount amount changed. Request a new approval code.');
            }
        }

        $order->loadMissing('items');
        $subtotalLaar = (int) ($order->subtotal_laar ?? 0);
        if ($subtotalLaar <= 0) {
            $subtotalLaar = (int) round((float) $order->items->sum('total_price') * 100);
        }
        if ((int) $approval->discount_laar <= 0) {
            abort(422, 'Invalid approval amount.');
        }

        $roleSlug = $actor->role?->slug;
        $capLaar = DiscountSettings::effectiveCapLaar($subtotalLaar, $roleSlug);
        if ((int) $approval->discount_laar > $capLaar || (int) $approval->discount_laar > $subtotalLaar) {
            $approval->update(['status' => 'failed']);
            abort(422, 'Discount amount changed. Request a new approval code.');
        }

        $approvedBy = is_array($matchedApprover) ? ($matchedApprover['user_id'] ?? null) : null;
        $approvedLabel = is_array($matchedApprover)
            ? trim((string) ($matchedApprover['label'] ?? '')) ?: null
            : null;

        $decision = $this->policy->authorizeAndClamp(
            $actor,
            $subtotalLaar,
            (int) $approval->discount_laar,
            $approval->reason,
            $approval->reason_note,
            (int) $order->id,
            $approvedBy !== null ? (int) $approvedBy : null,
            viaApprovalConfirm: true,
            request: $request,
        );

        $order->update([
            'manual_discount_laar' => $decision->discountLaar,
            // The share the SMS actually quoted, so an edit later keeps it.
            'manual_discount_subtotal_laar' => $decision->discountLaar > 0 ? $subtotalLaar : null,
            'manual_discount_reason' => $decision->reason,
            'manual_discount_reason_note' => $decision->reasonNote,
            'manual_discount_approved_by' => $decision->approvedByUserId,
        ]);

        $approval->update([
            'status' => 'approved',
            'approved_by' => $decision->approvedByUserId,
            // Approvers configured by phone alone have no user row to point
            // at; without the label the record would say nothing at all.
            'approved_label' => $approvedLabel,
        ]);

        return $this->calculator->recalculateAndPersist($order->fresh(['items.item']));
    }

    // ── Approval by button (Telegram), owner 2026-10-07 ─────────────────

    /** Whether this staff member is one of the approvers the request went to. */
    public function isApprover(DiscountApproval $approval, User $user): bool
    {
        foreach ((array) $approval->approver_codes as $row) {
            if (is_array($row) && (int) ($row['user_id'] ?? 0) === (int) $user->id) {
                return true;
            }
        }

        return false;
    }

    /**
     * An approver taps Approve or Decline on Telegram. Approve marks the
     * request "granted"; the till sees it and applies the discount with no
     * code. Returns the fresh row; refuses anything not pending, expired,
     * or someone who was not asked.
     */
    public function decide(DiscountApproval $approval, User $user, bool $approve, ?Request $request = null): DiscountApproval
    {
        return DB::transaction(function () use ($approval, $user, $approve, $request): DiscountApproval {
            $row = DiscountApproval::query()->lockForUpdate()->findOrFail($approval->id);
            if (!$this->isApprover($row, $user)) {
                abort(403, 'This request did not go to you.');
            }
            if ($row->status !== 'pending') {
                abort(422, match ($row->status) {
                    'granted', 'approved' => 'Already approved.',
                    'declined' => 'Already declined.',
                    default => 'This request is no longer open.',
                });
            }
            if ($row->expires_at !== null && $row->expires_at->isPast()) {
                $row->update(['status' => 'expired']);
                abort(422, 'This request has expired. The till can ask again.');
            }

            $row->update([
                'status' => $approve ? 'granted' : 'declined',
                'decided_by' => $user->id,
                'decided_at' => now(),
            ]);

            $this->audit->log(
                $approve ? 'order.manual_discount.approved_by_button' : 'order.manual_discount.declined_by_button',
                'DiscountApproval',
                (int) $row->id,
                ['status' => 'pending'],
                ['status' => $row->status, 'decided_by' => $user->id],
                ['order_id' => $row->order_id, 'discount_laar' => $row->discount_laar, 'via' => 'telegram'],
                $request,
            );

            return $row->fresh();
        });
    }

    /**
     * What the till shows while it waits: pending, granted (apply now),
     * declined, expired, approved (already applied) or failed.
     *
     * @return array{status: string, decided_by_name: string|null}
     */
    public function status(DiscountApproval $approval): array
    {
        $status = (string) $approval->status;
        if ($status === 'pending' && $approval->expires_at !== null && $approval->expires_at->isPast()) {
            $status = 'expired';
        }

        return [
            'status' => $status,
            'decided_by_name' => $approval->decided_by ? User::query()->whereKey($approval->decided_by)->value('name') : null,
        ];
    }

    /** @return array<string, mixed>|null the approver_codes entry for whoever tapped Approve */
    private function decidedApprover(DiscountApproval $approval): ?array
    {
        foreach ((array) $approval->approver_codes as $row) {
            if (is_array($row) && (int) ($row['user_id'] ?? 0) === (int) $approval->decided_by) {
                return $row;
            }
        }
        $name = $approval->decided_by ? User::query()->whereKey($approval->decided_by)->value('name') : null;

        return $approval->decided_by ? ['user_id' => (int) $approval->decided_by, 'label' => $name] : null;
    }
}

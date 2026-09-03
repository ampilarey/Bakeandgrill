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
            if (in_array($log->status, ['sent', 'demo', 'queued'], true)) {
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
        string $code,
        ?Request $request = null,
    ): Order {
        $approval = DiscountApproval::query()
            ->where('id', $approvalId)
            ->where('order_id', $order->id)
            ->first();

        if ($approval === null) {
            abort(422, 'Invalid approval request.');
        }

        if ($approval->status !== 'pending') {
            abort(422, 'This approval code is no longer valid.');
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

        // The approver whose code was used — not simply the first one on the
        // list, which is what this credited before and got wrong every time a
        // second approver answered.
        $matchedApprover = $approverCodes[$matched] ?? null;
        if (!is_array($matchedApprover)) {
            $fallbackApprovers = DiscountSettings::effectiveApprovers();
            $matchedApprover = $fallbackApprovers[0] ?? null;
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
}

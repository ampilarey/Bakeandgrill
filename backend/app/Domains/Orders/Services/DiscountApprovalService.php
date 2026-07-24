<?php

declare(strict_types=1);

namespace App\Domains\Orders\Services;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\CustomerSmsMessageBuilder;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Orders\Support\DiscountSettings;
use App\Models\DiscountApproval;
use App\Models\Order;
use App\Models\User;
use App\Services\AuditLogService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

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
        if (!DiscountSettings::approvalRequired()) {
            abort(422, 'Discount approval is not required.');
        }

        $approvers = DiscountSettings::approvers();
        if ($approvers === []) {
            abort(422, 'No discount approvers are configured. Ask an admin to add approvers.');
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

        $ttl = DiscountSettings::codeTtlMinutes();
        $plainCode = str_pad((string) random_int(0, 9999), 4, '0', STR_PAD_LEFT);
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
            'code_hash' => Hash::make($plainCode),
            'expires_at' => now()->addMinutes($ttl),
            'attempts' => 0,
            'status' => 'pending',
        ]);

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

        $sentTo = [];
        $delivered = 0;
        foreach ($approvers as $i => $approver) {
            $log = $this->sms->send(new SmsMessage(
                to: $approver['phone'],
                message: $body,
                type: 'discount_approval_otp',
                referenceType: 'discount_approval',
                referenceId: (string) $approval->id,
                idempotencyKey: 'discount_approval:' . $approval->id . ':approver:' . $i,
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

        if ($approval->expires_at === null || $approval->expires_at->isPast()) {
            $approval->update(['status' => 'expired']);
            abort(422, 'Approval code expired.');
        }

        $maxAttempts = DiscountSettings::maxAttempts();
        if ((int) $approval->attempts >= $maxAttempts) {
            $approval->update(['status' => 'failed']);
            abort(422, 'Too many attempts. Request a new code.');
        }

        $code = trim($code);
        if ($code === '' || !Hash::check($code, (string) $approval->code_hash)) {
            $attempts = (int) $approval->attempts + 1;
            $status = $attempts >= $maxAttempts ? 'failed' : 'pending';
            $approval->update([
                'attempts' => $attempts,
                'status' => $status,
            ]);
            if ($status === 'failed') {
                abort(422, 'Too many attempts. Request a new code.');
            }
            abort(422, 'Invalid code.');
        }

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

        $approvers = DiscountSettings::approvers();
        $approvedBy = $approvers[0]['user_id'] ?? null;

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
            'manual_discount_reason' => $decision->reason,
            'manual_discount_reason_note' => $decision->reasonNote,
            'manual_discount_approved_by' => $decision->approvedByUserId,
        ]);

        $approval->update([
            'status' => 'approved',
            'approved_by' => $decision->approvedByUserId,
        ]);

        return $this->calculator->recalculateAndPersist($order->fresh(['items.item']));
    }
}

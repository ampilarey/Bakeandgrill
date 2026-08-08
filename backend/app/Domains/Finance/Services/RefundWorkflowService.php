<?php

declare(strict_types=1);

namespace App\Domains\Finance\Services;

use App\Domains\Auth\Services\ApprovalOtpCoder;
use App\Domains\Menu\Services\ComboChildStockService;
use App\Domains\Orders\DTOs\OrderRefundedData;
use App\Domains\Orders\Events\OrderRefunded;
use App\Domains\Payments\Repositories\PaymentRepositoryInterface;
use App\Models\Order;
use App\Models\Refund;
use App\Models\User;
use App\Rules\MaldivesPhone;
use App\Services\AuditLogService;
use App\Services\OrderStatusTransitionService;
use App\Services\StockManagementService;
use App\Services\StockReservationService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Two-step refunds: request (pending) → approve (money moves) / reject.
 * Card provider is never called — there is no gateway refund path today;
 * approval gates drawer accounting + OrderRefunded side effects only.
 */
class RefundWorkflowService
{
    public const REASON_CATEGORIES = [
        'wrong_item',
        'quality_complaint',
        'order_cancelled',
        'duplicate_charge',
        'other',
    ];

    public function __construct(
        private readonly PaymentRepositoryInterface $payments,
        private readonly RefundDrawerCashService $drawerCash,
        private readonly RefundNotificationService $notifications,
        private readonly ApprovalOtpCoder $otp,
    ) {}

    public function resolveOrderContactPhone(Order $order): ?string
    {
        return $this->notifications->resolveOrderContactPhone($order);
    }

    /**
     * Resolve the refund phone without ever mutating Order/Customer records.
     *
     * @param  array{refund_phone?: string|null}  $validated
     * @return array{phone: string, phone_added_at_refund: bool}
     */
    public function resolveRefundPhoneForRequest(Order $order, array $validated): array
    {
        $orderPhone = $this->resolveOrderContactPhone($order);
        $supplied = isset($validated['refund_phone']) ? trim((string) $validated['refund_phone']) : '';

        if ($orderPhone !== null) {
            if ($supplied !== '') {
                $normalized = MaldivesPhone::normalize($supplied);
                if ($normalized !== $orderPhone) {
                    abort(422, 'This order already has a phone number. It cannot be changed from the refund flow.');
                }
            }

            return ['phone' => $orderPhone, 'phone_added_at_refund' => false];
        }

        if ($supplied === '') {
            abort(422, 'A customer phone number is required for this refund.');
        }

        return [
            'phone' => MaldivesPhone::normalize($supplied),
            'phone_added_at_refund' => true,
        ];
    }

    /**
     * Suspicious-number flags for approvers / daily summary. Never blocking.
     *
     * @return array{
     *   refund_phone: string|null,
     *   phone_added_at_refund: bool,
     *   has_prior_order_history: bool,
     *   refunds_last_90_days: int,
     *   otp_verified: bool,
     *   otp_owner_override: bool
     * }
     */
    public function phoneFlags(Refund $refund): array
    {
        $phone = $this->notifications->resolveRefundPhone($refund);
        $prior = false;
        $repeat = 0;
        if ($phone !== null) {
            $prior = Order::query()
                ->where('id', '!=', $refund->order_id)
                ->where(function ($q) use ($phone) {
                    $q->where('delivery_contact_phone', $phone)
                        ->orWhereHas('customer', fn ($c) => $c->where('phone', $phone));
                })
                ->exists();

            $repeat = (int) Refund::query()
                ->where('refund_phone', $phone)
                ->where('id', '!=', $refund->id)
                ->where('created_at', '>=', now()->subDays(90))
                ->whereIn('status', ['pending', 'approved', 'processed'])
                ->count();
        }

        return [
            'refund_phone' => $phone,
            'phone_added_at_refund' => (bool) $refund->phone_added_at_refund,
            'has_prior_order_history' => $prior,
            'refunds_last_90_days' => $repeat,
            'otp_verified' => $refund->otp_verified_at !== null,
            'otp_owner_override' => (bool) $refund->otp_owner_override,
        ];
    }

    /**
     * @param  array{amount: float, reason_category: string, reason: string, cash_refund_override?: bool, refund_phone?: string|null}  $validated
     * @return array{refund: Refund, order: Order, breakdown: array<string, mixed>, auto_approved: bool, phone_flags: array<string, mixed>}
     */
    public function request(Order $order, User $requester, array $validated, int $shiftId, ?Request $request = null): array
    {
        $amount = (float) $validated['amount'];
        $amountLaar = (int) round($amount * 100);
        $cashOverride = (bool) ($validated['cash_refund_override'] ?? false);
        $category = (string) $validated['reason_category'];
        $reason = trim((string) $validated['reason']);

        if (! in_array($category, self::REASON_CATEGORIES, true)) {
            abort(422, 'Invalid refund reason category.');
        }
        if ($reason === '') {
            abort(422, 'Refund reason text is required.');
        }
        if ($category === 'other' && strlen($reason) < 3) {
            abort(422, 'Please describe the reason when category is Other.');
        }

        // Snapshot phone only — never write back to orders/customers.
        $orderPhoneBefore = $this->resolveOrderContactPhone($order);
        $customerPhoneBefore = $order->customer?->phone;
        $phoneResolution = $this->resolveRefundPhoneForRequest($order, $validated);

        [$refund, $breakdown] = DB::transaction(function () use (
            $order, $requester, $amount, $amountLaar, $cashOverride, $category, $reason, $phoneResolution, $shiftId
        ) {
            $locked = Order::with(['items.item', 'items.variant', 'customer'])
                ->lockForUpdate()
                ->findOrFail($order->id);

            $caps = $this->computeCaps($locked);
            $this->assertWithinCap($amountLaar, $caps);
            $this->assertGiftCardFullRefund($locked, $amountLaar, $caps);

            $breakdown = $this->drawerCash->breakdown(
                $locked,
                $amountLaar,
                $caps['paid_laar'],
                $caps['order_total_laar'],
            );
            $nonCashFloor = $breakdown['credit_reversed_laar']
                + $breakdown['gift_reversed_laar']
                + $breakdown['wallet_reversed_laar'];
            $drawerLaar = $cashOverride
                ? max(0, $amountLaar - $nonCashFloor)
                : $breakdown['default_drawer_cash_out_laar'];
            $drawerLaar = max(0, min($drawerLaar, $amountLaar - $nonCashFloor));

            $refund = Refund::create([
                'order_id' => $locked->id,
                'user_id' => $requester->id,
                'shift_id' => $shiftId,
                'amount' => $amount,
                'drawer_cash_out_laar' => $drawerLaar,
                'status' => 'pending',
                'reason' => $reason,
                'reason_category' => $category,
                'requested_at' => now(),
                'no_customer_contact' => false,
                'refund_phone' => $phoneResolution['phone'],
                'phone_added_at_refund' => $phoneResolution['phone_added_at_refund'],
            ]);

            $breakdown['drawer_cash_out_laar'] = $drawerLaar;
            $breakdown['cash_refund_override'] = $cashOverride;

            return [$refund, $breakdown];
        });

        // Hard guarantee: refund flow never mutates order/customer phone.
        $order->refresh()->load('customer');
        if ($this->resolveOrderContactPhone($order) !== $orderPhoneBefore) {
            abort(500, 'Refund flow attempted to alter the order phone.');
        }
        if (($order->customer?->phone ?? null) !== $customerPhoneBefore) {
            abort(500, 'Refund flow attempted to alter the customer phone.');
        }

        app(AuditLogService::class)->log(
            'refund.requested',
            'Refund',
            $refund->id,
            [],
            $refund->toArray(),
            [
                'order_id' => $order->id,
                'refund_phone' => $phoneResolution['phone'],
                'phone_added_at_refund' => $phoneResolution['phone_added_at_refund'],
            ],
            $request,
        );

        $this->notifications->notifyCustomerRequested($refund->fresh(['order.customer']));

        $autoApproved = false;
        if ($this->isOwner($requester)) {
            // Owner: request + approve in one action, no OTP.
            $refund = $this->approve(
                $refund,
                $requester,
                $request,
                allowSelf: true,
                otpCode: null,
                ownerOverrideWithoutOtp: true,
            );
            $autoApproved = true;
        } else {
            $this->notifications->issueAndSendOtp($refund->fresh(['order.customer']));
            $this->notifications->notifyApprovers($refund->fresh(['order']), $requester);
        }

        $refund = $refund->fresh(['order', 'user', 'approver']);

        return [
            'refund' => $refund,
            'order' => $order->fresh(),
            'breakdown' => $breakdown,
            'auto_approved' => $autoApproved,
            'phone_flags' => $this->phoneFlags($refund),
        ];
    }

    public function resendOtp(Refund $refund, User $actor, ?Request $request = null): Refund
    {
        if ($refund->status !== 'pending') {
            abort(422, 'Only pending refunds can receive a verification code.');
        }
        $this->notifications->issueAndSendOtp($refund->fresh(['order.customer']));
        app(AuditLogService::class)->log(
            'refund.otp_resent',
            'Refund',
            $refund->id,
            [],
            ['resent_by' => $actor->id],
            [],
            $request,
        );

        return $refund->fresh(['order', 'user', 'approver']);
    }

    public function approve(
        Refund $refund,
        User $approver,
        ?Request $request = null,
        bool $allowSelf = false,
        ?string $otpCode = null,
        bool $ownerOverrideWithoutOtp = false,
    ): Refund {
        if ($refund->status !== 'pending') {
            abort(422, 'Only pending refunds can be approved.');
        }

        if (! $allowSelf && (int) $refund->user_id === (int) $approver->id && ! $this->isOwner($approver)) {
            abort(422, 'You cannot approve a refund you requested. Another authoriser must approve it.');
        }

        $isOwner = $this->isOwner($approver);
        $override = $ownerOverrideWithoutOtp && $isOwner;

        if (! $override) {
            if ($isOwner && ($otpCode === null || trim($otpCode) === '') && $allowSelf) {
                // Owner one-shot from request() already sets override=true.
                $override = true;
            }
        }

        if ($override) {
            $refund->forceFill([
                'otp_owner_override' => true,
                'otp_verified_at' => null,
                'otp_code_hash' => null,
            ])->save();
        } else {
            if ($otpCode === null || trim($otpCode) === '') {
                abort(422, 'Customer verification code is required to approve this refund.');
            }
            $this->otp->assertValid(
                $refund->otp_code_hash,
                $refund->otp_expires_at,
                (int) $refund->otp_attempts,
                $otpCode,
                function (array $state) use ($refund): void {
                    $updates = [];
                    if (isset($state['attempts'])) {
                        $updates['otp_attempts'] = $state['attempts'];
                    }
                    if (! empty($state['expired']) || ! empty($state['failed'])) {
                        $updates['otp_code_hash'] = null;
                        $updates['otp_expires_at'] = null;
                    }
                    if ($updates !== []) {
                        $refund->forceFill($updates)->save();
                    }
                },
            );
            $refund->forceFill([
                'otp_verified_at' => now(),
                'otp_owner_override' => false,
                'otp_code_hash' => null,
                'otp_attempts' => (int) $refund->otp_attempts,
            ])->save();
        }

        [$refund, $order, $refundRatio, $breakdown] = DB::transaction(function () use ($refund, $approver) {
            $lockedRefund = Refund::where('id', $refund->id)->lockForUpdate()->firstOrFail();
            if ($lockedRefund->status !== 'pending') {
                abort(422, 'Only pending refunds can be approved.');
            }

            $order = Order::with(['items.item', 'items.variant', 'customer', 'items.item.comboItems.item'])
                ->lockForUpdate()
                ->findOrFail($lockedRefund->order_id);

            $caps = $this->computeCaps($order, excludeRefundId: $lockedRefund->id);
            $amountLaar = (int) round((float) $lockedRefund->amount * 100);
            $this->assertWithinCap($amountLaar, $caps);
            $this->assertGiftCardFullRefund($order, $amountLaar, $caps);

            $live = $this->drawerCash->breakdown(
                $order,
                $amountLaar,
                $caps['paid_laar'],
                $caps['order_total_laar'],
            );
            $breakdown = array_merge($live, [
                'drawer_cash_out_laar' => (int) ($lockedRefund->drawer_cash_out_laar ?? $live['default_drawer_cash_out_laar']),
                'cash_refund_override' => false,
            ]);

            $isFullRefund = ($amountLaar + $caps['already_refunded_laar'] >= $caps['refundable_laar'])
                && $caps['refundable_laar'] > 0;
            $thisRefundRatio = $caps['refundable_laar'] > 0
                ? min(1.0, $amountLaar / $caps['refundable_laar'])
                : 0.0;

            $transitions = app(OrderStatusTransitionService::class);
            if ($isFullRefund) {
                if (! in_array($order->status, ['cancelled', 'refunded'], true)) {
                    $transitions->transition($order, 'refunded');
                }
            } elseif ($amountLaar > 0) {
                if (! in_array($order->status, ['cancelled', 'refunded'], true)) {
                    $transitions->transition($order, 'partially_refunded');
                }
            }

            $this->restoreStock($order, $lockedRefund, $isFullRefund, $thisRefundRatio, $approver->id);

            if (in_array($order->type, ['online_pickup', 'delivery'], true)) {
                app(StockReservationService::class)->releaseForOrder($order->id);
            }

            $lockedRefund->update([
                'status' => 'approved',
                'approved_by' => $approver->id,
                'approved_at' => now(),
            ]);

            return [$lockedRefund->fresh(), $order->fresh(), $thisRefundRatio, $breakdown];
        });

        app(AuditLogService::class)->log(
            'refund.approved',
            'Refund',
            $refund->id,
            [],
            $refund->toArray(),
            [
                'order_id' => $order->id,
                'approved_by' => $approver->id,
                'otp_owner_override' => (bool) $refund->otp_owner_override,
                'phone_flags' => $this->phoneFlags($refund),
            ],
            $request,
        );

        $refund->load('order.customer');
        event(new OrderRefunded(OrderRefundedData::fromRefund($refund, $refundRatio)));
        $this->notifications->notifyCustomerCompleted($refund);

        return $refund->fresh(['order', 'user', 'approver']);
    }

    public function reject(Refund $refund, User $approver, string $rejectionReason, ?Request $request = null): Refund
    {
        if ($refund->status !== 'pending') {
            abort(422, 'Only pending refunds can be rejected.');
        }

        $reason = trim($rejectionReason);
        if ($reason === '') {
            abort(422, 'Rejection reason is required.');
        }

        if ((int) $refund->user_id === (int) $approver->id && ! $this->isOwner($approver)) {
            abort(422, 'You cannot reject a refund you requested. Another authoriser must decide.');
        }

        DB::transaction(function () use ($refund, $approver, $reason) {
            $locked = Refund::where('id', $refund->id)->lockForUpdate()->firstOrFail();
            if ($locked->status !== 'pending') {
                abort(422, 'Only pending refunds can be rejected.');
            }
            $locked->update([
                'status' => 'rejected',
                'approved_by' => $approver->id,
                'approved_at' => now(),
                'rejection_reason' => $reason,
                'drawer_cash_out_laar' => 0,
                'otp_code_hash' => null,
            ]);
        });

        $fresh = $refund->fresh(['order', 'user', 'approver']);
        app(AuditLogService::class)->log(
            'refund.rejected',
            'Refund',
            $fresh->id,
            [],
            $fresh->toArray(),
            ['order_id' => $fresh->order_id, 'rejected_by' => $approver->id],
            $request,
        );

        return $fresh;
    }

    public function isOwner(User $user): bool
    {
        $user->loadMissing('role');

        return ($user->role?->slug ?? '') === 'owner';
    }

    /**
     * @return array{paid_laar: int, order_total_laar: int, already_refunded_laar: int, refundable_laar: int}
     */
    private function computeCaps(Order $order, ?int $excludeRefundId = null): array
    {
        $orderTotalLaar = (int) ($order->total_laar ?? round((float) ($order->total ?? 0) * 100));
        $paidLaar = $this->payments->sumAmountLaarForOrder(
            $order->id,
            ['paid', 'completed', 'confirmed'],
        );

        $q = $order->refunds()->where('status', '!=', 'rejected');
        if ($excludeRefundId !== null) {
            $q->where('id', '!=', $excludeRefundId);
        }
        $alreadyRefundedLaar = (int) $q
            ->selectRaw('COALESCE(SUM(ROUND(amount * 100)), 0) as total_laar')
            ->value('total_laar');

        $refundableLaar = min($paidLaar, $orderTotalLaar);

        return [
            'paid_laar' => $paidLaar,
            'order_total_laar' => $orderTotalLaar,
            'already_refunded_laar' => $alreadyRefundedLaar,
            'refundable_laar' => $refundableLaar,
        ];
    }

    /** @param  array{paid_laar: int, already_refunded_laar: int, refundable_laar: int}  $caps */
    private function assertWithinCap(int $amountLaar, array $caps): void
    {
        if ($amountLaar + $caps['already_refunded_laar'] > $caps['refundable_laar']) {
            abort(422, sprintf(
                'Refund would exceed amount paid. Paid: %s, already refunded: %s, max refundable: %s.',
                number_format($caps['paid_laar'] / 100, 2),
                number_format($caps['already_refunded_laar'] / 100, 2),
                number_format(max(0, $caps['refundable_laar'] - $caps['already_refunded_laar']) / 100, 2),
            ));
        }
    }

    /** @param  array{already_refunded_laar: int, refundable_laar: int}  $caps */
    private function assertGiftCardFullRefund(Order $order, int $amountLaar, array $caps): void
    {
        if (($order->type ?? '') === 'gift_card'
            && $caps['refundable_laar'] > 0
            && $amountLaar + $caps['already_refunded_laar'] < $caps['refundable_laar']) {
            abort(422, 'Gift card purchases can only be refunded in full.');
        }
    }

    private function restoreStock(
        Order $order,
        Refund $refund,
        bool $isFullRefund,
        float $thisRefundRatio,
        ?int $actorId,
    ): void {
        $amountLaar = (int) round((float) $refund->amount * 100);
        if (! $isFullRefund && ($amountLaar <= 0 || $thisRefundRatio <= 0)) {
            return;
        }

        $stockService = app(StockManagementService::class);
        $comboStock = app(ComboChildStockService::class);
        $order->loadMissing(['items.item.comboItems.item', 'items.variant']);

        foreach ($order->items as $orderItem) {
            $item = $orderItem->item;
            if (! $item) {
                continue;
            }

            $lineQty = (int) $orderItem->quantity;
            $restoreQty = $isFullRefund
                ? $lineQty
                : max(0, (int) floor($lineQty * $thisRefundRatio));
            if ($restoreQty <= 0) {
                continue;
            }

            $variant = $orderItem->variant;
            if ($variant && $variant->track_stock) {
                if ($stockService->wasPreparedStockDeductedForLine($order->id, $orderItem->id)) {
                    $key = 'refund:order:'.$order->id.':variant:'.$orderItem->id
                        .($isFullRefund ? '' : ':partial:'.$refund->id);
                    $stockService->restoreVariantStock($variant, $restoreQty, $key, $order->id, $actorId);
                }
            } elseif ($item->track_stock && $item->availability_type === 'stock_based') {
                if ($stockService->wasPreparedStockDeductedForLine($order->id, $orderItem->id)) {
                    $key = 'refund:order:'.$order->id.':item:'.$orderItem->id
                        .($isFullRefund ? '' : ':partial:'.$refund->id);
                    $stockService->restorePreparedStock($item, $restoreQty, $key, $order->id, $actorId);
                }
            }

            $comboStock->restoreForOrderItem(
                $item,
                $orderItem,
                $restoreQty,
                $lineQty,
                fn ($child) => $comboStock->refundKey(
                    (int) $order->id,
                    (int) $orderItem->id,
                    (int) $child->id,
                    $isFullRefund,
                    (int) $refund->id,
                ),
                (int) $order->id,
                $actorId,
                onlyIfPreviouslyDeducted: true,
            );
        }
    }
}

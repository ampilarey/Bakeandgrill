<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Orders\Services\OrderTotalsCalculator;
use App\Domains\Orders\Support\EffectiveDiscount;
use App\Domains\Payments\Services\GiftCardCodeService;
use App\Domains\Payments\Services\GiftCardEmailDelivery;
use App\Domains\Payments\Services\GiftCardIssueService;
use App\Domains\Payments\Services\GiftCardPurchaseDeliveryWindow;
use App\Domains\Payments\Services\GiftCardPurchaseFulfillmentService;
use App\Domains\Payments\Services\GiftCardPurchaseService;
use App\Domains\Payments\Services\GiftCardRedemptionService;
use App\Domains\Payments\Services\GiftCardSmsDelivery;
use App\Domains\Payments\Services\PaymentService;
use App\Models\Customer;
use App\Models\GiftCard;
use App\Models\GiftCardPurchase;
use App\Models\GiftCardTransaction;
use App\Models\Order;
use App\Rules\MaldivesPhone;
use App\Services\AuditLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\Rule;

class GiftCardController extends Controller
{
    public function __construct(
        private readonly GiftCardCodeService $giftCardCodes,
        private readonly GiftCardSmsDelivery $giftCardSms,
        private readonly GiftCardEmailDelivery $giftCardEmail,
        private readonly GiftCardRedemptionService $giftCardRedemption,
        private readonly GiftCardIssueService $giftCardIssue,
        private readonly GiftCardPurchaseService $giftCardPurchase,
        private readonly GiftCardPurchaseDeliveryWindow $deliveryWindow,
        private readonly AuditLogService $audit,
    ) {}

    // ── Public: check balance ─────────────────────────────────────────────────

    /** @deprecated Prefer POST /gift-cards/balance (code in body avoids URL logging). */
    public function balance(string $code): JsonResponse
    {
        return $this->balanceResponse($code);
    }

    public function balancePost(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'code' => ['required', 'string', 'max:32'],
        ]);

        return $this->balanceResponse($validated['code']);
    }

    /**
     * Public: open a gift card from the SMS "View your card" link (48h window).
     */
    public function viewByToken(string $token): JsonResponse
    {
        $purchase = GiftCardPurchase::query()
            ->with('giftCard:id,code_last4,initial_balance,current_balance,status,expires_at')
            ->where('view_token', $token)
            ->first();

        if (!$purchase || !$purchase->giftCard) {
            return response()->json(['message' => 'This gift card link is invalid or has expired.'], 404);
        }

        if ($purchase->code_delivery_expires_at && $purchase->code_delivery_expires_at->isPast()) {
            return response()->json(['message' => 'This gift card link has expired.'], 410);
        }

        $plain = $this->deliveryWindow->plainCode($purchase);
        if ($plain === null) {
            return response()->json(['message' => 'This gift card link has expired.'], 410);
        }

        $card = $purchase->giftCard;

        return response()->json([
            'code' => $plain,
            'masked_code' => $card->masked_code,
            'amount' => (float) $card->initial_balance,
            'current_balance' => (float) $card->current_balance,
            'status' => $card->status,
            'expires_at' => $card->expires_at?->toDateString(),
            'order_number' => Order::query()->where('id', $purchase->order_id)->value('order_number'),
        ]);
    }

    private function balanceResponse(string $code): JsonResponse
    {
        $card = $this->giftCardCodes->findByCode($code);

        if (!$card || $card->status !== 'active') {
            return response()->json(['error' => 'Invalid or unavailable gift card.'], 404);
        }

        if ($card->expires_at && $card->expires_at->isPast()) {
            $card->update(['status' => 'expired']);

            return response()->json(['error' => 'Invalid or unavailable gift card.'], 404);
        }

        $heldLaar = $this->giftCardRedemption->reservedLaar($card);
        $availableLaar = $this->giftCardRedemption->availableLaar($card);

        return response()->json([
            'masked_code' => $card->masked_code,
            'current_balance' => (float) $card->current_balance,
            'held_balance' => round($heldLaar / 100, 2),
            'available_balance' => round($availableLaar / 100, 2),
            'expires_at' => $card->expires_at?->toDateString(),
        ]);
    }

    // ── Customer: apply gift card to order ───────────────────────────────────

    public function applyToOrder(Request $request, int $orderId, OrderTotalsCalculator $calc): JsonResponse
    {
        $validated = $request->validate(['code' => ['required', 'string', 'max:32']]);

        $order = Order::where('id', $orderId)
            ->where('customer_id', $request->user()->id)
            ->whereIn('status', ['payment_pending', 'pending'])
            ->firstOrFail();

        return DB::transaction(function () use ($validated, $order, $calc): JsonResponse {
            $card = $this->giftCardCodes->findActiveByCodeForUpdate($validated['code']);

            if (!$card) {
                return response()->json(['message' => 'Invalid or unavailable gift card.'], 422);
            }

            if ($card->expires_at && $card->expires_at->isPast()) {
                $card->update(['status' => 'expired']);

                return response()->json(['message' => 'This gift card has expired.'], 422);
            }

            $availableLaar = $this->giftCardRedemption->availableLaar($card, $order->id);
            if ($availableLaar <= 0) {
                return response()->json([
                    'message' => 'This gift card has no available balance (held on other unpaid orders).',
                ], 422);
            }

            $discountLaar = min(
                $availableLaar,
                EffectiveDiscount::remainingPreTaxBeforeGift($order),
            );

            $order->update([
                'gift_card_id' => $card->id,
                'gift_card_discount_laar' => $discountLaar,
            ]);

            $calc->recalculateAndPersist($order->fresh());

            return response()->json([
                'discount_laar' => $discountLaar,
                'discount_mvr' => number_format($discountLaar / 100, 2),
                'card_balance' => (float) $card->current_balance,
                'available_balance' => round($availableLaar / 100, 2),
                'masked_code' => $card->masked_code,
            ]);
        });
    }

    // ── Customer: remove gift card from order ─────────────────────────────────

    public function removeFromOrder(Request $request, int $orderId, OrderTotalsCalculator $calc): JsonResponse
    {
        $order = Order::where('id', $orderId)
            ->where('customer_id', $request->user()->id)
            ->whereIn('status', ['payment_pending', 'pending'])
            ->firstOrFail();

        $order->update(['gift_card_id' => null, 'gift_card_discount_laar' => 0]);
        $calc->recalculateAndPersist($order->fresh());

        return response()->json(['message' => 'Gift card removed.']);
    }

    // ── Staff POS: apply / remove gift card on a staff-rung order ─────────────

    public function staffApplyToOrder(Request $request, int $orderId, OrderTotalsCalculator $calc): JsonResponse
    {
        if (!$request->user()?->tokenCan('staff')) {
            return response()->json(['message' => 'Forbidden - staff access only'], 403);
        }
        if (!$request->user()->hasPermission('promotions.discounts')) {
            return response()->json(['message' => 'You do not have permission to apply discounts.'], 403);
        }

        $validated = $request->validate(['code' => ['required', 'string', 'max:32']]);

        $order = Order::query()
            ->whereIn('status', GiftCardRedemptionService::RESERVING_STATUSES)
            ->findOrFail($orderId);

        return DB::transaction(function () use ($validated, $order, $calc, $request): JsonResponse {
            $card = $this->giftCardCodes->findActiveByCodeForUpdate($validated['code']);

            if (!$card) {
                return response()->json(['message' => 'Invalid or unavailable gift card.'], 422);
            }
            if ($card->expires_at && $card->expires_at->isPast()) {
                $card->update(['status' => 'expired']);

                return response()->json(['message' => 'This gift card has expired.'], 422);
            }

            $availableLaar = $this->giftCardRedemption->availableLaar($card, $order->id);
            if ($availableLaar <= 0) {
                return response()->json([
                    'message' => 'This gift card has no available balance (held on other unpaid orders).',
                ], 422);
            }

            $discountLaar = min(
                $availableLaar,
                EffectiveDiscount::remainingPreTaxBeforeGift($order),
            );

            $order->update([
                'gift_card_id' => $card->id,
                'gift_card_discount_laar' => $discountLaar,
            ]);

            $order = $calc->recalculateAndPersist($order->fresh());

            $this->audit->log(
                'gift_card.applied',
                'Order',
                $order->id,
                [],
                ['gift_card_id' => $card->id, 'discount_laar' => $discountLaar],
                ['masked_code' => $card->masked_code, 'source' => 'pos'],
                $request,
            );

            return response()->json([
                'discount_laar' => $discountLaar,
                'discount_mvr' => number_format($discountLaar / 100, 2),
                'card_balance' => (float) $card->current_balance,
                'available_balance' => round($availableLaar / 100, 2),
                'masked_code' => $card->masked_code,
                'order' => [
                    'id' => (int) $order->id,
                    'total' => (float) $order->total,
                    'subtotal' => (float) $order->subtotal,
                    'tax_amount' => (float) $order->tax_amount,
                    'gift_card_discount_laar' => (int) $order->gift_card_discount_laar,
                    'gift_card_masked' => $card->masked_code,
                ],
            ]);
        });
    }

    public function staffRemoveFromOrder(Request $request, int $orderId, OrderTotalsCalculator $calc): JsonResponse
    {
        if (!$request->user()?->tokenCan('staff')) {
            return response()->json(['message' => 'Forbidden - staff access only'], 403);
        }
        if (!$request->user()->hasPermission('promotions.discounts')) {
            return response()->json(['message' => 'You do not have permission to apply discounts.'], 403);
        }

        $order = Order::query()
            ->whereIn('status', GiftCardRedemptionService::RESERVING_STATUSES)
            ->findOrFail($orderId);

        $previousCardId = $order->gift_card_id;
        $previousDiscount = (int) $order->gift_card_discount_laar;

        $order->update(['gift_card_id' => null, 'gift_card_discount_laar' => 0]);
        $calc->recalculateAndPersist($order->fresh());

        $this->audit->log(
            'gift_card.removed',
            'Order',
            $order->id,
            ['gift_card_id' => $previousCardId, 'gift_card_discount_laar' => $previousDiscount],
            ['gift_card_id' => null, 'gift_card_discount_laar' => 0],
            ['source' => 'pos'],
            $request,
        );

        return response()->json(['message' => 'Gift card removed.']);
    }

    // ── Admin: issue a gift card ──────────────────────────────────────────────

    public function issue(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'amount' => ['required', 'numeric', 'min:1', 'max:5000'],
            'customer_id' => ['nullable', 'integer', 'exists:customers,id'],
            'expires_at' => ['nullable', 'date'],
            'send_sms' => ['sometimes', 'boolean'],
            'recipient_phone' => [
                Rule::requiredIf(fn () => $request->boolean('send_sms') && !$request->filled('customer_id')),
                'nullable',
                'string',
                'max:20',
                new MaldivesPhone,
            ],
            'sms_note' => ['nullable', 'string', 'max:160'],
            'send_email' => ['sometimes', 'boolean'],
            'recipient_email' => [
                Rule::requiredIf(fn () => $request->boolean('send_email') && !$request->filled('customer_id')),
                'nullable',
                'email',
                'max:200',
            ],
            'email_note' => ['nullable', 'string', 'max:500'],
        ]);

        try {
            $issued = $this->giftCardIssue->issue([
                'amount' => $validated['amount'],
                'issued_to_customer_id' => $validated['customer_id'] ?? null,
                'purchased_by_customer_id' => null,
                'expires_at' => $validated['expires_at'] ?? null,
            ]);
        } catch (\RuntimeException) {
            return response()->json(['message' => 'Could not generate a unique gift card code. Please try again.'], 500);
        }

        $card = $issued['card'];
        $plain = $issued['plain'];

        $this->audit->log(
            'gift_card.issued',
            'GiftCard',
            $card->id,
            [],
            [
                'initial_balance' => (float) $card->initial_balance,
                'issued_to_customer_id' => $card->issued_to_customer_id,
                'expires_at' => $card->expires_at?->toDateString(),
            ],
            ['masked_code' => $card->masked_code],
            $request,
        );

        $smsResult = null;
        if ($request->boolean('send_sms')) {
            $phone = $validated['recipient_phone'] ?? null;
            if (!$phone && !empty($validated['customer_id'])) {
                $phone = Customer::query()->where('id', $validated['customer_id'])->value('phone');
            }
            if (!$phone) {
                $smsResult = [
                    'ok' => false,
                    'phone' => null,
                    'error' => 'No recipient phone — SMS not sent. Copy the code and send manually.',
                ];
            } else {
                $sent = $this->giftCardSms->send(
                    $card,
                    $plain,
                    $phone,
                    $validated['sms_note'] ?? null,
                    $validated['customer_id'] ?? null,
                );
                $smsResult = [
                    'ok' => $sent['ok'],
                    'phone' => $sent['phone'],
                    'error' => $sent['error'],
                ];
                $this->audit->log(
                    $sent['ok'] ? 'gift_card.sms_sent' : 'gift_card.sms_failed',
                    'GiftCard',
                    $card->id,
                    [],
                    ['phone' => $sent['phone'], 'error' => $sent['error']],
                    ['masked_code' => $card->masked_code],
                    $request,
                );
            }
        }

        $emailResult = null;
        if ($request->boolean('send_email')) {
            $email = $validated['recipient_email'] ?? null;
            if (!$email && !empty($validated['customer_id'])) {
                $email = Customer::query()->where('id', $validated['customer_id'])->value('email');
            }
            if (!$email) {
                $emailResult = [
                    'ok' => false,
                    'email' => null,
                    'error' => 'No recipient email — email not sent. Copy the code and send manually.',
                ];
            } else {
                $sent = $this->giftCardEmail->send(
                    $card,
                    $plain,
                    $email,
                    $validated['email_note'] ?? $validated['sms_note'] ?? null,
                );
                $emailResult = [
                    'ok' => $sent['ok'],
                    'email' => $sent['email'],
                    'error' => $sent['error'],
                ];
                $this->audit->log(
                    $sent['ok'] ? 'gift_card.email_sent' : 'gift_card.email_failed',
                    'GiftCard',
                    $card->id,
                    [],
                    ['email' => $sent['email'], 'error' => $sent['error']],
                    ['masked_code' => $card->masked_code],
                    $request,
                );
            }
        }

        return response()->json([
            'gift_card' => array_merge($this->format($card), ['code' => $plain]),
            'sms' => $smsResult,
            'email' => $emailResult,
        ], 201);
    }

    /**
     * Customer: buy a gift card — creates a payable gift_card order and returns BML URL.
     */
    public function purchase(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'amount' => ['required', 'numeric', 'min:' . GiftCardPurchaseService::MIN_AMOUNT, 'max:' . GiftCardPurchaseService::MAX_AMOUNT],
            'recipient_phone' => ['nullable', 'string', 'max:20', new MaldivesPhone],
            'recipient_email' => ['nullable', 'email', 'max:200'],
            'personal_note' => ['nullable', 'string', 'max:500'],
        ]);

        /** @var Customer $customer */
        $customer = $request->user();

        try {
            $result = $this->giftCardPurchase->start($customer, $validated);
        } catch (\InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        } catch (\RuntimeException $e) {
            return response()->json([
                'message' => 'Payment gateway unavailable. Please try again in a moment.',
                'code' => 'gateway_error',
            ], 503);
        }

        return response()->json([
            'order_id' => $result['order']->id,
            'order_number' => $result['order']->order_number,
            'payment_url' => $result['payment_url'],
            'payment_id' => $result['payment_id'],
            'amount' => (float) $result['purchase']->amount,
        ], 201);
    }

    /**
     * Customer: poll purchase status after BML return (never returns plaintext code).
     */
    public function purchaseStatus(Request $request, int $orderId): JsonResponse
    {
        /** @var Customer $customer */
        $customer = $request->user();

        $order = Order::query()
            ->where('id', $orderId)
            ->where('customer_id', $customer->id)
            ->where('type', 'gift_card')
            ->firstOrFail();

        $purchase = GiftCardPurchase::query()
            ->with('giftCard:id,code_last4,initial_balance,current_balance,status,expires_at')
            ->where('order_id', $order->id)
            ->first();

        // Recovery 1: BML charged the customer but return-URL / webhook never marked us paid.
        // Ask BML again; only confirm when gateway state is CONFIRMED.
        $paid = $order->paid_at !== null
            || $order->payment_status === 'paid'
            || in_array($order->status, ['paid', 'completed'], true);
        if (!$paid) {
            try {
                $paid = app(PaymentService::class)->reconcilePendingBmlPayment($order);
            } catch (\Throwable) {
                // Leave unpaid; client keeps polling / shows still-processing.
            }
            $order->refresh();
        }

        // Recovery 2: issue if missing; re-deliver / one-time reissue only when
        // we cannot already show/resend the plaintext (avoids hammering SMS).
        if ($paid && $purchase) {
            $deliveryAlreadyOk = $purchase->sms_ok === true || $purchase->email_ok === true;
            $canShowOrResend = $this->deliveryWindow->canResend($purchase);
            $needsFulfill = !$purchase->gift_card_id
                || (!$deliveryAlreadyOk && !$canShowOrResend);

            if ($needsFulfill) {
                try {
                    app(GiftCardPurchaseFulfillmentService::class)->fulfill($order->fresh() ?? $order);
                } catch (\Throwable $e) {
                    Log::warning('Gift card purchaseStatus fulfill failed', [
                        'order_id' => $order->id,
                        'error' => $e->getMessage(),
                    ]);
                }
                $purchase = GiftCardPurchase::query()
                    ->with('giftCard:id,code_last4,initial_balance,current_balance,status,expires_at')
                    ->where('order_id', $order->id)
                    ->first();
                $order->refresh();
            }
        }

        $card = $purchase?->giftCard;
        $canResend = $purchase ? $this->deliveryWindow->canResend($purchase) : false;
        $deliveryOk = $purchase
            && ($purchase->sms_ok === true || $purchase->email_ok === true);

        // If SMS/email both failed, show the full code to the authenticated buyer
        // while the 48h delivery window is open — otherwise they are stuck.
        $revealCode = null;
        if ($purchase && $card && $canResend && !$deliveryOk) {
            $revealCode = $this->deliveryWindow->plainCode($purchase);
        }

        return response()->json([
            'order_id' => $order->id,
            'order_number' => $order->order_number,
            'status' => $order->status,
            'payment_status' => $order->payment_status,
            'amount' => (float) ($purchase?->amount ?? $order->total),
            'issued' => $card !== null,
            'gift_card' => $card ? [
                'masked_code' => $card->masked_code,
                'initial_balance' => (float) $card->initial_balance,
                'current_balance' => (float) $card->current_balance,
                'status' => $card->status,
                'expires_at' => $card->expires_at?->toDateString(),
            ] : null,
            // Only present when delivery failed and window is open — never after successful send.
            'code' => $revealCode,
            'delivery' => [
                'phone' => $purchase?->recipient_phone,
                'email' => $purchase?->recipient_email,
                'sms_ok' => $purchase?->sms_ok,
                'email_ok' => $purchase?->email_ok,
                'can_resend' => $canResend,
                'resend_count' => (int) ($purchase?->resend_count ?? 0),
                'expires_at' => $purchase?->code_delivery_expires_at?->toIso8601String(),
            ],
        ]);
    }

    /**
     * Customer: resend purchase delivery to the original phone/email only.
     * Uses a short-lived encrypted cache of the plaintext (never returned in JSON).
     */
    public function resendPurchaseDelivery(Request $request, int $orderId): JsonResponse
    {
        /** @var Customer $customer */
        $customer = $request->user();

        $validated = $request->validate([
            'channel' => ['sometimes', 'string', 'in:sms,email,both'],
        ]);
        $channel = $validated['channel'] ?? 'both';

        $order = Order::query()
            ->where('id', $orderId)
            ->where('customer_id', $customer->id)
            ->where('type', 'gift_card')
            ->firstOrFail();

        $purchase = GiftCardPurchase::query()
            ->with('giftCard')
            ->where('order_id', $order->id)
            ->where('purchaser_customer_id', $customer->id)
            ->firstOrFail();

        if (!$purchase->gift_card_id || !$purchase->giftCard) {
            return response()->json(['message' => 'Gift card has not been issued yet.'], 422);
        }

        $resendCount = (int) ($purchase->resend_count ?? 0);
        if ($resendCount >= GiftCardPurchaseDeliveryWindow::MAX_RESENDS) {
            return response()->json([
                'message' => 'Resend limit reached. Contact the restaurant with your order number.',
            ], 429);
        }

        $plain = $this->deliveryWindow->plainCode($purchase);
        if ($plain === null) {
            return response()->json([
                'message' => 'Delivery window expired. Contact the restaurant with your order number.',
            ], 410);
        }

        $wantSms = in_array($channel, ['sms', 'both'], true) && (bool) $purchase->recipient_phone;
        $wantEmail = in_array($channel, ['email', 'both'], true) && (bool) $purchase->recipient_email;

        if (!$wantSms && !$wantEmail) {
            return response()->json([
                'message' => 'No delivery channel available for this purchase.',
                'code' => $plain,
            ], 422);
        }

        $card = $purchase->giftCard;
        $note = $purchase->personal_note;
        $smsOk = $purchase->sms_ok === true;
        $emailOk = $purchase->email_ok === true;
        $resendN = $resendCount + 1;
        $errors = [];
        $viewUrl = null;

        try {
            $this->deliveryWindow->store($purchase, $plain);
            $purchase->refresh();
            $viewUrl = $this->deliveryWindow->viewUrl($purchase);
        } catch (\Throwable $e) {
            Log::warning('Gift card resend: could not refresh delivery window', [
                'order_id' => $orderId,
                'error' => $e->getMessage(),
            ]);
        }

        try {
            if ($wantSms) {
                $sent = $this->giftCardSms->send(
                    $card,
                    $plain,
                    (string) $purchase->recipient_phone,
                    $note,
                    $purchase->purchaser_customer_id,
                    'gift_card_resend:' . $purchase->id . ':sms:' . $resendN,
                    $viewUrl,
                );
                $smsOk = (bool) $sent['ok'];
                if (!$smsOk) {
                    $errors[] = 'SMS: ' . ($sent['error'] ?? 'failed');
                }
            }

            if ($wantEmail) {
                $sent = $this->giftCardEmail->send(
                    $card,
                    $plain,
                    (string) $purchase->recipient_email,
                    $note,
                );
                $emailOk = (bool) $sent['ok'];
                if (!$emailOk) {
                    $errors[] = 'Email: ' . ($sent['error'] ?? 'failed');
                }
            }

            $updates = [];
            if (Schema::hasColumn('gift_card_purchases', 'sms_ok')) {
                $updates['sms_ok'] = $smsOk;
            }
            if (Schema::hasColumn('gift_card_purchases', 'email_ok')) {
                $updates['email_ok'] = $emailOk;
            }
            if (Schema::hasColumn('gift_card_purchases', 'resend_count')) {
                $updates['resend_count'] = $resendN;
            }
            if (Schema::hasColumn('gift_card_purchases', 'last_resent_at')) {
                $updates['last_resent_at'] = now();
            }
            if ($updates !== []) {
                try {
                    $purchase->update($updates);
                    $purchase->refresh();
                } catch (\Throwable $e) {
                    Log::warning('Gift card resend: could not persist delivery flags', [
                        'order_id' => $orderId,
                        'error' => $e->getMessage(),
                    ]);
                }
            }
        } catch (\Throwable $e) {
            Log::error('Gift card resend failed', [
                'order_id' => $orderId,
                'error' => $e->getMessage(),
                'class' => $e::class,
            ]);

            return response()->json([
                'message' => 'Could not resend SMS/email right now. Your code is below — copy and save it.',
                'code' => $plain,
                'delivery' => [
                    'phone' => $purchase->recipient_phone,
                    'email' => $purchase->recipient_email,
                    'sms_ok' => $purchase->sms_ok,
                    'email_ok' => $purchase->email_ok,
                    'can_resend' => true,
                    'resend_count' => $resendCount,
                    'expires_at' => $purchase->code_delivery_expires_at?->toIso8601String(),
                ],
            ], 422);
        }

        $deliveryOk = $smsOk === true || $emailOk === true;

        return response()->json([
            'message' => $deliveryOk
                ? 'Delivery resent. Check your phone/email.'
                : ('Could not deliver: ' . implode(' · ', $errors) . ' — your code is below.'),
            'code' => $deliveryOk ? null : $plain,
            'delivery' => [
                'phone' => $purchase->recipient_phone,
                'email' => $purchase->recipient_email,
                'sms_ok' => $smsOk,
                'email_ok' => $emailOk,
                'can_resend' => $this->deliveryWindow->canResend($purchase->fresh() ?? $purchase),
                'resend_count' => (int) ($purchase->resend_count ?? $resendN),
                'expires_at' => $purchase->code_delivery_expires_at?->toIso8601String(),
            ],
        ], $deliveryOk ? 200 : 422);
    }

    /**
     * Send gift-card SMS while staff still has the plaintext code (issue modal).
     * Body must include the full code — we never store it after issue.
     */
    public function sendSms(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'code' => ['required', 'string', 'max:32'],
            'recipient_phone' => ['required', 'string', 'max:20', new MaldivesPhone],
            'sms_note' => ['nullable', 'string', 'max:160'],
        ]);

        $card = $this->giftCardCodes->findByCode($validated['code']);
        if (!$card || $card->status !== 'active') {
            return response()->json(['message' => 'Invalid or inactive gift card code.'], 422);
        }

        $sent = $this->giftCardSms->send(
            $card,
            $validated['code'],
            $validated['recipient_phone'],
            $validated['sms_note'] ?? null,
            $card->issued_to_customer_id,
        );

        $this->audit->log(
            $sent['ok'] ? 'gift_card.sms_sent' : 'gift_card.sms_failed',
            'GiftCard',
            $card->id,
            [],
            ['phone' => $sent['phone'], 'error' => $sent['error']],
            ['masked_code' => $card->masked_code],
            $request,
        );

        if (!$sent['ok']) {
            return response()->json(['message' => $sent['error'] ?? 'SMS send failed.', 'sms' => $sent], 422);
        }

        return response()->json([
            'message' => 'Gift card SMS sent.',
            'sms' => $sent,
        ]);
    }

    /**
     * Send gift-card email while staff still has the plaintext code (issue modal).
     * Body must include the full code — we never store it after issue.
     */
    public function sendEmail(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'code' => ['required', 'string', 'max:32'],
            'recipient_email' => ['required', 'email', 'max:200'],
            'email_note' => ['nullable', 'string', 'max:500'],
        ]);

        $card = $this->giftCardCodes->findByCode($validated['code']);
        if (!$card || $card->status !== 'active') {
            return response()->json(['message' => 'Invalid or inactive gift card code.'], 422);
        }

        $sent = $this->giftCardEmail->send(
            $card,
            $validated['code'],
            $validated['recipient_email'],
            $validated['email_note'] ?? null,
        );

        $this->audit->log(
            $sent['ok'] ? 'gift_card.email_sent' : 'gift_card.email_failed',
            'GiftCard',
            $card->id,
            [],
            ['email' => $sent['email'], 'error' => $sent['error']],
            ['masked_code' => $card->masked_code],
            $request,
        );

        if (!$sent['ok']) {
            return response()->json(['message' => $sent['error'] ?? 'Email send failed.', 'email' => $sent], 422);
        }

        return response()->json([
            'message' => 'Gift card email sent.',
            'email' => $sent,
        ]);
    }

    // ── Admin: list gift cards ────────────────────────────────────────────────

    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'page' => ['sometimes', 'integer', 'min:1'],
            'status' => ['sometimes', 'nullable', 'string', 'in:active,depleted,expired,cancelled'],
            'q' => ['sometimes', 'nullable', 'string', 'max:64'],
        ]);

        $query = GiftCard::with([
            'issuedTo:id,name,phone',
            'purchasedBy:id,name,phone',
        ])->orderByDesc('created_at');

        if (!empty($validated['status'])) {
            $query->where('status', $validated['status']);
        }

        if (!empty($validated['q'])) {
            $q = trim($validated['q']);
            $last4 = strtoupper(substr(preg_replace('/[\s\-]+/', '', $q) ?? '', -4));
            $query->where(function ($builder) use ($q, $last4) {
                $builder->where('code_last4', $last4);
                if (is_numeric($q)) {
                    $builder->orWhere('id', (int) $q);
                }
                $builder->orWhereHas('issuedTo', function ($c) use ($q) {
                    $c->where('name', 'like', '%' . $q . '%')
                        ->orWhere('phone', 'like', '%' . $q . '%');
                });
                $builder->orWhereHas('purchasedBy', function ($c) use ($q) {
                    $c->where('name', 'like', '%' . $q . '%')
                        ->orWhere('phone', 'like', '%' . $q . '%');
                });
            });
        }

        $cards = $query->paginate(20);
        $items = collect($cards->items());
        $heldByCard = $this->giftCardRedemption->reservedLaarByCardIds(
            $items->pluck('id')->map(fn ($id) => (int) $id)->all(),
        );

        return response()->json([
            'data' => $items->map(fn ($c) => $this->format($c, $heldByCard[(int) $c->id] ?? 0)),
            'meta' => [
                'current_page' => $cards->currentPage(),
                'last_page' => $cards->lastPage(),
                'total' => $cards->total(),
                'active_count' => GiftCard::where('status', 'active')->count(),
                'active_balance' => (float) GiftCard::where('status', 'active')->sum('current_balance'),
            ],
        ]);
    }

    // ── Admin: cancel a gift card ─────────────────────────────────────────────

    public function cancel(Request $request, int $id, OrderTotalsCalculator $calc): JsonResponse
    {
        $card = GiftCard::findOrFail($id);

        if ($card->status === 'cancelled') {
            return response()->json(['message' => 'Gift card is already cancelled.'], 422);
        }
        if ($card->status === 'depleted') {
            return response()->json(['message' => 'Depleted gift cards cannot be cancelled.'], 422);
        }

        $previous = $card->status;
        $releasedOrderIds = [];

        DB::transaction(function () use ($card, $calc, &$releasedOrderIds): void {
            $releasedOrderIds = $this->giftCardRedemption->clearSoftReserves($card);
            foreach ($releasedOrderIds as $orderId) {
                $order = Order::query()->find($orderId);
                if ($order) {
                    $calc->recalculateAndPersist($order);
                }
            }
            $card->update(['status' => 'cancelled']);
        });

        $this->audit->log(
            'gift_card.cancelled',
            'GiftCard',
            $card->id,
            ['status' => $previous],
            ['status' => 'cancelled', 'released_orders' => $releasedOrderIds],
            ['masked_code' => $card->masked_code],
            $request,
        );

        $fresh = $card->fresh(['issuedTo', 'purchasedBy']);

        return response()->json([
            'gift_card' => $this->format($fresh, 0),
            'released_orders' => $releasedOrderIds,
        ]);
    }

    // ── Admin: top-up balance ─────────────────────────────────────────────────

    public function topUp(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'amount' => ['required', 'numeric', 'min:1', 'max:5000'],
        ]);

        return DB::transaction(function () use ($request, $validated, $id): JsonResponse {
            /** @var GiftCard|null $card */
            $card = GiftCard::query()->lockForUpdate()->find($id);
            if (!$card) {
                return response()->json(['message' => 'Gift card not found.'], 404);
            }

            if ($card->status === 'cancelled') {
                return response()->json(['message' => 'Cancelled gift cards cannot be topped up.'], 422);
            }

            $amount = round((float) $validated['amount'], 2);
            $newBalance = round((float) $card->current_balance + $amount, 2);
            $newInitial = round((float) $card->initial_balance + $amount, 2);

            $status = $card->status;
            if ($status === 'depleted' || $status === 'expired') {
                $stillExpired = $card->expires_at && $card->expires_at->isPast();
                $status = $stillExpired ? 'expired' : 'active';
            }

            $card->update([
                'current_balance' => $newBalance,
                'initial_balance' => $newInitial,
                'status' => $status,
            ]);

            GiftCardTransaction::create([
                'gift_card_id' => $card->id,
                'amount' => $amount,
                'type' => 'load',
                'balance_after' => $newBalance,
            ]);

            $this->audit->log(
                'gift_card.topped_up',
                'GiftCard',
                $card->id,
                [],
                ['amount' => $amount, 'balance_after' => $newBalance, 'status' => $status],
                ['masked_code' => $card->masked_code],
                $request,
            );

            return response()->json([
                'gift_card' => $this->format($card->fresh(['issuedTo', 'purchasedBy'])),
            ]);
        });
    }

    // ── Admin: extend / clear expiry ──────────────────────────────────────────

    public function extendExpiry(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'expires_at' => ['nullable', 'date', 'after_or_equal:today'],
        ]);

        $card = GiftCard::findOrFail($id);

        if ($card->status === 'cancelled') {
            return response()->json(['message' => 'Cancelled gift cards cannot be updated.'], 422);
        }

        $previousExpiry = $card->expires_at?->toDateString();
        $previousStatus = $card->status;
        $expiresAt = $validated['expires_at'] ?? null;

        $status = $card->status;
        if ($status === 'expired') {
            $status = ((float) $card->current_balance > 0) ? 'active' : 'depleted';
        }

        $card->update([
            'expires_at' => $expiresAt,
            'status' => $status,
        ]);

        $this->audit->log(
            'gift_card.expiry_updated',
            'GiftCard',
            $card->id,
            ['expires_at' => $previousExpiry, 'status' => $previousStatus],
            ['expires_at' => $expiresAt, 'status' => $status],
            ['masked_code' => $card->masked_code],
            $request,
        );

        return response()->json([
            'gift_card' => $this->format($card->fresh(['issuedTo', 'purchasedBy'])),
        ]);
    }

    // ── Admin: transaction ledger ─────────────────────────────────────────────

    public function transactions(int $id): JsonResponse
    {
        $card = GiftCard::with(['issuedTo:id,name,phone', 'purchasedBy:id,name,phone'])->findOrFail($id);

        $rows = GiftCardTransaction::where('gift_card_id', $card->id)
            ->orderByDesc('created_at')
            ->limit(100)
            ->get()
            ->map(fn (GiftCardTransaction $t) => [
                'id' => $t->id,
                'type' => $t->type,
                'amount' => (float) $t->amount,
                'balance_after' => (float) $t->balance_after,
                'order_id' => $t->order_id,
                'created_at' => $t->created_at?->toIso8601String(),
            ]);

        return response()->json([
            'gift_card' => $this->format($card),
            'transactions' => $rows,
        ]);
    }

    private function format(GiftCard $c, ?int $heldLaar = null): array
    {
        $held = $heldLaar ?? $this->giftCardRedemption->reservedLaar($c);
        $available = max(0, $c->balanceLaar() - $held);

        return [
            'id' => $c->id,
            'masked_code' => $c->masked_code,
            'initial_balance' => (float) $c->initial_balance,
            'current_balance' => (float) $c->current_balance,
            'available_balance' => round($available / 100, 2),
            'held_balance' => round($held / 100, 2),
            'status' => $c->status,
            'expires_at' => $c->expires_at?->toDateString(),
            'created_at' => $c->created_at?->toIso8601String(),
            'issued_to' => $c->issuedTo ? ['id' => $c->issuedTo->id, 'name' => $c->issuedTo->name] : null,
            'purchased_by' => $c->purchasedBy ? ['id' => $c->purchasedBy->id, 'name' => $c->purchasedBy->name] : null,
        ];
    }
}

<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Orders\Services\OrderTotalsCalculator;
use App\Domains\Orders\Support\EffectiveDiscount;
use App\Domains\Payments\Services\GiftCardCodeService;
use App\Domains\Payments\Services\GiftCardEmailDelivery;
use App\Domains\Payments\Services\GiftCardRedemptionService;
use App\Domains\Payments\Services\GiftCardSmsDelivery;
use App\Models\Customer;
use App\Models\GiftCard;
use App\Models\GiftCardTransaction;
use App\Models\Order;
use App\Rules\MaldivesPhone;
use App\Services\AuditLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class GiftCardController extends Controller
{
    public function __construct(
        private readonly GiftCardCodeService $giftCardCodes,
        private readonly GiftCardSmsDelivery $giftCardSms,
        private readonly GiftCardEmailDelivery $giftCardEmail,
        private readonly GiftCardRedemptionService $giftCardRedemption,
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

        return response()->json([
            'masked_code' => $card->masked_code,
            'current_balance' => (float) $card->current_balance,
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
            ->whereIn('status', ['payment_pending', 'pending'])
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
            ->whereIn('status', ['payment_pending', 'pending'])
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
            'amount' => ['required', 'numeric', 'min:1'],
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
            $generated = $this->giftCardCodes->generate();
        } catch (\RuntimeException) {
            return response()->json(['message' => 'Could not generate a unique gift card code. Please try again.'], 500);
        }

        $card = GiftCard::create([
            'code_hash' => $generated['hash'],
            'code_last4' => $generated['last4'],
            'initial_balance' => $validated['amount'],
            'current_balance' => $validated['amount'],
            'issued_to_customer_id' => $validated['customer_id'] ?? null,
            'purchased_by_customer_id' => null,
            'status' => 'active',
            'expires_at' => $validated['expires_at'] ?? null,
        ]);

        GiftCardTransaction::create([
            'gift_card_id' => $card->id,
            'amount' => $validated['amount'],
            'type' => 'load',
            'balance_after' => $validated['amount'],
        ]);

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
                    $generated['plain'],
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
                    $generated['plain'],
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
            'gift_card' => array_merge($this->format($card), ['code' => $generated['plain']]),
            'sms' => $smsResult,
            'email' => $emailResult,
        ], 201);
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

        $query = GiftCard::with('issuedTo:id,name,phone')->orderByDesc('created_at');

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
            });
        }

        $cards = $query->paginate(20);

        return response()->json([
            'data' => collect($cards->items())->map(fn ($c) => $this->format($c)),
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

    public function cancel(Request $request, int $id): JsonResponse
    {
        $card = GiftCard::findOrFail($id);

        if ($card->status === 'cancelled') {
            return response()->json(['message' => 'Gift card is already cancelled.'], 422);
        }
        if ($card->status === 'depleted') {
            return response()->json(['message' => 'Depleted gift cards cannot be cancelled.'], 422);
        }

        $previous = $card->status;
        $card->update(['status' => 'cancelled']);

        $this->audit->log(
            'gift_card.cancelled',
            'GiftCard',
            $card->id,
            ['status' => $previous],
            ['status' => 'cancelled'],
            ['masked_code' => $card->masked_code],
            $request,
        );

        return response()->json(['gift_card' => $this->format($card->fresh('issuedTo'))]);
    }

    // ── Admin: transaction ledger ─────────────────────────────────────────────

    public function transactions(int $id): JsonResponse
    {
        $card = GiftCard::with('issuedTo:id,name,phone')->findOrFail($id);

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

    private function format(GiftCard $c): array
    {
        return [
            'id' => $c->id,
            'masked_code' => $c->masked_code,
            'initial_balance' => (float) $c->initial_balance,
            'current_balance' => (float) $c->current_balance,
            'status' => $c->status,
            'expires_at' => $c->expires_at?->toDateString(),
            'created_at' => $c->created_at?->toIso8601String(),
            'issued_to' => $c->issuedTo ? ['id' => $c->issuedTo->id, 'name' => $c->issuedTo->name] : null,
        ];
    }
}

<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Orders\Services\OrderTotalsCalculator;
use App\Domains\Orders\Support\EffectiveDiscount;
use App\Domains\Payments\Services\GiftCardCodeService;
use App\Models\GiftCard;
use App\Models\GiftCardTransaction;
use App\Models\Order;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

class GiftCardController extends Controller
{
    public function __construct(
        private readonly GiftCardCodeService $giftCardCodes,
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

            $discountLaar = min(
                $card->balanceLaar(),
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

        return DB::transaction(function () use ($validated, $order, $calc): JsonResponse {
            $card = $this->giftCardCodes->findActiveByCodeForUpdate($validated['code']);

            if (!$card) {
                return response()->json(['message' => 'Invalid or unavailable gift card.'], 422);
            }
            if ($card->expires_at && $card->expires_at->isPast()) {
                $card->update(['status' => 'expired']);

                return response()->json(['message' => 'This gift card has expired.'], 422);
            }

            $discountLaar = min(
                $card->balanceLaar(),
                EffectiveDiscount::remainingPreTaxBeforeGift($order),
            );

            $order->update([
                'gift_card_id' => $card->id,
                'gift_card_discount_laar' => $discountLaar,
            ]);

            $order = $calc->recalculateAndPersist($order->fresh());

            return response()->json([
                'discount_laar' => $discountLaar,
                'discount_mvr' => number_format($discountLaar / 100, 2),
                'card_balance' => (float) $card->current_balance,
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

        $order->update(['gift_card_id' => null, 'gift_card_discount_laar' => 0]);
        $calc->recalculateAndPersist($order->fresh());

        return response()->json(['message' => 'Gift card removed.']);
    }

    // ── Admin: issue a gift card ──────────────────────────────────────────────

    public function issue(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'amount' => ['required', 'numeric', 'min:1'],
            'customer_id' => ['nullable', 'integer', 'exists:customers,id'],
            'expires_at' => ['nullable', 'date'],
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

        return response()->json([
            'gift_card' => array_merge($this->format($card), ['code' => $generated['plain']]),
        ], 201);
    }

    // ── Admin: list gift cards ────────────────────────────────────────────────

    public function index(): JsonResponse
    {
        $cards = GiftCard::with('issuedTo:id,name,phone')
            ->orderByDesc('created_at')
            ->paginate(20);

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

    private function format(GiftCard $c): array
    {
        return [
            'id' => $c->id,
            'masked_code' => $c->masked_code,
            'initial_balance' => (float) $c->initial_balance,
            'current_balance' => (float) $c->current_balance,
            'status' => $c->status,
            'expires_at' => $c->expires_at?->toDateString(),
            'issued_to' => $c->issuedTo ? ['id' => $c->issuedTo->id, 'name' => $c->issuedTo->name] : null,
        ];
    }
}

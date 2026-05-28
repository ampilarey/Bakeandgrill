<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Orders\Services\OrderTotalsCalculator;
use App\Models\GiftCard;
use App\Models\GiftCardTransaction;
use App\Models\Order;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class GiftCardController extends Controller
{
    // ── Public: check balance ─────────────────────────────────────────────────

    public function balance(string $code): JsonResponse
    {
        $card = GiftCard::where('code', strtoupper($code))->first();

        // Return a generic 404 for both not-found and non-active cards to prevent
        // enumeration attacks that could reveal card status from error messages.
        if (!$card || $card->status !== 'active') {
            return response()->json(['error' => 'Invalid or unavailable gift card.'], 404);
        }

        if ($card->expires_at && $card->expires_at->isPast()) {
            $card->update(['status' => 'expired']);

            return response()->json(['error' => 'Invalid or unavailable gift card.'], 404);
        }

        return response()->json([
            'code' => $card->code,
            'current_balance' => (float) $card->current_balance,
            'expires_at' => $card->expires_at?->toDateString(),
        ]);
    }

    // ── Customer: apply gift card to order ───────────────────────────────────

    public function applyToOrder(Request $request, int $orderId, OrderTotalsCalculator $calc): JsonResponse
    {
        $validated = $request->validate(['code' => ['required', 'string', 'max:20']]);

        $order = Order::where('id', $orderId)
            ->where('customer_id', $request->user()->id)
            ->whereIn('status', ['payment_pending', 'pending'])
            ->firstOrFail();

        return DB::transaction(function () use ($validated, $order, $calc): JsonResponse {
            $card = GiftCard::where('code', strtoupper($validated['code']))
                ->where('status', 'active')
                ->lockForUpdate()
                ->first();

            if (!$card) {
                return response()->json(['message' => 'Invalid or unavailable gift card.'], 422);
            }

            if ($card->expires_at && $card->expires_at->isPast()) {
                $card->update(['status' => 'expired']);

                return response()->json(['message' => 'This gift card has expired.'], 422);
            }

            // Apply up to the current order total_laar (which already reflects all
            // previously-applied discounts: promo, loyalty, referral).
            // Using the gross subtotal_laar would let the card over-commit its balance
            // when stacked with other discounts.
            $maxDiscount = (int) round((float) $card->current_balance * 100);
            $currentDueLaar = (int) ($order->total_laar ?? round((float) $order->total * 100));
            $discountLaar = min($maxDiscount, max(0, $currentDueLaar));

            $order->update([
                'gift_card_code' => $card->code,
                'gift_card_discount_laar' => $discountLaar,
            ]);

            $calc->recalculateAndPersist($order->fresh());

            return response()->json([
                'discount_laar' => $discountLaar,
                'discount_mvr' => number_format($discountLaar / 100, 2),
                'card_balance' => (float) $card->current_balance,
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

        $order->update(['gift_card_code' => null, 'gift_card_discount_laar' => 0]);
        $calc->recalculateAndPersist($order->fresh());

        return response()->json(['message' => 'Gift card removed.']);
    }

    // ── Staff POS: apply / remove gift card on a staff-rung order ─────────────
    //
    // Mirror of `applyToOrder` / `removeFromOrder` for the cashier flow.
    // The customer-facing methods above are gated by `customer.token` and
    // resolve the customer from the auth context — wrong for a POS register
    // where the cashier is the actor and the order's `customer_id` (set when
    // the cashier attached the customer to the ticket) identifies the
    // subject. We keep the customer-facing methods untouched and add
    // staff twins that:
    //   - Require staff Sanctum token with `promotions.discounts` permission
    //     (same one already required to apply a manual promo at POS).
    //   - Use the SAME PaymentService::redeemGiftCardForOrder() debit logic
    //     so balances and transaction records match across channels.
    //   - Accept POS-rung orders (created via OrderController@store, which
    //     starts in `pending`) as well as the `payment_pending` state used
    //     by online orders, so a cashier can also redeem a card on a held
    //     ticket they're about to charge.

    public function staffApplyToOrder(Request $request, int $orderId, OrderTotalsCalculator $calc): JsonResponse
    {
        if (!$request->user()?->tokenCan('staff')) {
            return response()->json(['message' => 'Forbidden - staff access only'], 403);
        }
        if (!$request->user()->hasPermission('promotions.discounts')) {
            return response()->json(['message' => 'You do not have permission to apply discounts.'], 403);
        }

        $validated = $request->validate(['code' => ['required', 'string', 'max:20']]);

        $order = Order::query()
            ->whereIn('status', ['payment_pending', 'pending'])
            ->findOrFail($orderId);

        return DB::transaction(function () use ($validated, $order, $calc): JsonResponse {
            $card = GiftCard::where('code', strtoupper($validated['code']))
                ->where('status', 'active')
                ->lockForUpdate()
                ->first();

            if (!$card) {
                return response()->json(['message' => 'Invalid or unavailable gift card.'], 422);
            }
            if ($card->expires_at && $card->expires_at->isPast()) {
                $card->update(['status' => 'expired']);

                return response()->json(['message' => 'This gift card has expired.'], 422);
            }

            $maxDiscount = (int) round((float) $card->current_balance * 100);
            $currentDueLaar = (int) ($order->total_laar ?? round((float) $order->total * 100));
            $discountLaar = min($maxDiscount, max(0, $currentDueLaar));

            $order->update([
                'gift_card_code' => $card->code,
                'gift_card_discount_laar' => $discountLaar,
            ]);

            $order = $calc->recalculateAndPersist($order->fresh());

            return response()->json([
                'discount_laar' => $discountLaar,
                'discount_mvr' => number_format($discountLaar / 100, 2),
                'card_balance' => (float) $card->current_balance,
                'order' => [
                    'id' => (int) $order->id,
                    'total' => (float) $order->total,
                    'subtotal' => (float) $order->subtotal,
                    'tax_amount' => (float) $order->tax_amount,
                    'gift_card_discount_laar' => (int) $order->gift_card_discount_laar,
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

        $order->update(['gift_card_code' => null, 'gift_card_discount_laar' => 0]);
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

        $code = null;
        for ($attempt = 0; $attempt < 5; $attempt++) {
            $candidate = strtoupper(Str::random(4) . '-' . Str::random(4) . '-' . Str::random(4));
            if (!GiftCard::where('code', $candidate)->exists()) {
                $code = $candidate;
                break;
            }
        }
        if ($code === null) {
            return response()->json(['message' => 'Could not generate a unique gift card code. Please try again.'], 500);
        }

        $card = GiftCard::create([
            'code' => $code,
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

        return response()->json(['gift_card' => $this->format($card)], 201);
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
            'code' => $c->code,
            'initial_balance' => (float) $c->initial_balance,
            'current_balance' => (float) $c->current_balance,
            'status' => $c->status,
            'expires_at' => $c->expires_at?->toDateString(),
            'issued_to' => $c->issuedTo ? ['id' => $c->issuedTo->id, 'name' => $c->issuedTo->name] : null,
        ];
    }
}

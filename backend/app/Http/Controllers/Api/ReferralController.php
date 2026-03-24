<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Orders\Services\OrderTotalsCalculator;
use App\Models\Customer;
use App\Models\Order;
use App\Models\Referral;
use App\Models\ReferralCode;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Str;

class ReferralController extends Controller
{
    // ── Customer: get/generate own referral code ──────────────────────────────

    public function myCode(Request $request): JsonResponse
    {
        /** @var Customer $customer */
        $customer = $request->user();

        $code = ReferralCode::firstOrCreate(
            ['customer_id' => $customer->id],
            [
                'code'                 => strtoupper(Str::random(8)),
                'referrer_reward_mvr'  => config('loyalty.referral.referrer_reward_mvr'),
                'referee_discount_mvr' => config('loyalty.referral.referee_discount_mvr'),
                'is_active'            => true,
            ],
        );

        return response()->json([
            'code'                 => $code->code,
            'uses_count'           => $code->uses_count,
            'referrer_reward_mvr'  => (float) $code->referrer_reward_mvr,
            'referee_discount_mvr' => (float) $code->referee_discount_mvr,
        ]);
    }

    // ── Public: validate a referral code (pre-signup) ─────────────────────────

    public function validate(Request $request): JsonResponse
    {
        $validated = $request->validate(['code' => ['required', 'string', 'max:20']]);

        $code = ReferralCode::where('code', strtoupper($validated['code']))
            ->where('is_active', true)
            ->first();

        if (!$code) {
            return response()->json(['valid' => false, 'message' => 'Invalid or expired referral code.'], 422);
        }

        if ($code->max_uses && $code->uses_count >= $code->max_uses) {
            return response()->json(['valid' => false, 'message' => 'This referral code has reached its usage limit.'], 422);
        }

        return response()->json([
            'valid'                => true,
            'referee_discount_mvr' => (float) $code->referee_discount_mvr,
        ]);
    }

    // ── Customer: apply friend's referral code to an order ────────────────────

    public function applyToOrder(Request $request, int $orderId, OrderTotalsCalculator $calc): JsonResponse
    {
        $validated = $request->validate(['code' => ['required', 'string', 'max:24']]);

        /** @var Customer $customer */
        $customer = $request->user();

        $order = Order::with('items')
            ->where('id', $orderId)
            ->where('customer_id', $customer->id)
            ->whereIn('status', ['payment_pending', 'pending'])
            ->firstOrFail();

        $code = ReferralCode::where('code', strtoupper(trim($validated['code'])))
            ->where('is_active', true)
            ->first();

        if (!$code) {
            return response()->json(['message' => 'Invalid or expired referral code.'], 422);
        }

        if ((int) $code->customer_id === (int) $customer->id) {
            return response()->json(['message' => 'You cannot use your own referral code.'], 422);
        }

        if ($code->max_uses && $code->uses_count >= $code->max_uses) {
            return response()->json(['message' => 'This referral code has reached its usage limit.'], 422);
        }

        if (Referral::where('referral_code_id', $code->id)->where('referee_customer_id', $customer->id)->exists()) {
            return response()->json(['message' => 'You have already used this referral code.'], 422);
        }

        $subtotalLaar = 0;
        foreach ($order->items as $item) {
            $subtotalLaar += (int) round((float) $item->total_price * 100);
        }

        $otherLaar = (int) ($order->promo_discount_laar ?? 0)
            + (int) ($order->loyalty_discount_laar ?? 0)
            + (int) ($order->manual_discount_laar ?? 0)
            + (int) ($order->gift_card_discount_laar ?? 0);

        $roomLaar = max(0, $subtotalLaar - $otherLaar);
        $configuredLaar = (int) round((float) $code->referee_discount_mvr * 100);
        $referralLaar = min($configuredLaar, $roomLaar);

        if ($referralLaar <= 0) {
            return response()->json(['message' => 'No referral discount applies — other discounts already cover this order.'], 422);
        }

        $order->update([
            'referral_code'           => $code->code,
            'referral_discount_laar'  => $referralLaar,
        ]);
        $calc->recalculateAndPersist($order->fresh());

        return response()->json([
            'code'          => $code->code,
            'discount_laar' => $referralLaar,
            'discount_mvr'  => number_format($referralLaar / 100, 2),
        ]);
    }

    public function removeFromOrder(Request $request, int $orderId, OrderTotalsCalculator $calc): JsonResponse
    {
        /** @var Customer $customer */
        $customer = $request->user();

        $order = Order::where('id', $orderId)
            ->where('customer_id', $customer->id)
            ->whereIn('status', ['payment_pending', 'pending'])
            ->firstOrFail();

        $order->update([
            'referral_code'          => null,
            'referral_discount_laar' => 0,
        ]);
        $calc->recalculateAndPersist($order->fresh());

        return response()->json(['message' => 'Referral discount removed.']);
    }

    // ── Admin: list all referral codes ────────────────────────────────────────

    public function adminIndex(): JsonResponse
    {
        $codes = ReferralCode::with('customer:id,name,phone')
            ->orderByDesc('uses_count')
            ->paginate(20);

        return response()->json([
            'data' => collect($codes->items())->map(fn($c) => [
                'id'                   => $c->id,
                'code'                 => $c->code,
                'customer'             => $c->customer ? ['id' => $c->customer->id, 'name' => $c->customer->name] : null,
                'uses_count'           => $c->uses_count,
                'max_uses'             => $c->max_uses,
                'referrer_reward_mvr'  => (float) $c->referrer_reward_mvr,
                'referee_discount_mvr' => (float) $c->referee_discount_mvr,
                'is_active'            => $c->is_active,
            ]),
            'meta' => ['current_page' => $codes->currentPage(), 'last_page' => $codes->lastPage(), 'total' => $codes->total()],
        ]);
    }
}

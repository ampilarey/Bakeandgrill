<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Models\Customer;
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
                'referrer_reward_mvr'  => 10.00,
                'referee_discount_mvr' => 5.00,
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

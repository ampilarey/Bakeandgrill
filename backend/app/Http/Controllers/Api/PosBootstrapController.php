<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Kitchen\Services\KitchenMenuResolver;
use App\Domains\Notifications\Support\SmsNotificationSettings;
use App\Domains\Orders\Support\DiscountSettings;
use App\Http\Controllers\Controller;
use App\Models\Shift;
use App\Services\PosMenuBuilder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Single round trip for POS login — menu + current shift without the
 * extra cash-movement payload the shift "current" endpoint attaches.
 */
class PosBootstrapController extends Controller
{
    public function index(
        Request $request,
        PosMenuBuilder $menuBuilder,
    ): JsonResponse {
        if (!$request->user()?->tokenCan('staff')) {
            return response()->json(['message' => 'Forbidden - staff access only'], 403);
        }

        $channel = $request->query('channel');
        if (!is_string($channel) || !in_array($channel, KitchenMenuResolver::CHANNELS, true)) {
            $channel = 'dine_in';
        }

        $menu = $menuBuilder->build($channel);

        $shift = Shift::query()
            ->where('user_id', $request->user()?->id)
            ->whereNull('closed_at')
            ->latest('opened_at')
            ->first(['id', 'opened_at', 'closed_at', 'opening_cash', 'closing_cash', 'expected_cash', 'variance']);

        $user = $request->user();
        $roleSlug = $user?->role?->slug;
        // UX-only — server ManualDiscountPolicy remains authoritative.
        $sampleSubtotalLaar = 10000; // MVR 100 reference for percent→fixed preview
        $capLaar = DiscountSettings::effectiveCapLaar($sampleSubtotalLaar, $roleSlug);

        return response()->json([
            'categories' => $menu['categories'],
            'items' => $menu['items'],
            // anchor item id => suggested item ids, ranked by lift. Travels
            // with the menu so the chips survive an offline till.
            'pairings' => $menu['pairings'],
            'shift' => $shift,
            'sms_notifications' => [
                'send_bill' => SmsNotificationSettings::isEnabled(SmsNotificationSettings::POS_SEND_BILL),
                'send_pay_link' => SmsNotificationSettings::isEnabled(SmsNotificationSettings::POS_SEND_PAY_LINK),
                'receipt_resend' => SmsNotificationSettings::isEnabled(SmsNotificationSettings::POS_RECEIPT_RESEND),
            ],
            'discount_controls' => [
                'manual_enabled' => DiscountSettings::manualEnabled(),
                'max_percent' => DiscountSettings::maxPercent(),
                'max_fixed_mvr' => DiscountSettings::maxFixedMvr(),
                'effective_cap_percent' => $sampleSubtotalLaar > 0
                    ? (int) round($capLaar * 100 / $sampleSubtotalLaar)
                    : 0,
                'reason_required' => DiscountSettings::reasonRequired(),
                'reasons' => DiscountSettings::reasons(),
                'approval_required' => DiscountSettings::approvalRequired(),
                // Managers apply directly; everyone else needs a code. UX only —
                // ManualDiscountPolicy makes the same call server-side.
                'can_self_approve' => DiscountSettings::canSelfApprove($user),
            ],
        ] + PosMenuController::tillTabs($menu, $user));
    }
}

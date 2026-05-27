<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Kitchen\Services\KitchenMenuResolver;
use App\Domains\Notifications\Support\SmsNotificationSettings;
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

        return response()->json([
            'categories' => $menu['categories'],
            'items' => $menu['items'],
            'shift' => $shift,
            'sms_notifications' => [
                'send_bill' => SmsNotificationSettings::isEnabled(SmsNotificationSettings::POS_SEND_BILL),
                'send_pay_link' => SmsNotificationSettings::isEnabled(SmsNotificationSettings::POS_SEND_PAY_LINK),
                'receipt_resend' => SmsNotificationSettings::isEnabled(SmsNotificationSettings::POS_RECEIPT_RESEND),
            ],
        ]);
    }
}

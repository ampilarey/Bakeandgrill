<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\StaffNotificationPref;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class StaffNotificationPrefController extends Controller
{
    /** GET /admin/staff/{user}/notification-prefs */
    public function show(int $userId): JsonResponse
    {
        $user = User::findOrFail($userId);

        $pref = StaffNotificationPref::firstOrCreate(
            ['user_id' => $user->id],
            [
                'notifications_enabled' => true,
                'order_types'           => null,
                'menu_group_ids'        => null,
                'category_ids'          => null,
                'is_fallback'           => false,
                'fallback_priority'     => 0,
            ]
        );

        return response()->json(['prefs' => $this->format($pref)]);
    }

    /** PUT /admin/staff/{user}/notification-prefs */
    public function update(Request $request, int $userId): JsonResponse
    {
        User::findOrFail($userId);

        $data = $request->validate([
            'notifications_enabled' => 'boolean',
            'order_types'           => 'nullable|array',
            'order_types.*'         => 'in:dine_in,takeaway,online_pickup,delivery',
            'menu_group_ids'        => 'nullable|array',
            'menu_group_ids.*'      => 'integer|exists:menu_groups,id',
            'category_ids'          => 'nullable|array',
            'category_ids.*'        => 'integer|exists:categories,id',
            'is_fallback'           => 'boolean',
            'fallback_priority'     => 'integer|min:0|max:100',
        ]);

        $pref = StaffNotificationPref::updateOrCreate(
            ['user_id' => $userId],
            $data
        );

        return response()->json(['prefs' => $this->format($pref)]);
    }

    private function format(StaffNotificationPref $pref): array
    {
        return [
            'user_id'               => $pref->user_id,
            'notifications_enabled' => $pref->notifications_enabled,
            'order_types'           => $pref->order_types,
            'menu_group_ids'        => $pref->menu_group_ids,
            'category_ids'          => $pref->category_ids,
            'is_fallback'           => $pref->is_fallback,
            'fallback_priority'     => $pref->fallback_priority,
        ];
    }
}

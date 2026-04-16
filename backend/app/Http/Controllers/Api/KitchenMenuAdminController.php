<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\KitchenMenuState;
use App\Models\MenuGroup;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class KitchenMenuAdminController extends Controller
{
    public function kitchenState(): JsonResponse
    {
        $state = KitchenMenuState::current();

        return response()->json([
            'kitchen_menu_state' => [
                'id' => $state->id,
                'active_menu_group_ids' => $state->active_menu_group_ids ?? [],
            ],
        ]);
    }

    public function menuGroups(): JsonResponse
    {
        $groups = MenuGroup::query()->orderBy('sort_order')->orderBy('name')->get();

        return response()->json(['data' => $groups]);
    }

    public function updateKitchenState(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'active_menu_group_ids' => 'required|array|min:1',
            'active_menu_group_ids.*' => 'integer|exists:menu_groups,id',
        ]);

        $state = KitchenMenuState::current();
        $state->update(['active_menu_group_ids' => $validated['active_menu_group_ids']]);

        return response()->json([
            'kitchen_menu_state' => [
                'id' => $state->id,
                'active_menu_group_ids' => $state->active_menu_group_ids,
            ],
        ]);
    }
}

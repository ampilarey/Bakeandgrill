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

    /**
     * Whether this group is something the kitchen makes.
     *
     * Owner, 2026-09-09: counter sales were printing chits and filling the
     * kitchen board with tickets nobody would ever bump. A group is already
     * the axis the kitchen display filters on, so it is where the answer
     * belongs.
     */
    public function updateMenuGroup(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'goes_to_kitchen' => 'required|boolean',
        ]);

        $group = MenuGroup::query()->findOrFail($id);
        $was = (bool) $group->goes_to_kitchen;
        $group->update(['goes_to_kitchen' => (bool) $validated['goes_to_kitchen']]);

        app(\App\Services\AuditLogService::class)->log(
            'menu_group.kitchen_routing_changed',
            'MenuGroup',
            $group->id,
            ['goes_to_kitchen' => $was],
            ['goes_to_kitchen' => (bool) $group->goes_to_kitchen],
            ['name' => $group->name],
            $request,
        );

        return response()->json(['menu_group' => $group->fresh()]);
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

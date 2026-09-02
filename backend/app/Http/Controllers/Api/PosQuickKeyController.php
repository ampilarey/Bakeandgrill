<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Permissions\Services\PermissionService;
use App\Http\Controllers\Controller;
use App\Services\PosQuickKeyService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Save the Quick tab. Reading it needs no endpoint of its own: the list rides
 * in the menu payload so the till has it offline.
 */
class PosQuickKeyController extends Controller
{
    public function __construct(
        private readonly PosQuickKeyService $quickKeys,
        private readonly PermissionService $permissions,
    ) {}

    /** A cashier's own set. Anyone who can ring sales may keep one. */
    public function updateMine(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$user?->tokenCan('staff')) {
            return response()->json(['message' => 'Forbidden - staff access only'], 403);
        }

        $ids = $this->validatedIds($request);
        $stored = $this->quickKeys->replace((int) $user->id, $ids);

        return response()->json(['mine' => $stored]);
    }

    /** The shared set every till starts from. Menu managers only. */
    public function updateShared(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$user?->tokenCan('staff')) {
            return response()->json(['message' => 'Forbidden - staff access only'], 403);
        }
        if (!$this->permissions->hasPermission($user, 'menu.manage')) {
            return response()->json(['message' => 'Only a menu manager can change the shared quick keys.'], 403);
        }

        $ids = $this->validatedIds($request);
        $stored = $this->quickKeys->replace(null, $ids);

        return response()->json(['shared' => $stored]);
    }

    /** @return list<int> */
    private function validatedIds(Request $request): array
    {
        $data = $request->validate([
            'item_ids' => ['present', 'array', 'max:' . PosQuickKeyService::MAX_KEYS],
            'item_ids.*' => ['integer', 'min:1'],
        ]);

        return array_values(array_map('intval', $data['item_ids']));
    }
}

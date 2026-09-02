<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Permissions\Services\PermissionService;
use App\Http\Controllers\Controller;
use App\Services\PosQuickKeyService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Save the Quick tabs. Reading them needs no endpoint of its own: the layout
 * rides in the menu payload so the till has it offline.
 */
class PosQuickKeyController extends Controller
{
    public function __construct(
        private readonly PosQuickKeyService $layouts,
        private readonly PermissionService $permissions,
    ) {}

    /** A cashier's own tabs. Anyone who can ring sales may keep them. */
    public function updateMine(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$user?->tokenCan('staff')) {
            return response()->json(['message' => 'Forbidden - staff access only'], 403);
        }

        $stored = $this->layouts->replace((int) $user->id, $this->tabs($request));

        return response()->json(['mine' => $stored]);
    }

    /** The shared tabs every till starts with. Menu managers only. */
    public function updateShared(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$user?->tokenCan('staff')) {
            return response()->json(['message' => 'Forbidden - staff access only'], 403);
        }
        if (!$this->permissions->hasPermission($user, 'menu.manage')) {
            return response()->json(['message' => 'Only a menu manager can change the shared Quick tabs.'], 403);
        }

        $stored = $this->layouts->replace(null, $this->tabs($request));

        return response()->json(['shared' => $stored]);
    }

    /** Cashiers whose tabs can be copied. */
    public function sources(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$user?->tokenCan('staff')) {
            return response()->json(['message' => 'Forbidden - staff access only'], 403);
        }

        return response()->json(['sources' => $this->layouts->sources((int) $user->id)]);
    }

    /** Take a copy of another cashier's tabs as my own. */
    public function copy(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$user?->tokenCan('staff')) {
            return response()->json(['message' => 'Forbidden - staff access only'], 403);
        }
        $data = $request->validate(['user_id' => ['required', 'integer', 'min:1']]);

        $stored = $this->layouts->copy((int) $data['user_id'], (int) $user->id);

        return response()->json(['mine' => $stored]);
    }

    /** @return list<array<string, mixed>> */
    private function tabs(Request $request): array
    {
        $data = $request->validate([
            'tabs' => ['present', 'array', 'max:' . PosQuickKeyService::MAX_TABS],
            'tabs.*' => ['array'],
        ]);

        return array_values($data['tabs']);
    }
}

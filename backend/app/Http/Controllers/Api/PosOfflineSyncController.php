<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\PosOfflineSyncRequest;
use App\Services\OfflineOrderSyncService;
use Illuminate\Http\JsonResponse;

class PosOfflineSyncController extends Controller
{
    public function __construct(
        private OfflineOrderSyncService $syncService,
    ) {}

    public function sync(PosOfflineSyncRequest $request): JsonResponse
    {
        if (!$request->user()?->tokenCan('staff')) {
            return response()->json(['message' => 'Forbidden - staff access only'], 403);
        }

        $results = $this->syncService->syncBatch(
            $request->validated('orders'),
            $request->user(),
            $request,
        );

        return response()->json(['results' => $results]);
    }
}

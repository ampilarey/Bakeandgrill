<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\System\Services\SystemHealthService;
use App\Http\Controllers\Controller;
use App\Support\DeployStamp;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SystemHealthController extends Controller
{
    public function __construct(private readonly SystemHealthService $health) {}

    /**
     * Public health probe — used by load balancers and uptime monitors.
     * Exposes status + short commit SHA only (no branch, paths, or env details).
     */
    public function public(): JsonResponse
    {
        return response()->json([
            'status' => 'ok',
            'commit' => DeployStamp::publicCommitShort(),
        ]);
    }

    /**
     * Protected health probe — env snapshot plus redis / queue / scheduler / storage.
     * Requires auth:sanctum + permission:website.manage.
     */
    public function admin(): JsonResponse
    {
        return response()->json($this->health->admin());
    }

    /**
     * Detailed operational health for the admin System Health page.
     */
    public function detailed(): JsonResponse
    {
        return response()->json($this->health->detailed());
    }

    public function retryFailedJob(Request $request, string $uuid): JsonResponse
    {
        if (!$this->health->retryFailedJob($uuid)) {
            return response()->json(['message' => 'Failed job not found.'], 404);
        }

        return response()->json(['message' => 'Job queued for retry.', 'uuid' => $uuid]);
    }

    public function forgetFailedJob(Request $request, string $uuid): JsonResponse
    {
        if (!$this->health->forgetFailedJob($uuid)) {
            return response()->json(['message' => 'Failed job not found.'], 404);
        }

        return response()->json(['message' => 'Failed job discarded.', 'uuid' => $uuid]);
    }
}

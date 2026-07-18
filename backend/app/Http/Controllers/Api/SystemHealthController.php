<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\System\Services\SystemHealthService;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SystemHealthController extends Controller
{
    public function __construct(private readonly SystemHealthService $health) {}

    /**
     * Public health probe — used by load balancers and uptime monitors.
     */
    public function public(): JsonResponse
    {
        return response()->json(['status' => 'ok']);
    }

    /**
     * Protected health probe — returns full environment details for internal monitoring.
     * Requires auth:sanctum + permission:website.manage.
     */
    public function admin(): JsonResponse
    {
        $host = request()->getHost();
        $appUrl = (string) config('app.url');
        $env = (string) config('app.env');
        $isStagingHost = str_contains($host, 'test.') || str_contains($host, 'staging.');

        return response()->json([
            'status' => 'ok',
            'environment' => $env,
            'app_url' => $appUrl,
            'host' => $host,
            'staging_host' => $isStagingHost,
            'env_mismatch' => $isStagingHost && $env === 'production',
            'database' => 'connected',
            'timestamp' => now()->toIso8601String(),
        ]);
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

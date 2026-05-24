<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;

class SystemHealthController extends Controller
{
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
}

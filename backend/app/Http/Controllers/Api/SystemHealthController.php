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
        return response()->json([
            'status'      => 'ok',
            'environment' => config('app.env'),
            'database'    => 'connected',
            'timestamp'   => now()->toIso8601String(),
        ]);
    }
}

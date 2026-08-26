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
     * Public liveness probe — used by load balancers and uptime monitors.
     * Exposes status + short commit SHA only (no branch, paths, or env details).
     *
     * Always 200 while the app can serve a request, deliberately. Sessions are
     * in the database, so the site keeps serving with Redis down — answering
     * 503 here would pull a working site out of rotation and turn a degraded
     * queue into a full outage. Dependency state goes in `degraded` for
     * monitors that read the body, and to /api/health/ready for those that
     * read the status code.
     */
    public function public(): JsonResponse
    {
        $degraded = $this->health->degradedDependencies();

        return response()->json(array_filter([
            'status' => $degraded === [] ? 'ok' : 'degraded',
            'commit' => DeployStamp::publicCommitShort(),
            'degraded' => $degraded === [] ? null : $degraded,
        ], static fn ($value) => $value !== null));
    }

    /**
     * Public readiness probe — 200 when the app can do work, 503 when it
     * cannot. Point uptime monitoring here.
     *
     * This exists because of a real outage: Redis died at 03:51 and was still
     * dead nineteen hours later, with /api/health answering "ok" the whole
     * time. It reported that the app booted, which was true and useless — the
     * queue was doing nothing, so order confirmations, staff alerts, live
     * board updates and outgoing webhooks all silently stopped.
     *
     * Names which dependency is unhappy but never why: the reason can carry
     * connection strings and paths, and this endpoint is unauthenticated. The
     * detail stays on the admin probe.
     */
    public function ready(): JsonResponse
    {
        $degraded = $this->health->degradedDependencies();

        return response()->json([
            'status' => $degraded === [] ? 'ready' : 'degraded',
            'commit' => DeployStamp::publicCommitShort(),
            'degraded' => $degraded,
        ], $degraded === [] ? 200 : 503);
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

<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\System\Services\ServiceAvailabilityService;
use App\Http\Controllers\Controller;
use App\Http\Resources\ServiceStatusResource;
use Illuminate\Http\JsonResponse;

/**
 * Public multi-surface availability endpoint.
 *
 * Consumed by the order-app banner, Blade partials, and any other client
 * that needs to check whether a customer flow is currently accepted. This
 * is a read-only view of the resolved snapshot — never touches DB writes.
 *
 * The legacy `/api/ordering/status` endpoint is extended additively with a
 * `services` map in OnlineOrderingController@status so older clients keep
 * working.
 */
class ServiceStatusController extends Controller
{
    public function __construct(
        private readonly ServiceAvailabilityService $availability,
    ) {}

    public function __invoke(): JsonResponse
    {
        $snapshot = $this->availability->resolve();

        $services = [];
        foreach ($snapshot as $key => $data) {
            $services[$key] = (new ServiceStatusResource($data))->toArray(request());
        }

        return response()->json([
            'services' => $services,
            'generated_at' => now()->toIso8601String(),
        ]);
    }
}

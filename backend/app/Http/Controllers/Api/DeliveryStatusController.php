<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\DeliveryGateService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * GET /api/ordering/delivery-status?area=male
 *
 * Public endpoint — returns delivery gate status, including zone eligibility
 * when an area query parameter is provided.
 */
class DeliveryStatusController extends Controller
{
    public function __construct(
        private readonly DeliveryGateService $gate,
    ) {}

    public function show(Request $request): JsonResponse
    {
        $area = $request->query('area');

        return response()->json(
            $this->gate->status(is_string($area) ? $area : null)
        );
    }
}

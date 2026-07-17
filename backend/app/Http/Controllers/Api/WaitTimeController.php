<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Kitchen\Services\WaitTimeEstimator;
use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;

class WaitTimeController extends Controller
{
    public function __construct(private readonly WaitTimeEstimator $estimator) {}

    /**
     * Returns the estimated current wait time in minutes,
     * based on open kitchen tickets and item prep times.
     */
    public function estimate(): JsonResponse
    {
        $result = $this->estimator->estimate();

        return response()->json([
            'wait_minutes' => $result['wait_minutes'],
            'queue_depth' => $result['queue_depth'],
        ]);
    }
}

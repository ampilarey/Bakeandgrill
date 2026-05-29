<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Ordering\Services\PickupSlotService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class PickupSlotController extends Controller
{
    public function index(Request $request, PickupSlotService $slots): JsonResponse
    {
        $date = $request->query('date', now()->toDateString());

        return response()->json([
            'date' => $date,
            'slots' => $slots->slotsForDate($date),
        ]);
    }
}

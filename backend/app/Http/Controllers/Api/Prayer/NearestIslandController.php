<?php

namespace App\Http\Controllers\Api\Prayer;

use App\Domains\PrayerTimes\Actions\FindNearestIsland;
use App\Http\Controllers\Controller;
use App\Http\Requests\Prayer\NearestIslandRequest;
use App\Http\Resources\Prayer\IslandResource;
use Illuminate\Http\JsonResponse;

class NearestIslandController extends Controller
{
    public function __construct(
        private readonly FindNearestIsland $findNearest,
    ) {}

    public function __invoke(NearestIslandRequest $request): JsonResponse
    {
        $island = $this->findNearest->execute(
            (float) $request->validated('lat'),
            (float) $request->validated('lng'),
        );

        if ($island === null) {
            return response()->json(['error' => 'No island found'], 404);
        }

        return response()->json(['island' => new IslandResource($island)]);
    }
}

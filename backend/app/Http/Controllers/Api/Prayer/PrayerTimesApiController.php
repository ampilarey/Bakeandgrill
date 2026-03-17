<?php

namespace App\Http\Controllers\Api\Prayer;

use App\Domains\PrayerTimes\Actions\GetIslandCollection;
use App\Domains\PrayerTimes\Actions\GetPrayerTimesForIslandAndDate;
use App\Http\Controllers\Controller;
use App\Http\Requests\Prayer\PrayerTimesApiRequest;
use App\Http\Resources\Prayer\PrayerTimesResource;
use Illuminate\Http\JsonResponse;

class PrayerTimesApiController extends Controller
{
    public function __construct(
        private readonly GetIslandCollection            $getIslands,
        private readonly GetPrayerTimesForIslandAndDate $getPrayerTimes,
    ) {}

    public function __invoke(PrayerTimesApiRequest $request): JsonResponse
    {
        $islandId = (int) $request->validated('island_id');
        $islands  = $this->getIslands->execute();
        $island   = $islands->first(fn ($i) => $i->id === $islandId);

        if ($island === null) {
            return response()->json(['error' => 'Island not found'], 404);
        }

        $date    = $request->resolvedDate();
        $prayers = $this->getPrayerTimes->execute($island, $date);

        if ($prayers === null) {
            return response()->json(['error' => 'Prayer times not found for this date'], 404);
        }

        return (new PrayerTimesResource($prayers))->response();
    }
}

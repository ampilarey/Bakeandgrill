<?php

namespace App\Http\Controllers\Api\Prayer;

use App\Domains\PrayerTimes\Actions\GetIslandCollection;
use App\Http\Controllers\Controller;
use App\Http\Resources\Prayer\IslandResource;
use Illuminate\Http\JsonResponse;

class IslandsController extends Controller
{
    public function __construct(
        private readonly GetIslandCollection $getIslands,
    ) {}

    public function index(): JsonResponse
    {
        $islands = $this->getIslands->execute();

        $grouped = $islands
            ->groupBy(fn ($i) => $i->atoll)
            ->map(fn ($group) => IslandResource::collection($group->values()))
            ->toArray();

        return response()->json([
            'islands' => IslandResource::collection($islands),
            'grouped' => $grouped,
        ]);
    }
}

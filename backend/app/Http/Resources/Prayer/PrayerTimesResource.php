<?php

namespace App\Http\Resources\Prayer;

use App\Domains\PrayerTimes\DTOs\PrayerTimesResult;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PrayerTimesResource extends JsonResource
{
    public static $wrap = null;

    /** @var PrayerTimesResult */
    public $resource;

    public function toArray(Request $request): array
    {
        return [
            'island' => new IslandResource($this->resource->island),
            'date'   => $this->resource->date->toDateString(),
            'prayers' => [
                'fajr'    => $this->resource->fajr,
                'sunrise' => $this->resource->sunrise,
                'dhuhr'   => $this->resource->dhuhr,
                'asr'     => $this->resource->asr,
                'maghrib' => $this->resource->maghrib,
                'isha'    => $this->resource->isha,
            ],
        ];
    }
}

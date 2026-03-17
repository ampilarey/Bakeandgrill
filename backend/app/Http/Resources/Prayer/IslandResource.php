<?php

namespace App\Http\Resources\Prayer;

use App\Domains\PrayerTimes\DTOs\IslandData;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class IslandResource extends JsonResource
{
    /** @var IslandData */
    public $resource;

    public function toArray(Request $request): array
    {
        return [
            'id'             => $this->resource->id,
            'atoll'          => $this->resource->atoll,
            'atoll_latin'    => $this->resource->atollLatin,
            'name'           => $this->resource->name,
            'name_latin'     => $this->resource->nameLatin,
            'latitude'       => $this->resource->latitude,
            'longitude'      => $this->resource->longitude,
            'offset_minutes' => $this->resource->offsetMinutes,
        ];
    }
}

<?php

namespace App\Domains\PrayerTimes\DTOs;

final readonly class IslandData
{
    public function __construct(
        public int     $id,
        public int     $categoryId,
        public string  $atoll,
        public ?string $atollLatin,
        public string  $name,
        public ?string $nameLatin,
        public int     $offsetMinutes,
        public ?float  $latitude,
        public ?float  $longitude,
        public bool    $isActive,
    ) {}

    public static function fromStdClass(object $row): self
    {
        return new self(
            id:            (int)  $row->id,
            categoryId:    (int)  $row->category_id,
            atoll:               $row->atoll,
            atollLatin:          $row->atoll_latin ?? null,
            name:                $row->name,
            nameLatin:           $row->name_latin  ?? null,
            offsetMinutes: (int)  $row->offset_minutes,
            latitude:      isset($row->latitude)  && $row->latitude  !== null ? (float) $row->latitude  : null,
            longitude:     isset($row->longitude) && $row->longitude !== null ? (float) $row->longitude : null,
            isActive:      (bool) ($row->is_active ?? true),
        );
    }

    public function displayName(): string
    {
        return $this->nameLatin
            ? "{$this->name} ({$this->nameLatin})"
            : $this->name;
    }
}

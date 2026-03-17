<?php

namespace App\Domains\PrayerTimes\DTOs;

final readonly class PrayerTimesResult
{
    public function __construct(
        public IslandData      $island,
        public \Carbon\Carbon  $date,
        public string          $fajr,
        public string          $sunrise,
        public string          $dhuhr,
        public string          $asr,
        public string          $maghrib,
        public string          $isha,
    ) {}

    /** @return array<string, string> */
    public function toArray(): array
    {
        return [
            'fajr'    => $this->fajr,
            'sunrise' => $this->sunrise,
            'dhuhr'   => $this->dhuhr,
            'asr'     => $this->asr,
            'maghrib' => $this->maghrib,
            'isha'    => $this->isha,
        ];
    }

    /** Prayer-only entries (sunrise excluded) for countdown logic */
    public function prayersOnly(): array
    {
        return [
            'fajr'    => $this->fajr,
            'dhuhr'   => $this->dhuhr,
            'asr'     => $this->asr,
            'maghrib' => $this->maghrib,
            'isha'    => $this->isha,
        ];
    }
}

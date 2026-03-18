<?php

namespace App\Domains\PrayerTimes\ViewModels;

use App\Domains\PrayerTimes\DTOs\IslandData;
use App\Domains\PrayerTimes\DTOs\PrayerTimesResult;
use Carbon\Carbon;
use Illuminate\Support\Collection;

final readonly class PrayerPageViewModel
{
    /** All active islands (flat Collection<IslandData>) */
    public Collection $islands;

    /** Islands grouped by atoll name (Collection<string, Collection<IslandData>>) */
    public Collection $grouped;

    public function __construct(
        Collection              $islands,
        public ?IslandData      $selectedIsland,
        public Carbon           $selectedDate,
        public ?PrayerTimesResult $prayers,
    ) {
        $this->islands = $islands;
        $this->grouped = $islands->groupBy(fn (IslandData $i) => $i->atoll);
    }

    /** Prayer definitions for the view — icons, Dhivehi names, English names */
    public function prayerDefs(): array
    {
        return [
            'fajr'    => ['name' => 'ފަތިސް',       'latin' => 'Fajr',    'icon' => '🌙', 'isSunrise' => false],
            'sunrise' => ['name' => 'އިރު އެރުން',   'latin' => 'Sunrise', 'icon' => '🌅', 'isSunrise' => true],
            'dhuhr'   => ['name' => 'މެންދުރު',      'latin' => 'Dhuhr',   'icon' => '☀️', 'isSunrise' => false],
            'asr'     => ['name' => 'އަޞްރު',        'latin' => 'Asr',     'icon' => '🌤️', 'isSunrise' => false],
            'maghrib' => ['name' => 'މަޣްރިބް',      'latin' => 'Maghrib', 'icon' => '🌆', 'isSunrise' => false],
            'isha'    => ['name' => 'ޢިޝާ',          'latin' => 'Isha',    'icon' => '🌟', 'isSunrise' => false],
        ];
    }

    /** Whether the selected date is today (used to drive live countdown JS) */
    public function isToday(): bool
    {
        return $this->selectedDate->isToday();
    }

    /** Page <title> */
    public function pageTitle(): string
    {
        $island = $this->selectedIsland?->name ?? 'ދިވެހިރާއްޖެ';
        return "ނަމާދު ވަގުތު – {$island}";
    }
}

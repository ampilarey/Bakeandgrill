<?php

namespace App\Http\Controllers;

use App\Domains\PrayerTimes\Actions\GetIslandCollection;
use App\Domains\PrayerTimes\Actions\GetPrayerTimesForIslandAndDate;
use App\Domains\PrayerTimes\ViewModels\PrayerPageViewModel;
use App\Http\Requests\Prayer\PrayerTimesWebRequest;
use Illuminate\View\View;

class PrayerTimesWebController extends Controller
{
    public function __construct(
        private readonly GetIslandCollection             $getIslands,
        private readonly GetPrayerTimesForIslandAndDate  $getPrayerTimes,
    ) {}

    public function index(PrayerTimesWebRequest $request): View
    {
        $islands  = $this->getIslands->execute();
        $date     = $request->resolvedDate();
        $islandId = $request->resolvedIslandId();

        if ($islandId === 0) {
            $island = $islands->first(fn ($i) => $i->name === 'މާލެ')
                ?? $islands->first(fn ($i) => strtolower($i->nameLatin ?? '') === 'male')
                ?? $islands->first();
        } else {
            $island = $islands->first(fn ($i) => $i->id === $islandId);
        }

        $prayers = $island ? $this->getPrayerTimes->execute($island, $date) : null;

        $viewModel = new PrayerPageViewModel(
            islands:        $islands,
            selectedIsland: $island,
            selectedDate:   $date,
            prayers:        $prayers,
        );

        return view('prayer-times', compact('viewModel'));
    }
}

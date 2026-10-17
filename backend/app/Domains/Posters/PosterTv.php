<?php

declare(strict_types=1);

namespace App\Domains\Posters;

use App\Domains\Signage\Services\SignageCache;
use App\Domains\Signage\Services\SignageTemplateFactory;
use App\Models\Poster;
use App\Models\SignagePlaylist;
use App\Models\SignageScreen;
use Carbon\Carbon;

/**
 * One 1920×1080 picture and one image slide on the dining playlist.
 * The take-down date is the slide's schedule date_end. Sending again
 * replaces that slide. The rest of the board stays.
 */
final class PosterTv
{
    /** @return array{slide_id: string, image_url: string, date_end: ?string, playlist_id: int} */
    public static function send(Poster $poster): array
    {
        $url = PosterScreen::tv($poster);
        $end = $poster->take_down_on?->toDateString();
        $slide = SignageTemplateFactory::template('full_screen', [
            'id' => 'poster-' . $poster->code(),
            'name' => $poster->name,
            'seconds' => 12,
            'fields' => [
                'image' => $url,
                'title' => (string) ($poster->name),
            ],
        ]);
        $slide['schedule'] = [
            'date_start' => now()->toDateString(),
            'date_end' => $end,
        ];
        $slide['poster_code'] = $poster->code();
        if ($end !== null) {
            $slide['expires_at'] = Carbon::parse($end, (string) config('app.timezone', 'Indian/Maldives'))
                ->endOfDay()
                ->toIso8601String();
        }

        $playlist = self::playlist();
        $slides = is_array($playlist->slides) ? $playlist->slides : [];
        $slides = array_values(array_filter(
            $slides,
            static fn ($row): bool => !is_array($row) || ($row['id'] ?? '') !== $slide['id'],
        ));
        $slides[] = $slide;
        $playlist->slides = $slides;
        $playlist->save();
        SignageCache::bust();

        return [
            'slide_id' => (string) $slide['id'],
            'image_url' => $url,
            'date_end' => $end,
            'playlist_id' => (int) $playlist->id,
        ];
    }

    private static function playlist(): SignagePlaylist
    {
        $screen = SignageScreen::query()->with(['playlist', 'group.playlist'])->where('is_default', true)->first()
            ?? SignageScreen::query()->with(['playlist', 'group.playlist'])->orderBy('id')->first();
        $playlist = $screen?->playlist ?? $screen?->group?->playlist;
        if ($playlist instanceof SignagePlaylist) {
            return $playlist;
        }
        $existing = SignagePlaylist::query()->where('is_active', true)->orderBy('id')->first();
        if ($existing instanceof SignagePlaylist) {
            return $existing;
        }

        return SignagePlaylist::query()->create([
            'name' => 'Shop TV',
            'slides' => SignageTemplateFactory::defaultPlaylistSlides(),
            'is_active' => true,
        ]);
    }
}

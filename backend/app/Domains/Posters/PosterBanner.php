<?php

declare(strict_types=1);

namespace App\Domains\Posters;

use App\Models\Poster;
use App\Models\SiteSetting;

/**
 * Optionally the offer poster is one home hero slide for its period.
 * Other slides stay. The slide is tagged with the poster code so sending
 * again replaces it, and taking it off removes only that slide.
 */
final class PosterBanner
{
    /** @return list<string> */
    public static function codes(): array
    {
        $codes = [];
        foreach (self::slides() as $slide) {
            $code = trim((string) ($slide['poster_code'] ?? ''));
            if ($code !== '') {
                $codes[] = $code;
            }
        }

        return $codes;
    }

    public static function publish(Poster $poster, bool $on): bool
    {
        $code = $poster->code();
        $slides = array_values(array_filter(
            self::slides(),
            static fn (array $slide): bool => (string) ($slide['poster_code'] ?? '') !== $code,
        ));
        if ($on) {
            $content = PosterContent::resolve($poster->toArray());
            $end = $poster->take_down_on?->toDateString();
            $cards = PosterScreen::social($poster);
            $slides[] = [
                'poster_code' => $code,
                'image' => $cards['1200x630'] ?? '',
                'title' => (string) ($content['headline'] ?: $poster->name),
                'subtitle' => (string) ($content['subhead'] ?? ''),
                'cta_text' => 'See it',
                'cta_url' => PosterLink::path($code),
                'showing' => true,
                'show_from' => now()->toDateString(),
                'show_until' => $end ?? '',
            ];
        }
        SiteSetting::set(
            'hero_slides',
            json_encode(array_values($slides), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '[]',
            'website',
        );
        SiteSetting::bust();

        return $on;
    }

    /** @return list<array<string, mixed>> */
    private static function slides(): array
    {
        $raw = SiteSetting::getScoped('hero_slides', 'website');
        $decoded = is_string($raw) ? json_decode($raw, true) : (is_array($raw) ? $raw : []);
        if (!is_array($decoded)) {
            return [];
        }
        $slides = [];
        foreach ($decoded as $slide) {
            if (is_array($slide)) {
                $slides[] = $slide;
            }
        }

        return $slides;
    }
}

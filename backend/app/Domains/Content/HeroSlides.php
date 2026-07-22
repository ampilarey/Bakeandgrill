<?php

declare(strict_types=1);

namespace App\Domains\Content;

/**
 * Resolve hero slides from hero_slides array with legacy hero_slide_1/2/3 fallback.
 *
 * @return list<array<string, mixed>>
 */
final class HeroSlides
{
    /**
     * @param callable(string, mixed): mixed $get content getter (key, default)
     * @return list<array<string, mixed>>
     */
    public static function resolve(callable $get): array
    {
        $raw = $get('hero_slides', '[]');
        $slides = is_string($raw) ? (json_decode($raw, true) ?: []) : (is_array($raw) ? $raw : []);

        if (is_array($slides) && count($slides) > 0) {
            return array_values(array_filter($slides, static function ($slide) {
                return is_array($slide) && !empty($slide['title']);
            }));
        }

        $legacy = [];
        for ($i = 1; $i <= 3; $i++) {
            $rawSlide = $get("hero_slide_{$i}", '{}');
            $slide = is_string($rawSlide) ? (json_decode($rawSlide, true) ?: []) : (is_array($rawSlide) ? $rawSlide : []);
            if (is_array($slide) && !empty($slide['title'])) {
                $legacy[] = $slide;
            }
        }

        return $legacy;
    }

    /**
     * Build a hero_slides JSON array from legacy scoped rows (migration helper).
     *
     * @param array<int, string|null> $legacyValues keyed 1..3
     */
    public static function fromLegacy(array $legacyValues): string
    {
        $slides = [];
        foreach ([1, 2, 3] as $i) {
            $raw = $legacyValues[$i] ?? null;
            if ($raw === null || $raw === '') {
                continue;
            }
            $slide = json_decode((string) $raw, true);
            if (is_array($slide) && $slide !== []) {
                $slides[] = $slide;
            }
        }

        return json_encode(array_values($slides), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '[]';
    }
}

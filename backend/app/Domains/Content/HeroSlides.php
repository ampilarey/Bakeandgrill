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
        $raw = $get('hero_slides', null);
        [$slides, $hasArray] = self::decodeSlideArray($raw);

        // A JSON array (including []) is the source of truth — never fall back to
        // legacy keys. Falling back made "delete all" resurrect old hero_slide_1/2/3.
        if ($hasArray) {
            return array_values(array_filter($slides, static fn ($slide) => self::isRenderableSlide($slide)));
        }

        $legacy = [];
        for ($i = 1; $i <= 3; $i++) {
            $rawSlide = $get("hero_slide_{$i}", null);
            $slide = self::decodeSlideObject($rawSlide);
            if (self::isRenderableSlide($slide)) {
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

    /**
     * Per-slide visibility. Absent `showing` means visible so legacy slides stay live.
     *
     * @param  mixed  $slide
     */
    public static function isSlideShowing(mixed $slide): bool
    {
        if (! is_array($slide)) {
            return false;
        }

        // Explicit false only — null/missing/true all mean Showing.
        return ! array_key_exists('showing', $slide) || $slide['showing'] !== false;
    }

    /** @param mixed $slide */
    public static function isRenderableSlide(mixed $slide): bool
    {
        if (! is_array($slide)) {
            return false;
        }

        if (! self::isSlideShowing($slide)) {
            return false;
        }

        $title = trim((string) ($slide['title'] ?? ''));
        $image = trim((string) ($slide['image'] ?? ''));
        $video = trim((string) ($slide['video'] ?? ''));

        return $title !== '' || $image !== '' || $video !== '';
    }

    /**
     * Resolve photo / scrim / text position for public rendering.
     * Lockstep with order-app resolveHeroSlidePresentation().
     *
     * @param  array<string, mixed>  $slide
     * @return array{photo: float, scrim: float, text_position: string, photo_brightness: int, text_background: int}
     */
    public static function presentation(array $slide): array
    {
        $hasPhoto = array_key_exists('photo_brightness', $slide) && $slide['photo_brightness'] !== null && $slide['photo_brightness'] !== '';
        $hasScrim = array_key_exists('text_background', $slide) && $slide['text_background'] !== null && $slide['text_background'] !== '';
        $hasDim = array_key_exists('dim', $slide) && $slide['dim'] !== null && $slide['dim'] !== '';

        // Implicit legacy default was dim=100 (knocked-back photo + strong scrim).
        $photoBrightness = 0;
        $textBackground = 100;

        if ($hasPhoto || $hasScrim) {
            $photoBrightness = $hasPhoto ? self::clamp100((float) $slide['photo_brightness']) : 100;
            $textBackground = $hasScrim ? self::clamp100((float) $slide['text_background']) : 100;
        } elseif ($hasDim) {
            $dim = self::clamp100((float) $slide['dim']);
            $photoBrightness = 100 - $dim;
            $textBackground = $dim;
        }

        $rawPos = strtolower(trim((string) ($slide['text_position'] ?? 'bottom')));
        $textPosition = in_array($rawPos, ['top', 'middle', 'bottom'], true) ? $rawPos : 'bottom';

        return [
            'photo_brightness' => $photoBrightness,
            'text_background' => $textBackground,
            'photo' => $photoBrightness / 100.0,
            'scrim' => $textBackground / 100.0,
            'text_position' => $textPosition,
        ];
    }

    private static function clamp100(float $n): int
    {
        if (! is_finite($n)) {
            return 100;
        }

        return (int) max(0, min(100, round($n)));
    }

    /**
     * @return array{0: list<array<string, mixed>>, 1: bool} [slides, hasArray]
     */
    private static function decodeSlideArray(mixed $raw): array
    {
        if (is_array($raw)) {
            /** @var list<array<string, mixed>> $raw */
            return [$raw, true];
        }

        if (! is_string($raw) || $raw === '') {
            return [[], false];
        }

        $decoded = json_decode($raw, true);
        if (json_last_error() !== JSON_ERROR_NONE || ! is_array($decoded)) {
            return [[], false];
        }

        // List of slides (incl. empty). Associative objects are not the array format.
        if ($decoded !== [] && ! array_is_list($decoded)) {
            return [[], false];
        }

        /** @var list<array<string, mixed>> $decoded */
        return [$decoded, true];
    }

    /** @return array<string, mixed> */
    private static function decodeSlideObject(mixed $raw): array
    {
        if (is_array($raw)) {
            return $raw;
        }
        if (! is_string($raw) || $raw === '') {
            return [];
        }
        $decoded = json_decode($raw, true);

        return is_array($decoded) ? $decoded : [];
    }
}

<?php

declare(strict_types=1);

namespace App\Domains\Content;

use Carbon\Carbon;
use DateTimeInterface;

/**
 * Resolve hero slides from hero_slides array with legacy hero_slide_1/2/3 fallback.
 *
 * @return list<array<string, mixed>>
 */
final class HeroSlides
{
    /** @var list<string> */
    public const ELEMENT_KEYS = ['eyebrow', 'title', 'subtitle', 'cta1', 'cta2'];

    /** @var array<string, string> */
    private const BG_TOKEN_RGB = [
        'dark' => '28,20,8',
        'light' => '255,255,255',
        'amber' => '212,129,58',
        'brand_dark' => '45,26,10',
    ];

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

    /**
     * Optional show_from / show_until window in the restaurant timezone.
     * Both empty = always. Evaluated with config('app.timezone').
     *
     * @param  array<string, mixed>  $slide
     */
    public static function isSlideInScheduleWindow(array $slide, ?DateTimeInterface $now = null): bool
    {
        $fromRaw = trim((string) ($slide['show_from'] ?? ''));
        $untilRaw = trim((string) ($slide['show_until'] ?? ''));
        if ($fromRaw === '' && $untilRaw === '') {
            return true;
        }

        $tz = (string) config('app.timezone', 'Indian/Maldives');
        $nowLocal = $now === null
            ? Carbon::now($tz)
            : Carbon::parse($now)->timezone($tz);

        if ($fromRaw !== '') {
            $from = self::parseShowBound($fromRaw, 'from', $tz);
            if ($from !== null && $nowLocal->lt($from)) {
                return false;
            }
        }

        if ($untilRaw !== '') {
            $until = self::parseShowBound($untilRaw, 'until', $tz);
            if ($until !== null && $nowLocal->gt($until)) {
                return false;
            }
        }

        return true;
    }

    /** @param mixed $slide */
    public static function isRenderableSlide(mixed $slide): bool
    {
        if (! is_array($slide)) {
            return false;
        }

        // Manual Hidden wins over any dates.
        if (! self::isSlideShowing($slide)) {
            return false;
        }

        if (! self::isSlideInScheduleWindow($slide)) {
            return false;
        }

        $title = trim((string) ($slide['title'] ?? ''));
        $image = trim((string) ($slide['image'] ?? ''));
        $video = trim((string) ($slide['video'] ?? ''));

        return $title !== '' || $image !== '' || $video !== '';
    }

    /**
     * Resolve photo / scrim / text position / per-element panels for public rendering.
     * Lockstep with order-app resolveHeroSlidePresentation().
     *
     * @param  array<string, mixed>  $slide
     * @return array{
     *   photo: float,
     *   scrim: float,
     *   text_position: string,
     *   photo_brightness: int,
     *   text_background: int,
     *   elements: array<string, array{token: ?string, strength: ?int, full_width: bool, css: ?string}>
     * }
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

        $elements = [];
        foreach (self::ELEMENT_KEYS as $key) {
            $elements[$key] = self::resolveElementBackground($slide, $key);
        }

        // One background, not three. When the heading or subheading carries its
        // own panel, the copy scrim behind the whole stack is a second box
        // around the first — the "too large" look the owner reported
        // (2026-08-16). The renderer drops the scrim when this is true.
        $panelled = false;
        foreach (['title', 'subtitle'] as $key) {
            $css = $elements[$key]['css'] ?? null;
            if ($css !== null && $css !== '' && $css !== 'transparent') {
                $panelled = true;
            }
        }

        return [
            'photo_brightness' => $photoBrightness,
            'text_background' => $textBackground,
            'photo' => $photoBrightness / 100.0,
            'scrim' => $textBackground / 100.0,
            'text_position' => $textPosition,
            'elements' => $elements,
            'panelled' => $panelled,
        ];
    }

    /**
     * @param  array<string, mixed>  $slide
     * @return array{token: ?string, strength: ?int, full_width: bool, css: ?string}
     */
    public static function resolveElementBackground(array $slide, string $key): array
    {
        $bgKey = "{$key}_bg";
        $strengthKey = "{$key}_bg_strength";
        $fullKey = "{$key}_bg_full_width";

        $raw = $slide[$bgKey] ?? null;
        if ($raw === null || $raw === '') {
            return ['token' => null, 'strength' => null, 'full_width' => false, 'css' => null];
        }

        $token = strtolower(trim((string) $raw));
        $hasStrength = array_key_exists($strengthKey, $slide) && $slide[$strengthKey] !== null && $slide[$strengthKey] !== '';
        $strength = $hasStrength ? self::clamp100((float) $slide[$strengthKey]) : 70;
        $fullWidth = false;
        if ($key === 'title' || $key === 'subtitle') {
            $fullWidth = self::truthyFlag($slide[$fullKey] ?? false);
        }

        if ($token === 'none') {
            return ['token' => 'none', 'strength' => $strength, 'full_width' => $fullWidth, 'css' => 'transparent'];
        }

        // Frosted glass — same family as secondary CTA (white wash + blur via CSS).
        // Strength maps to fill opacity (10 ≈ button-2 look).
        if ($token === 'glass') {
            $alpha = max(0.02, min(0.45, $strength / 100.0));

            return [
                'token' => 'glass',
                'strength' => $strength,
                'full_width' => $fullWidth,
                'css' => 'rgba(255,255,255,'.$alpha.')',
            ];
        }

        $rgb = self::BG_TOKEN_RGB[$token] ?? self::hexToRgb($token);
        if ($rgb === null) {
            return ['token' => null, 'strength' => null, 'full_width' => false, 'css' => null];
        }

        $alpha = $strength / 100.0;

        return [
            'token' => $token,
            'strength' => $strength,
            'full_width' => $fullWidth,
            'css' => "rgba({$rgb},{$alpha})",
        ];
    }

    private static function truthyFlag(mixed $v): bool
    {
        if ($v === true || $v === 1 || $v === '1') {
            return true;
        }

        return is_string($v) && strtolower($v) === 'true';
    }

    private static function hexToRgb(string $hex): ?string
    {
        $raw = ltrim(trim($hex), '#');
        if (preg_match('/^[0-9a-f]{3}$/i', $raw) === 1) {
            $raw = $raw[0].$raw[0].$raw[1].$raw[1].$raw[2].$raw[2];
        }
        if (preg_match('/^[0-9a-f]{6}$/i', $raw) !== 1) {
            return null;
        }
        $n = hexdec($raw);

        return (($n >> 16) & 255).','.(($n >> 8) & 255).','.($n & 255);
    }

    private static function parseShowBound(string $raw, string $edge, string $tz): ?Carbon
    {
        $s = trim($raw);
        if ($s === '') {
            return null;
        }

        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $s) === 1) {
            $dt = Carbon::parse($s, $tz);

            return $edge === 'from' ? $dt->startOfDay() : $dt->endOfDay();
        }

        try {
            return Carbon::parse($s, $tz);
        } catch (\Throwable) {
            return null;
        }
    }

    private static function clamp100(float $n): int
    {
        if (! is_finite($n)) {
            return 100;
        }

        return (int) max(0, min(100, round($n)));
    }

    /**
     * Split rich hero copy on &lt;br&gt; into non-empty line fragments.
     * Kept for callers / tests; title contrast now uses outline/halo, not pills.
     *
     * @return list<string>
     */
    /**
     * How hard the heading has to shrink to fit a fixed-height banner.
     *
     * Owner chose "words shrink to fit the banner" over "banner grows"
     * (2026-08-16), so a long heading steps down instead of wrapping to four
     * lines and pushing the panel out of the top of the banner. Bands are on
     * plain-text length, which is what actually drives the wrap — markup and
     * entities are stripped first so <em>bold</em> does not count as content.
     *
     * Returns '' (normal), 'long' or 'xlong'.
     */
    public static function headingLengthBand(string $html): string
    {
        $text = trim(html_entity_decode(strip_tags(str_ireplace(['<br>', '<br/>', '<br />'], ' ', $html)), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
        $len = function_exists('mb_strlen') ? mb_strlen($text, 'UTF-8') : strlen($text);

        if ($len > 46) {
            return 'xlong';
        }
        if ($len > 26) {
            return 'long';
        }

        return '';
    }

    public static function splitRichTextLines(string $html): array
    {
        $parts = preg_split('/<br\s*\/?>/i', $html);
        if ($parts === false) {
            $parts = [$html];
        }

        $lines = [];
        foreach ($parts as $part) {
            $text = trim(html_entity_decode(strip_tags($part), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
            if ($text === '') {
                continue;
            }
            $lines[] = $part;
        }

        return $lines === [] ? ($html !== '' ? [$html] : []) : $lines;
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

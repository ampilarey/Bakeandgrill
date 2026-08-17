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

        $styles = [];
        foreach (self::STYLED_KEYS as $key) {
            $styles[$key] = self::resolveElementStyle($slide, $key);
        }

        // One background, not three. When the heading or subheading carries its
        // own panel, the copy scrim behind the whole stack is a second box
        // around the first — the "too large" look the owner reported
        // (2026-08-16).
        // Only shapes that actually draw a box count. The outline shape paints
        // letter edges, not a panel, so there is nothing for the block shade to
        // nest inside and it must stay — otherwise picking a solid colour would
        // silently strip readability with no box to show for it.
        $panelled = false;
        foreach (['title', 'subtitle'] as $key) {
            $css = $elements[$key]['css'] ?? null;
            $shape = $elements[$key]['shape'] ?? self::SHAPE_OUTLINE;
            if ($css !== null && $css !== '' && $css !== 'transparent' && $shape !== self::SHAPE_OUTLINE) {
                $panelled = true;
            }
        }

        // The owner asked to drive this themselves rather than have it happen
        // silently (2026-08-17). 'auto' is the behaviour they first approved:
        // the shade steps back only when it would nest inside a panel.
        $mode = strtolower(trim((string) ($slide['copy_scrim_mode'] ?? 'auto')));
        if (! in_array($mode, ['auto', 'always', 'off'], true)) {
            $mode = 'auto';
        }

        $copyScrim = match ($mode) {
            'off' => false,
            'always' => true,
            default => ! $panelled,
        };

        return [
            'photo_brightness' => $photoBrightness,
            'text_background' => $textBackground,
            'photo' => $photoBrightness / 100.0,
            'scrim' => $textBackground / 100.0,
            'text_position' => $textPosition,
            'elements' => $elements,
            'panelled' => $panelled,
            'copy_scrim_mode' => $mode,
            'copy_scrim' => $copyScrim,
            'styles' => $styles,
            'text_align' => self::resolveTextAlign($slide),
            'motion' => self::resolveMotion($slide),
            'parts' => array_combine(
                self::ELEMENT_KEYS,
                array_map(fn (string $k) => self::resolveElementMotion($slide, $k), self::ELEMENT_KEYS),
            ),
        ];
    }

    /**
     * Split one line's HTML into word spans for the word-by-word animation.
     *
     * Text nodes are split on whitespace and wrapped; tags are passed through
     * untouched so <em> keeps working and its colour still applies. Splitting
     * naively on spaces across the whole string would shred the markup.
     */
    public static function splitWordSpans(string $html): string
    {
        $parts = preg_split('/(<[^>]+>)/', $html, -1, PREG_SPLIT_DELIM_CAPTURE);
        if ($parts === false) {
            return $html;
        }

        $out = '';
        $i = 0;
        foreach ($parts as $part) {
            if ($part === '') {
                continue;
            }
            if ($part[0] === '<') {
                $out .= $part;

                continue;
            }
            foreach (preg_split('/(\s+)/u', $part, -1, PREG_SPLIT_DELIM_CAPTURE) ?: [] as $chunk) {
                if ($chunk === '') {
                    continue;
                }
                if (trim($chunk) === '') {
                    $out .= $chunk;

                    continue;
                }
                $out .= '<span class="hero-word" style="--hero-word-i: '.$i.';">'.$chunk.'</span>';
                $i++;
            }
        }

        return $out;
    }

    /** How the text arrives when a slide appears. */
    public const TEXT_ANIMS = ['none', 'fade', 'line', 'word', 'zoom'];

    /** What moves on the coloured boxes behind the words. */
    public const BOX_ANIMS = ['none', 'glow', 'drift', 'sheen'];

    /** What the photo itself does. */
    public const PHOTO_ANIMS = ['none', 'zoom', 'pan'];

    /**
     * Motion settings — owner asked for animations on both the text and the
     * background (2026-08-17) and picked every option offered.
     *
     * Defaults keep today's behaviour: the hero already fades-and-rises via a
     * plain CSS animation, so 'fade' is the default text motion and nothing
     * moves in the background unless asked. Everything is switched off wholesale
     * under prefers-reduced-motion in the stylesheet, which is where that
     * belongs — a viewer's accessibility setting is not the owner's to override.
     *
     * @param  array<string, mixed>  $slide
     * @return array{text: string, delay_step: int, box: string, photo: string, speed: string}
     */
    public static function resolveMotion(array $slide): array
    {
        $pick = function (string $key, array $allowed, string $default) use ($slide): string {
            $raw = strtolower(trim((string) ($slide[$key] ?? '')));

            return in_array($raw, $allowed, true) ? $raw : $default;
        };

        // Per-line and per-word need a stagger; the others ignore it.
        $step = self::intInRange($slide['text_anim_stagger'] ?? null, 90, 0, 400);

        return [
            'text' => $pick('text_anim', self::TEXT_ANIMS, 'fade'),
            'delay_step' => $step,
            'box' => $pick('box_anim', self::BOX_ANIMS, 'none'),
            'photo' => $pick('photo_anim', self::PHOTO_ANIMS, 'none'),
            'speed' => self::motionSpeed($slide['motion_speed'] ?? null),
        ];
    }

    /** 0–100 slider → a CSS duration multiplier from calm to brisk. */
    private static function motionSpeed(mixed $raw): string
    {
        $n = self::numberOrNull($raw);
        if ($n === null) {
            return '1';
        }

        // 0 = half speed (slower, calmer), 100 = double speed.
        return self::trimFloat(0.5 + (self::clamp100($n) / 100.0) * 1.5);
    }

    /**
     * Motion and alignment for one part of the slide.
     *
     * Owner, 2026-08-17: "Setting that can be separated make it separate for
     * each part … I think alignment also be separated. Why not?" Animation and
     * alignment used to be one choice for the whole slide, which meant the
     * heading and subheading had to behave identically.
     *
     * Each falls back to the slide-wide value, so a slide that has only ever
     * set the slide-wide one keeps behaving exactly as it did, and the
     * slide-wide control still works as a way to set everything at once.
     *
     * @param  array<string, mixed>  $slide
     * @return array{text: string, box: string, align: string}
     */
    public static function resolveElementMotion(array $slide, string $key): array
    {
        $slideMotion = self::resolveMotion($slide);

        $pick = function (string $field, array $allowed, string $default) use ($slide): string {
            $raw = strtolower(trim((string) ($slide[$field] ?? '')));

            return in_array($raw, $allowed, true) ? $raw : $default;
        };

        return [
            'text' => $pick("{$key}_anim", self::TEXT_ANIMS, $slideMotion['text']),
            // Only the heading and subheading draw boxes worth animating.
            'box' => in_array($key, self::STYLED_KEYS, true)
                ? $pick("{$key}_box_anim", self::BOX_ANIMS, $slideMotion['box'])
                : 'none',
            'align' => $pick("{$key}_align", self::TEXT_ALIGNMENTS, self::resolveTextAlign($slide)),
        ];
    }

    /** Elements that carry the full text-style controls. */
    public const STYLED_KEYS = ['title', 'subtitle'];

    public const TEXT_ALIGNMENTS = ['left', 'center', 'right'];

    /**
     * Per-element text style — colours, outlines, borders, geometry and type.
     *
     * Owner, 2026-08-17, asking for the settings the hero was still missing:
     *   "separate outline options for font and the background box also and
     *    option to select outline colors … there is font outline options but
     *    when background is selected cant add font outline and its color is
     *    limited … can't select font color. Need to change normal font color
     *    and <em> part font color … more color options for background."
     *
     * Two structural problems sat behind that list. The letter outline was a
     * SHAPE, so choosing a box removed it — the two could never coexist. And
     * every colour on the element was derived from the one background token, so
     * the outline could not have a colour of its own and the text could not be
     * coloured at all.
     *
     * Outline and border are now independent switches with their own colours,
     * and the text has its own colours. Everything returns null when unset so
     * the renderer leaves the stylesheet default alone, which is what keeps
     * existing slides looking exactly as they do.
     *
     * @param  array<string, mixed>  $slide
     * @return array{
     *     text_color: ?string, em_color: ?string,
     *     outline: bool, outline_color: ?string, outline_width: ?string,
     *     border: bool, border_color: ?string, border_width: ?string,
     *     bg_color2: ?string, bg_angle: int, radius: ?string, pad_x: ?string, pad_y: ?string,
     *     font_scale: ?string, font_weight: ?int
     * }
     */
    public static function resolveElementStyle(array $slide, string $key): array
    {
        $bg = self::resolveElementBackground($slide, $key);

        // The outline used to be implied by the shape. Keep that reading when
        // the owner has not said otherwise, so upgrading changes nothing.
        $outlineRaw = $slide["{$key}_outline"] ?? null;
        $outline = ($outlineRaw === null || $outlineRaw === '')
            ? ($bg['shape'] === self::SHAPE_OUTLINE && $bg['css'] !== null && $bg['css'] !== 'transparent')
            : self::truthyFlag($outlineRaw);

        // …and it used to borrow the background's colour, for the same reason.
        $outlineColor = self::cssColor($slide["{$key}_outline_color"] ?? null);
        if ($outline && $outlineColor === null) {
            $outlineColor = $bg['css'] !== 'transparent' ? $bg['css'] : null;
        }

        $border = self::truthyFlag($slide["{$key}_border"] ?? false);
        $borderColor = self::cssColor($slide["{$key}_border_color"] ?? null);

        return [
            'text_color' => self::cssColor($slide["{$key}_text_color"] ?? null),
            'em_color' => self::cssColor($slide["{$key}_em_color"] ?? null),
            'outline' => $outline,
            'outline_color' => $outlineColor,
            'outline_width' => self::emStep($slide["{$key}_outline_width"] ?? null, 0.02, 0.005, 0.06),
            'border' => $border,
            'border_color' => $borderColor ?? 'rgba(255,255,255,0.28)',
            'border_width' => self::pxStep($slide["{$key}_border_width"] ?? null, 1.5, 0.0, 8.0),
            'bg_color2' => self::cssColor($slide["{$key}_bg_color2"] ?? null),
            'bg_angle' => self::intInRange($slide["{$key}_bg_angle"] ?? null, 135, 0, 360),
            'radius' => self::pxStep($slide["{$key}_bg_radius"] ?? null, null, 0.0, 40.0),
            'pad_x' => self::emStep($slide["{$key}_bg_pad_x"] ?? null, null, 0.0, 2.0),
            'pad_y' => self::emStep($slide["{$key}_bg_pad_y"] ?? null, null, 0.0, 1.5),
            'font_scale' => self::ratio($slide["{$key}_font_scale"] ?? null, 50, 200),
            'font_weight' => self::fontWeight($slide["{$key}_font_weight"] ?? null),
        ];
    }

    /**
     * The element's style as CSS custom properties.
     *
     * Everything unset is simply omitted, so the stylesheet's own value wins
     * and a slide that has never been styled renders byte-for-byte as before.
     * Lockstep with heroElementStyleVars() in heroSlidePresentation.ts.
     *
     * @param  array<string, mixed>  $slide
     * @return array<string, string>
     */
    public static function elementStyleVars(array $slide, string $key): array
    {
        $bg = self::resolveElementBackground($slide, $key);
        $st = self::resolveElementStyle($slide, $key);
        $vars = [];

        // A second colour turns the flat fill into a gradient.
        if ($bg['css'] !== null && $bg['css'] !== 'transparent') {
            $vars['--hero-el-bg'] = $st['bg_color2'] !== null
                ? 'linear-gradient('.$st['bg_angle'].'deg, '.$bg['css'].', '.$st['bg_color2'].')'
                : $bg['css'];
        }

        if ($st['text_color'] !== null) {
            $vars['--hero-el-text'] = $st['text_color'];
        }
        if ($st['em_color'] !== null) {
            $vars['--hero-el-em'] = $st['em_color'];
        }
        if ($st['outline'] && $st['outline_color'] !== null) {
            $vars['--hero-el-outline'] = $st['outline_color'];
            $vars['--hero-el-outline-w'] = $st['outline_width'];
        }
        if ($st['border']) {
            $vars['--hero-el-border'] = $st['border_color'];
            $vars['--hero-el-border-w'] = $st['border_width'];
        }
        foreach ([['radius', '--hero-el-radius'], ['pad_x', '--hero-el-pad-x'], ['pad_y', '--hero-el-pad-y'], ['font_scale', '--hero-el-scale']] as [$from, $to]) {
            if ($st[$from] !== null) {
                $vars[$to] = (string) $st[$from];
            }
        }
        if ($st['font_weight'] !== null) {
            $vars['--hero-el-weight'] = (string) $st['font_weight'];
        }

        return $vars;
    }

    /** The same properties as a ready-to-print inline style attribute value. */
    public static function elementStyleAttr(array $slide, string $key): string
    {
        $out = [];
        foreach (self::elementStyleVars($slide, $key) as $k => $v) {
            $out[] = $k.': '.$v.';';
        }

        return implode(' ', $out);
    }

    /** Slide-level horizontal alignment for the whole copy stack. */
    public static function resolveTextAlign(array $slide): string
    {
        $raw = strtolower(trim((string) ($slide['text_align'] ?? 'center')));

        return in_array($raw, self::TEXT_ALIGNMENTS, true) ? $raw : 'center';
    }

    /**
     * Accept #rgb, #rrggbb or an rgba() we produced ourselves; reject anything
     * else so a stored value can never break out of the style attribute.
     */
    private static function cssColor(mixed $raw): ?string
    {
        if ($raw === null) {
            return null;
        }
        $v = trim((string) $raw);
        if ($v === '') {
            return null;
        }
        if (preg_match('/^#([0-9a-f]{3}|[0-9a-f]{6})$/i', $v) === 1) {
            return strtolower($v);
        }
        if (preg_match('/^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\)$/i', $v) === 1) {
            return $v;
        }

        return null;
    }

    /** 0–100 slider → an em length, or the default when unset. */
    private static function emStep(mixed $raw, ?float $default, float $min, float $max): ?string
    {
        $n = self::numberOrNull($raw);
        if ($n === null) {
            return $default === null ? null : self::trimFloat($default).'em';
        }
        $v = $min + (self::clamp100($n) / 100.0) * ($max - $min);

        return self::trimFloat($v).'em';
    }

    /** 0–100 slider → a px length, or the default when unset. */
    private static function pxStep(mixed $raw, ?float $default, float $min, float $max): ?string
    {
        $n = self::numberOrNull($raw);
        if ($n === null) {
            return $default === null ? null : self::trimFloat($default).'px';
        }
        $v = $min + (self::clamp100($n) / 100.0) * ($max - $min);

        return self::trimFloat($v).'px';
    }

    /** Percentage stored 50–200 → a unitless CSS multiplier. */
    private static function ratio(mixed $raw, float $min, float $max): ?string
    {
        $n = self::numberOrNull($raw);
        if ($n === null) {
            return null;
        }

        return self::trimFloat(max($min, min($max, $n)) / 100.0);
    }

    private static function fontWeight(mixed $raw): ?int
    {
        $n = self::numberOrNull($raw);
        if ($n === null) {
            return null;
        }
        $w = (int) round($n / 100.0) * 100;

        return max(100, min(900, $w));
    }

    private static function intInRange(mixed $raw, int $default, int $min, int $max): int
    {
        $n = self::numberOrNull($raw);
        if ($n === null) {
            return $default;
        }

        return (int) max($min, min($max, round($n)));
    }

    private static function numberOrNull(mixed $raw): ?float
    {
        if ($raw === null || $raw === '' || ! is_numeric($raw)) {
            return null;
        }

        return (float) $raw;
    }

    private static function trimFloat(float $v): string
    {
        return rtrim(rtrim(number_format($v, 4, '.', ''), '0'), '.') ?: '0';
    }

    /** Background shapes for the heading and subheading. */
    public const SHAPE_LINE = 'line';

    public const SHAPE_HUG = 'hug';

    public const SHAPE_FULL = 'full';

    public const SHAPE_OUTLINE = 'outline';

    public const SHAPES = [self::SHAPE_LINE, self::SHAPE_HUG, self::SHAPE_FULL, self::SHAPE_OUTLINE];

    /**
     * What shape the element's background is drawn in.
     *
     * Owner, 2026-08-17: "If there are 2 lines background is like a box. I need
     * separate small background for each line." Until now the shape was implied
     * by two other settings — glass meant one box around the whole heading, and
     * the full-width flag meant an edge-to-edge bar — so a two-line heading
     * could only ever be one rectangle. Shape is now its own choice.
     *
     * When nothing is stored the old implication is reproduced exactly, so no
     * existing slide changes appearance:
     *   full-width flag set  → full
     *   glass, no flag       → hug   (the single panel it has always drawn)
     *   solid, no flag       → outline (letter outline + halo, no box)
     *
     * @param  array<string, mixed>  $slide
     */
    private static function resolveElementShape(array $slide, string $key, string $token, bool $fullWidth): string
    {
        if ($key !== 'title' && $key !== 'subtitle') {
            return self::SHAPE_HUG;
        }

        $stored = strtolower(trim((string) ($slide["{$key}_bg_shape"] ?? '')));
        if (in_array($stored, self::SHAPES, true)) {
            return $stored;
        }

        if ($fullWidth) {
            return self::SHAPE_FULL;
        }

        return $token === 'glass' ? self::SHAPE_HUG : self::SHAPE_OUTLINE;
    }

    /**
     * @param  array<string, mixed>  $slide
     * @return array{token: ?string, strength: ?int, full_width: bool, shape: string, css: ?string}
     */
    public static function resolveElementBackground(array $slide, string $key): array
    {
        $bgKey = "{$key}_bg";
        $strengthKey = "{$key}_bg_strength";
        $fullKey = "{$key}_bg_full_width";

        $raw = $slide[$bgKey] ?? null;
        if ($raw === null || $raw === '') {
            return ['token' => null, 'strength' => null, 'full_width' => false, 'shape' => self::SHAPE_OUTLINE, 'css' => null];
        }

        $token = strtolower(trim((string) $raw));
        $hasStrength = array_key_exists($strengthKey, $slide) && $slide[$strengthKey] !== null && $slide[$strengthKey] !== '';
        $strength = $hasStrength ? self::clamp100((float) $slide[$strengthKey]) : 70;
        $fullWidth = false;
        if ($key === 'title' || $key === 'subtitle') {
            $fullWidth = self::truthyFlag($slide[$fullKey] ?? false);
        }
        $shape = self::resolveElementShape($slide, $key, $token, $fullWidth);

        if ($token === 'none') {
            return ['token' => 'none', 'strength' => $strength, 'full_width' => $fullWidth, 'shape' => $shape, 'css' => 'transparent'];
        }

        // Frosted glass — same family as secondary CTA (white wash + blur via CSS).
        // Strength maps to fill opacity (10 ≈ button-2 look).
        if ($token === 'glass') {
            $alpha = max(0.02, min(0.45, $strength / 100.0));

            return [
                'token' => 'glass',
                'strength' => $strength,
                'full_width' => $fullWidth,
                'shape' => $shape,
                'css' => 'rgba(255,255,255,'.$alpha.')',
            ];
        }

        $rgb = self::BG_TOKEN_RGB[$token] ?? self::hexToRgb($token);
        if ($rgb === null) {
            return ['token' => null, 'strength' => null, 'full_width' => false, 'shape' => self::SHAPE_OUTLINE, 'css' => null];
        }

        $alpha = $strength / 100.0;

        return [
            'token' => $token,
            'strength' => $strength,
            'full_width' => $fullWidth,
            'shape' => $shape,
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

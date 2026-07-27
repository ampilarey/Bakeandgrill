<?php

declare(strict_types=1);

namespace App\Domains\Content;

/**
 * Derives website accent tokens (--amber*) from a brand primary hex.
 * Deterministic, server-side — no runtime JS.
 */
final class BrandPalette
{
    public const DARK_TEXT = '#1C1408';

    public const LIGHT_TEXT = '#FFFDF9';

    /**
     * @return array{
     *   hex: string,
     *   light: array{amber: string, amber_hover: string, amber_light: string, amber_glow: string, amber_contrast: string},
     *   dark: array{amber: string, amber_hover: string, amber_light: string, amber_glow: string, amber_contrast: string},
     *   css: string
     * }|null
     */
    public static function from(?string $raw): ?array
    {
        $hex = self::normalizeHex($raw);
        if ($hex === null) {
            return null;
        }

        $rgb = self::hexToRgb($hex);
        $lightAmber = $hex;
        $lightHover = self::rgbToHex(self::darken($rgb, 0.12));
        $lightTint = self::rgbToHex(self::mixWithWhite($rgb, 0.92));
        $lightGlow = self::rgba($rgb, 0.22);
        $lightContrast = self::contrastOn($rgb);

        $darkRgb = self::lighten($rgb, 0.10);
        $darkAmber = self::rgbToHex($darkRgb);
        $darkHover = self::rgbToHex(self::darken($darkRgb, 0.12));
        $darkTint = self::rgba($darkRgb, 0.15);
        $darkGlow = self::rgba($darkRgb, 0.22);
        $darkContrast = self::contrastOn($darkRgb);

        $light = [
            'amber' => $lightAmber,
            'amber_hover' => $lightHover,
            'amber_light' => $lightTint,
            'amber_glow' => $lightGlow,
            'amber_contrast' => $lightContrast,
        ];
        $dark = [
            'amber' => $darkAmber,
            'amber_hover' => $darkHover,
            'amber_light' => $darkTint,
            'amber_glow' => $darkGlow,
            'amber_contrast' => $darkContrast,
        ];

        $css = self::toCss($light, $dark);

        return [
            'hex' => $hex,
            'light' => $light,
            'dark' => $dark,
            'css' => $css,
        ];
    }

    public static function normalizeHex(?string $raw): ?string
    {
        if ($raw === null) {
            return null;
        }

        $value = trim($raw);
        if ($value === '') {
            return null;
        }

        if (! preg_match('/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/', $value)) {
            return null;
        }

        if (strlen($value) === 4) {
            $r = $value[1];
            $g = $value[2];
            $b = $value[3];
            $value = "#{$r}{$r}{$g}{$g}{$b}{$b}";
        }

        return strtoupper($value);
    }

    /**
     * @param  array{r: int, g: int, b: int}  $rgb
     */
    public static function relativeLuminance(array $rgb): float
    {
        $channels = array_map(static function (int $c): float {
            $s = $c / 255;
            return $s <= 0.03928 ? $s / 12.92 : (($s + 0.055) / 1.055) ** 2.4;
        }, [$rgb['r'], $rgb['g'], $rgb['b']]);

        return 0.2126 * $channels[0] + 0.7152 * $channels[1] + 0.0722 * $channels[2];
    }

    /**
     * @param  array{r: int, g: int, b: int}  $rgb
     */
    public static function contrastOn(array $rgb): string
    {
        // Prefer dark text on light brand colours (matches #1C1408 on #D4813A).
        return self::relativeLuminance($rgb) >= 0.35 ? self::DARK_TEXT : self::LIGHT_TEXT;
    }

    /**
     * @return array{r: int, g: int, b: int}
     */
    private static function hexToRgb(string $hex): array
    {
        return [
            'r' => (int) hexdec(substr($hex, 1, 2)),
            'g' => (int) hexdec(substr($hex, 3, 2)),
            'b' => (int) hexdec(substr($hex, 5, 2)),
        ];
    }

    /**
     * @param  array{r: int, g: int, b: int}  $rgb
     */
    private static function rgbToHex(array $rgb): string
    {
        return sprintf('#%02X%02X%02X', $rgb['r'], $rgb['g'], $rgb['b']);
    }

    /**
     * @param  array{r: int, g: int, b: int}  $rgb
     * @return array{r: int, g: int, b: int}
     */
    private static function darken(array $rgb, float $amount): array
    {
        $factor = max(0.0, 1.0 - $amount);

        return [
            'r' => (int) round($rgb['r'] * $factor),
            'g' => (int) round($rgb['g'] * $factor),
            'b' => (int) round($rgb['b'] * $factor),
        ];
    }

    /**
     * @param  array{r: int, g: int, b: int}  $rgb
     * @return array{r: int, g: int, b: int}
     */
    private static function lighten(array $rgb, float $amount): array
    {
        return [
            'r' => (int) round($rgb['r'] + (255 - $rgb['r']) * $amount),
            'g' => (int) round($rgb['g'] + (255 - $rgb['g']) * $amount),
            'b' => (int) round($rgb['b'] + (255 - $rgb['b']) * $amount),
        ];
    }

    /**
     * @param  array{r: int, g: int, b: int}  $rgb
     * @return array{r: int, g: int, b: int}
     */
    private static function mixWithWhite(array $rgb, float $whiteAmount): array
    {
        $t = max(0.0, min(1.0, $whiteAmount));

        return [
            'r' => (int) round($rgb['r'] * (1 - $t) + 255 * $t),
            'g' => (int) round($rgb['g'] * (1 - $t) + 255 * $t),
            'b' => (int) round($rgb['b'] * (1 - $t) + 255 * $t),
        ];
    }

    /**
     * @param  array{r: int, g: int, b: int}  $rgb
     */
    private static function rgba(array $rgb, float $alpha): string
    {
        $a = rtrim(rtrim(number_format($alpha, 2, '.', ''), '0'), '.');

        return "rgba({$rgb['r']},{$rgb['g']},{$rgb['b']},{$a})";
    }

    /**
     * @param  array{amber: string, amber_hover: string, amber_light: string, amber_glow: string, amber_contrast: string}  $light
     * @param  array{amber: string, amber_hover: string, amber_light: string, amber_glow: string, amber_contrast: string}  $dark
     */
    private static function toCss(array $light, array $dark): string
    {
        return <<<CSS
:root {
            --amber: {$light['amber']};
            --amber-hover: {$light['amber_hover']};
            --amber-light: {$light['amber_light']};
            --amber-glow: {$light['amber_glow']};
            --amber-contrast: {$light['amber_contrast']};
        }
        [data-theme="dark"] {
            --amber: {$dark['amber']};
            --amber-hover: {$dark['amber_hover']};
            --amber-light: {$dark['amber_light']};
            --amber-glow: {$dark['amber_glow']};
            --amber-contrast: {$dark['amber_contrast']};
        }
CSS;
    }
}

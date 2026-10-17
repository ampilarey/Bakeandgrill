<?php

declare(strict_types=1);

namespace App\Domains\Posters;

/**
 * What one print shop asks for (docs/POSTER_PLAN.md § 9 and § 14).
 * Masks are the default. Spot layers are written only when the shop says so.
 */
final class PrintShopPrefs
{
    /** @var array<string, mixed> */
    public const DEFAULTS = [
        'pdfx' => 'PDF/X-4',
        'profile' => 'FOGRA39',
        'bleed_mm' => 3,
        'crop_marks' => false,
        'white_name' => 'White',
        'gloss_name' => 'Spot UV',
        'layers' => 'masks',
    ];

    /** @param array<string, mixed>|null $prefs @return array<string, mixed> */
    public static function normalize(?array $prefs): array
    {
        $prefs ??= [];
        $out = self::DEFAULTS;
        foreach (['pdfx', 'profile', 'white_name', 'gloss_name'] as $key) {
            if (isset($prefs[$key]) && is_string($prefs[$key]) && trim($prefs[$key]) !== '') {
                $out[$key] = trim($prefs[$key]);
            }
        }
        $out['bleed_mm'] = ((int) ($prefs['bleed_mm'] ?? 3)) === 5 ? 5 : 3;
        $out['crop_marks'] = (bool) ($prefs['crop_marks'] ?? false);
        $out['layers'] = ($prefs['layers'] ?? '') === 'spots' ? 'spots' : 'masks';

        return $out;
    }
}

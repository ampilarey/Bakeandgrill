<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Absolute URL for a public media path, matching Item::display_image_url:
 * locally-hosted cafe images are rebuilt against this origin so a TEST
 * database still renders on production.
 */
final class PublicMediaUrl
{
    public static function absolute(mixed $raw): ?string
    {
        $raw = trim((string) $raw);
        if ($raw === '') {
            return null;
        }
        if (!str_starts_with($raw, 'http')) {
            return url(ltrim($raw, '/'));
        }
        $path = trim((string) preg_replace('#^https?://[^/]+#', '', $raw), '/');

        return str_starts_with($path, 'images/cafe/') ? url($path) : $raw;
    }
}

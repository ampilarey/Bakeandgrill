<?php

declare(strict_types=1);

namespace App\Domains\Posters;

use App\Support\ComplaintBoxLink;

/**
 * The small code on a printed poster. Scanning /p/{code} opens the dish
 * or offer and counts the scan. The address is the live site's, as the
 * batch QR is, so a poster printed from TEST still scans to bakeandgrill.mv.
 */
final class PosterLink
{
    public static function url(string $code): string
    {
        return ComplaintBoxLink::site() . '/p/' . rawurlencode($code);
    }

    public static function path(string $code): string
    {
        return '/p/' . rawurlencode($code);
    }

    public static function valid(string $code): bool
    {
        return preg_match('/^P\d{4,8}$/', $code) === 1;
    }
}

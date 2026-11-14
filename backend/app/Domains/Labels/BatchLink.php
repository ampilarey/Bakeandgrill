<?php

declare(strict_types=1);

namespace App\Domains\Labels;

use App\Support\ComplaintBoxLink;
use App\Support\QrSvg;

/**
 * The batch QR on a pack sticker (2026-10-12): a short code per print that
 * opens the pack's public page, /b/{code}, with its dates, batch,
 * ingredients and allergens. The address is the live site's, as the
 * complaints QR is (owner, 2026-09-19: "Qr code should be of live site"),
 * so a sticker printed from TEST or a laptop still scans to bakeandgrill.mv.
 */
final class BatchLink
{
    /** The code a preview sticker carries: the sheet shows the QR, nothing is logged. */
    public const PREVIEW = 'PREVIEW';

    public static function url(string $code): string
    {
        return ComplaintBoxLink::site() . '/b/' . rawurlencode($code);
    }

    /** The path on this site, for the print log's links. */
    public static function path(string $code): string
    {
        return '/b/' . rawurlencode($code);
    }

    public static function valid(string $code): bool
    {
        return preg_match('/^[A-Z0-9]{4,12}$/', $code) === 1;
    }

    /**
     * The bare code as an SVG data URI; it prints small, so no logo.
     *
     * The address goes in capitals (owner, 2026-11-14: "too small and denser difficult to scan"): a QR packs
     * capitals, digits and ./: far tighter than mixed case, so the same address needs 25 squares a side, not 29,
     * and each square prints a sixth bigger. A phone opens HTTPS://…/B/CODE as it opens the lower-case one, and
     * the site answers on /B/ too.
     */
    public static function qr(string $code): string
    {
        return QrSvg::dataUri(mb_strtoupper(self::url($code)), 160);
    }
}

<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Where the complaint box lives, for every place that prints or shows a
 * way in: the poster, the receipt page, the receipt PDF and the thermal
 * slip.
 *
 * Owner, 2026-09-19: "Qr code should be of live site". The address is the
 * Business Website setting, never the host the page happens to be served
 * from, so a QR printed from the TEST site or a laptop still lands on
 * bakeandgrill.mv.
 */
final class ComplaintBoxLink
{
    public const FALLBACK_SITE = 'https://bakeandgrill.mv';

    public static function site(): string
    {
        $configured = (string) content('business_website', self::FALLBACK_SITE);

        return rtrim((string) (safe_public_url($configured) ?? self::FALLBACK_SITE), '/');
    }

    /** @param  string  $from  web|receipt|poster — what the Complaint Box shows as "via …" */
    public static function url(string $from, ?string $orderNumber = null): string
    {
        $url = self::site() . '/complain?from=' . rawurlencode($from);
        if ($orderNumber !== null && trim($orderNumber) !== '') {
            $url .= '&order=' . rawurlencode(trim($orderNumber));
        }

        return $url;
    }

    /** The QR with room for the logo in the middle, as a `data:` URI. */
    public static function qr(string $url, int $size = 200): string
    {
        return QrSvg::dataUri($url, $size, withLogoSpace: true);
    }

    /**
     * The logo as a `data:` URI when the file is on this server, so a print
     * or a "Save as PDF" carries it whatever the network is doing. A blank
     * CMS value falls back to the bundled logo rather than a broken image.
     */
    public static function logo(): string
    {
        $url = trim((string) content('logo', ''));
        if ($url === '') {
            $url = asset('logo.png');
        }
        $path = (string) (parse_url($url, PHP_URL_PATH) ?: '');
        $local = public_path(ltrim($path, '/'));
        if ($path !== '' && is_file($local) && preg_match('/\.(png|jpe?g|webp|svg)$/i', $local)) {
            $mime = str_ends_with(strtolower($local), '.svg') ? 'image/svg+xml' : (mime_content_type($local) ?: 'image/png');
            $bytes = file_get_contents($local);
            if ($bytes !== false) {
                return 'data:' . $mime . ';base64,' . base64_encode($bytes);
            }
        }

        return $url;
    }
}

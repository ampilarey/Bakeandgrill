<?php

declare(strict_types=1);

namespace App\Domains\Reporting\Support;

/**
 * The page and the place a visit came from, made safe to keep and easy to
 * group. A tracking link, a gift card or a quote carries a secret in its
 * address (`/order/track/{token}`), so long or numeric segments become
 * `:token` / `:id`; the query string is never kept. A referrer keeps its
 * host alone, and our own host counts as no referrer.
 */
final class VisitPath
{
    public static function clean(string $path): string
    {
        $path = (string) parse_url('/' . ltrim(trim($path), '/'), PHP_URL_PATH);
        $parts = array_values(array_filter(explode('/', $path), fn ($p) => $p !== ''));
        $parts = array_map(static function (string $seg): string {
            if (ctype_digit($seg)) {
                return ':id';
            }
            // A token: long, or a mix of letters and digits that no slug would use.
            if (strlen($seg) >= 20 || (strlen($seg) >= 8 && preg_match('/\d/', $seg) && preg_match('/[A-Za-z]/', $seg) && !str_contains($seg, '-'))) {
                return ':token';
            }

            return mb_substr($seg, 0, 60);
        }, $parts);

        return mb_substr('/' . implode('/', $parts), 0, 255);
    }

    public static function referrerHost(?string $referrer, ?string $ownHost): ?string
    {
        if (!$referrer) {
            return null;
        }
        $host = strtolower((string) parse_url($referrer, PHP_URL_HOST));
        $host = preg_replace('/^www\./', '', $host) ?? $host;
        $own = $ownHost ? (preg_replace('/^www\./', '', strtolower($ownHost)) ?? '') : '';
        if ($host === '' || ($own !== '' && $host === $own)) {
            return null;
        }

        return mb_substr($host, 0, 120);
    }

    /** A referrer host as people know it: "Google", "Facebook", else the host. */
    public static function sourceName(?string $host): string
    {
        if ($host === null || $host === '') {
            return 'Direct or app';
        }
        $map = [
            '/(^|\.)google\./' => 'Google',
            '/(^|\.)bing\.com$/' => 'Bing',
            '/(^|\.)yahoo\./' => 'Yahoo',
            '/duckduckgo\.com$/' => 'DuckDuckGo',
            '/(^|\.)(facebook\.com|fb\.com|fb\.me)$/' => 'Facebook',
            '/(^|\.)instagram\.com$/' => 'Instagram',
            '/^(t\.co|x\.com|twitter\.com)$/' => 'X (Twitter)',
            '/(^|\.)tiktok\.com$/' => 'TikTok',
            '/(^|\.)youtube\.com$|^youtu\.be$/' => 'YouTube',
            '/(^|\.)linkedin\.com$|^lnkd\.in$/' => 'LinkedIn',
            '/(^|\.)whatsapp\.com$|^wa\.me$/' => 'WhatsApp',
            '/(^|\.)viber\.com$/' => 'Viber',
            '/(^|\.)telegram\.(org|me)$|^t\.me$/' => 'Telegram',
            '/(^|\.)tripadvisor\./' => 'Tripadvisor',
        ];
        foreach ($map as $pattern => $name) {
            if (preg_match($pattern, $host)) {
                return $name;
            }
        }

        return $host;
    }
}

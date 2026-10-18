<?php

declare(strict_types=1);

namespace App\Support;

use App\Domains\Content\ContentResolver;

/**
 * Dhivehi addresses for the public website (iruali import plan, feature 3b).
 *
 * A public page answers in English at its usual address and in Dhivehi under
 * /dv/... (LocalePrefix strips the prefix before routing). Account, checkout,
 * admin and any other page that is not public has no /dv address. The order app
 * keeps its language in the account, not the URL.
 */
final class LocaleUrl
{
    /** Paths with a Dhivehi address: exact, or a prefix ending in "/". */
    private const PUBLIC = ['/', '/menu', '/menu/', '/hours', '/contact', '/terms', '/refund', '/privacy', '/offers/', '/prayer-times', '/prayer-times/'];

    /** Never under /dv, even inside a public prefix. */
    private const NEVER = ['/menu/print'];

    public static function isPublic(string $path): bool
    {
        $path = '/' . ltrim($path, '/');
        foreach (self::NEVER as $no) {
            if (str_starts_with($path, $no)) {
                return false;
            }
        }
        foreach (self::PUBLIC as $p) {
            if ($p === $path || (str_ends_with($p, '/') && $p !== '/' && str_starts_with($path, $p))) {
                return true;
            }
        }

        return false;
    }

    /** "Dhivehi on the website and in the order app" (Admin → Website). */
    public static function dhivehiOn(): bool
    {
        try {
            return filter_var(ContentResolver::for('website')->get('language_switcher_enabled', 'false'), FILTER_VALIDATE_BOOLEAN);
        } catch (\Throwable) {
            return false;
        }
    }

    /** The page's address in one language: "/menu" ↔ "/dv/menu". */
    public static function to(string $path, string $locale): string
    {
        $path = '/' . ltrim(preg_replace('#^/?dv(?=/|$)#', '', $path) ?? $path, '/');

        return $locale === 'dv' && self::isPublic($path) ? rtrim('/dv' . ($path === '/' ? '' : $path), '/') ?: '/dv' : $path;
    }

    /** @return array{en: string, dv: string, x-default: string} absolute alternates for a public path */
    public static function alternates(string $path): array
    {
        $en = url(self::to($path, 'en'));

        return ['en' => $en, 'dv' => url(self::to($path, 'dv')), 'x-default' => $en];
    }
}

<?php

declare(strict_types=1);

namespace App\Support;

use Illuminate\Http\Request;

/**
 * What search engines may index (website audit, 2026-10-01).
 *
 * Two things were open. robots.txt was a static file saying "index
 * everything", served the same to the TEST site, so test.bakeandgrill.mv could
 * be indexed alongside the real site with test prices and test orders. And
 * the token pages (receipts, invoices, pay links, SMS preferences, the social
 * approval page) carried no noindex. A token link is private only until
 * someone posts it somewhere public, and then a customer's name, phone and
 * order could be indexed.
 */
final class SearchVisibility
{
    /** Paths no search engine has any business indexing. */
    public const PRIVATE_PREFIXES = [
        '/receipts/', '/invoices/', '/pay/', '/payments/', '/social/approve/', '/sms',
        '/customer/', '/admin', '/pos', '/kds', '/driver', '/board', '/dashboard',
        '/menu/print',
        // Order app pages that belong to one customer.
        '/order/track/', '/order/orders/', '/order/checkout', '/order/quote/', '/order/gift-cards/v/',
        '/order/account', '/order/order-history', '/order/events/mine',
    ];

    public static function isTestHost(Request $request): bool
    {
        $hosts = array_map('strtolower', (array) config('deploy.test_allowed_hosts', ['test.bakeandgrill.mv']));

        return in_array(strtolower($request->getHost()), $hosts, true);
    }

    public static function isPrivatePath(string $path): bool
    {
        $path = '/' . ltrim($path, '/');
        foreach (self::PRIVATE_PREFIXES as $prefix) {
            if ($path === rtrim($prefix, '/') || str_starts_with($path, $prefix)) {
                return true;
            }
        }

        return false;
    }

    public static function robotsTxt(Request $request): string
    {
        if (self::isTestHost($request)) {
            return "User-agent: *\nDisallow: /\n";
        }

        $lines = ['User-agent: *'];
        foreach (self::PRIVATE_PREFIXES as $prefix) {
            $lines[] = 'Disallow: ' . $prefix;
        }
        $lines[] = '';
        $lines[] = 'Sitemap: ' . rtrim($request->getSchemeAndHttpHost(), '/') . '/sitemap.xml';

        return implode("\n", $lines) . "\n";
    }
}

<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use Illuminate\Http\Response;

/**
 * sitemap.xml — the list of pages we are asking Google to index.
 *
 * Only pages the Blade site renders on the server belong here. The ordering
 * app at /order is a React SPA: a crawler fetching it receives
 * `<div id="root"></div>` and nothing else, so listing it would invite Google
 * to index an empty page. It is linked from the site's navigation, which is
 * the right way for it to be discovered.
 *
 * The menu is the notable absence. It currently exists only inside the SPA
 * (/order/menu, and the dine-in view at /order/view), so there is no menu URL
 * a crawler can read. Once the server-rendered /menu page exists, add it here
 * — it is the page most worth indexing on the whole site.
 *
 * Deliberately no <lastmod>. We have no honest per-page modification date, and
 * a made-up one is worse than none: Google learns to distrust the whole file.
 */
class SitemapController extends Controller
{
    /**
     * Public pages, in rough order of importance.
     *
     * Hand-maintained on purpose. Deriving this from the router would sweep in
     * customer-portal pages, previews and API routes, and the cost of getting
     * that filter wrong is telling Google to index a login form.
     *
     * @var list<array{route: string, priority: string, changefreq: string}>
     */
    private const PAGES = [
        ['route' => 'home', 'priority' => '1.0', 'changefreq' => 'weekly'],
        ['route' => 'hours', 'priority' => '0.8', 'changefreq' => 'weekly'],
        ['route' => 'contact', 'priority' => '0.8', 'changefreq' => 'monthly'],
        ['route' => 'prayer-times.index', 'priority' => '0.6', 'changefreq' => 'daily'],
        ['route' => 'terms', 'priority' => '0.3', 'changefreq' => 'yearly'],
        ['route' => 'refund', 'priority' => '0.3', 'changefreq' => 'yearly'],
    ];

    public function index(): Response
    {
        $urls = [];

        foreach (self::PAGES as $page) {
            if (!app('router')->has($page['route'])) {
                // A renamed or removed route must not take the whole sitemap
                // down with a RouteNotFoundException.
                continue;
            }

            $base = route($page['route']);
            $urls[] = $this->urlEntry($base, $page['priority'], $page['changefreq']);
        }

        $body = implode('', $urls);

        return response(
            '<?xml version="1.0" encoding="UTF-8"?>' . "\n"
            . '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'
            . ' xmlns:xhtml="http://www.w3.org/1999/xhtml">' . "\n"
            . $body
            . '</urlset>' . "\n",
            200,
            [
                'Content-Type' => 'application/xml; charset=UTF-8',
                // Crawlers re-fetch this rarely; an hour is plenty and keeps a
                // new page from waiting a day to be advertised.
                'Cache-Control' => 'public, max-age=3600',
            ],
        );
    }

    /**
     * One <url> block, with both language versions declared.
     *
     * The site serves Dhivehi off the same path via ?lang=dv. Without these
     * alternates Google treats the two as unrelated pages competing with each
     * other, rather than one page in two languages.
     */
    private function urlEntry(string $base, string $priority, string $changefreq): string
    {
        $en = $this->withLang($base, 'en');
        $dv = $this->withLang($base, 'dv');

        return "  <url>\n"
            . '    <loc>' . $this->xml($base) . "</loc>\n"
            . '    <xhtml:link rel="alternate" hreflang="en" href="' . $this->xml($en) . "\"/>\n"
            . '    <xhtml:link rel="alternate" hreflang="dv" href="' . $this->xml($dv) . "\"/>\n"
            . '    <xhtml:link rel="alternate" hreflang="x-default" href="' . $this->xml($base) . "\"/>\n"
            . '    <changefreq>' . $changefreq . "</changefreq>\n"
            . '    <priority>' . $priority . "</priority>\n"
            . "  </url>\n";
    }

    private function withLang(string $url, string $lang): string
    {
        return $url . (str_contains($url, '?') ? '&' : '?') . 'lang=' . $lang;
    }

    /** Bare `&` is not legal in XML, and every alternate URL carries one. */
    private function xml(string $value): string
    {
        return htmlspecialchars($value, ENT_XML1 | ENT_QUOTES, 'UTF-8');
    }
}

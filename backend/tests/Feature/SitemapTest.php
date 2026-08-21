<?php

declare(strict_types=1);

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The site had no sitemap at all, and robots.txt named none.
 *
 * The failures worth guarding against here are all silent: a sitemap that is
 * malformed, that advertises a page returning 404, or that lists the ordering
 * SPA — which serves a crawler an empty <div id="root"> and nothing else.
 * Google reports none of those back to you in any timely way.
 */
class SitemapTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_is_served_as_xml(): void
    {
        $this->get('/sitemap.xml')
            ->assertOk()
            ->assertHeader('Content-Type', 'application/xml; charset=UTF-8');
    }

    public function test_it_is_well_formed_xml(): void
    {
        // A sitemap that does not parse is worth exactly nothing, and nothing
        // in the normal flow of work would reveal it.
        $body = $this->get('/sitemap.xml')->getContent();

        $previous = libxml_use_internal_errors(true);
        $xml = simplexml_load_string($body);
        $errors = libxml_get_errors();
        libxml_clear_errors();
        libxml_use_internal_errors($previous);

        $this->assertNotFalse($xml, 'sitemap.xml must parse: ' . ($errors[0]->message ?? 'unknown error'));
        $this->assertSame('urlset', $xml->getName());
    }

    public function test_it_lists_the_public_pages(): void
    {
        $body = $this->get('/sitemap.xml')->getContent();

        foreach (['/', '/hours', '/contact', '/prayer-times', '/terms', '/refund'] as $path) {
            $this->assertStringContainsString(
                '<loc>' . url($path) . '</loc>',
                $body,
                "{$path} should be advertised to search engines",
            );
        }
    }

    public function test_every_advertised_url_actually_works(): void
    {
        // The failure this catches: a page is renamed or removed, and the
        // sitemap keeps sending Google to a 404 for months.
        $body = $this->get('/sitemap.xml')->getContent();
        preg_match_all('#<loc>(.*?)</loc>#', $body, $matches);

        $this->assertNotEmpty($matches[1], 'the sitemap must not be empty');

        foreach ($matches[1] as $loc) {
            $path = parse_url(html_entity_decode($loc), PHP_URL_PATH) ?: '/';
            $this->get($path)->assertOk();
        }
    }

    public function test_it_does_not_advertise_the_ordering_spa(): void
    {
        // /order and /order/menu render to an empty div without JavaScript.
        // Listing them asks Google to index a blank page, which is worse than
        // leaving them to be found through the site's own navigation.
        $body = $this->get('/sitemap.xml')->getContent();

        $this->assertStringNotContainsString('<loc>' . url('/order') . '</loc>', $body);
        $this->assertStringNotContainsString('/order/menu', $body);
        $this->assertStringNotContainsString('/order/view', $body);
    }

    public function test_it_does_not_advertise_private_or_staff_pages(): void
    {
        $body = $this->get('/sitemap.xml')->getContent();

        foreach (['/admin', '/pos', '/kds', '/driver', '/customer/login', '/preview'] as $path) {
            $this->assertStringNotContainsString($path, $body, "{$path} must never be in the sitemap");
        }
    }

    public function test_both_languages_are_declared_for_each_page(): void
    {
        // Dhivehi is served off the same path via ?lang=dv. Without the
        // alternates Google treats the two as separate pages competing with
        // each other rather than one page in two languages.
        $body = $this->get('/sitemap.xml')->getContent();

        $this->assertStringContainsString('hreflang="x-default"', $body);

        // Not just that the attributes exist — that they carry the real URL.
        foreach (['en', 'dv'] as $lang) {
            $this->assertStringContainsString(
                sprintf('hreflang="%s" href="%s"', $lang, url('/') . '?lang=' . $lang),
                $body,
                "the {$lang} version of the home page must be declared",
            );
        }

        // One alternate pair per page, plus x-default.
        $pages = substr_count($body, '<loc>');
        $this->assertSame($pages * 3, substr_count($body, '<xhtml:link'));
    }

    public function test_robots_txt_points_at_the_sitemap(): void
    {
        // A sitemap nothing references is a sitemap nothing reads.
        $robots = (string) file_get_contents(public_path('robots.txt'));

        $this->assertStringContainsString('Sitemap: https://bakeandgrill.mv/sitemap.xml', $robots);
    }
}

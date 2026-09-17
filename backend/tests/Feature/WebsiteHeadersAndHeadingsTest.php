<?php

declare(strict_types=1);

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Audit, 2026-09-17, of the public website.
 *
 * The contact page embeds a Google map in an iframe, and the site's CSP had
 * no frame-src, so the browser fell back to default-src 'self' and refused
 * it: an empty box where the map should be, on every visit. The home page
 * had no H1 at all, and the prayer-times page neither H1 nor canonical.
 */
class WebsiteHeadersAndHeadingsTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_contact_page_may_frame_the_google_map(): void
    {
        $csp = (string) $this->get('/contact')->assertOk()->headers->get('Content-Security-Policy');

        $this->assertStringContainsString('frame-src https://www.google.com https://maps.google.com', $csp);
        // Still nobody may frame us.
        $this->assertStringContainsString("frame-ancestors 'none'", $csp);
    }

    public function test_the_home_page_has_exactly_one_h1(): void
    {
        $html = $this->get('/')->assertOk()->getContent();

        $this->assertSame(1, preg_match_all('/<h1\b/i', $html), 'The home page should carry one H1: the hero title.');
        $this->assertStringContainsString('class="banner-title"', $html);
    }

    public function test_the_prayer_times_page_has_a_heading_and_a_canonical(): void
    {
        $html = $this->get('/prayer-times')->assertOk()->getContent();

        $this->assertSame(1, preg_match_all('/<h1\b/i', $html));
        $this->assertStringContainsString('<link rel="canonical" href="' . url('/prayer-times') . '">', $html);
    }
}

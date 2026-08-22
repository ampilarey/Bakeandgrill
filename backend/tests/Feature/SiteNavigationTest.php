<?php

declare(strict_types=1);

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The two menu entry points must stay two entry points.
 *
 * Until 2026-08-22 both the mobile bottom nav's "Menu" tab and its "Order"
 * button pointed at `/order/menu`, and the desktop header did the same. Two
 * tabs that do the same thing is bad enough; the worse half was that "Menu" —
 * a reading task — made you wait for the whole React bundle.
 *
 * The split now is: **Menu reads, Order buys.** Menu goes to the
 * server-rendered `/menu`, which is in the HTML before any JavaScript runs.
 * Order goes to `/order/menu`, the SPA that owns the cart and checkout.
 *
 * Collapsing them back is a one-character edit in a Blade file nobody reads,
 * which is why this test exists.
 */
class SiteNavigationTest extends TestCase
{
    use RefreshDatabase;

    private function navLinks(string $selector): string
    {
        $html = $this->get('/')->assertOk()->getContent();

        preg_match('#<nav class="' . $selector . '".*?</nav>#s', $html, $m);
        $this->assertNotEmpty($m, "the {$selector} block must be in the HTML");

        return $m[0];
    }

    public function test_the_mobile_menu_tab_opens_the_server_rendered_menu(): void
    {
        $nav = $this->navLinks('mobile-bottom-nav');

        $this->assertStringContainsString('href="/menu" class="mob-nav-item" data-nav="menu"', $nav);
    }

    public function test_the_mobile_order_tab_still_opens_the_ordering_app(): void
    {
        // The cart lives in the SPA. This tab must not follow Menu to /menu.
        $nav = $this->navLinks('mobile-bottom-nav');

        $this->assertMatchesRegularExpression(
            '#href="/order/menu"[^>]*data-nav="order"#',
            $nav,
        );
    }

    public function test_the_desktop_header_makes_the_same_split(): void
    {
        $html = $this->get('/')->assertOk()->getContent();

        preg_match('#<nav class="header-nav".*?</nav>#s', $html, $nav);
        $this->assertNotEmpty($nav, 'the desktop nav must be in the HTML');

        // Discovery link → the readable page.
        $this->assertStringContainsString('<a href="/menu">Menu</a>', $nav[0]);
        $this->assertStringNotContainsString('href="/order/menu"', $nav[0]);

        // The order CTA sits outside that nav and keeps the SPA.
        $this->assertMatchesRegularExpression('#href="/order/menu" class="hdr-order"#', $html);
    }

    public function test_both_menu_entry_points_actually_resolve(): void
    {
        // A nav link to a 404 is worse than no nav link.
        $this->get('/menu')->assertOk();
        $this->get('/order/menu')->assertOk();
    }
}

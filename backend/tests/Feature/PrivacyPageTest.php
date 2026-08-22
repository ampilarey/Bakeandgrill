<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\SiteSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * /privacy, served by the Blade site.
 *
 * The page, the controller action and the content keys all already existed —
 * `privacy.blade.php`, `HomeController::privacy()`, `privacy_page_title` and
 * friends. What did not exist was a route to any of it: `routes/web.php` had
 * `Route::redirect('/privacy', '/order/privacy', 301)`, which shadowed the
 * whole thing and told Google the privacy policy had *permanently* moved to a
 * React route that serves a crawler `<div id="root"></div>`.
 *
 * So this file is mostly about the routing. The assertions are shaped around
 * the two ways it can silently regress: the redirect coming back, and the page
 * being advertised in the sitemap while unreachable.
 */
class PrivacyPageTest extends TestCase
{
    use RefreshDatabase;

    public function test_privacy_is_a_page_not_a_redirect_into_the_spa(): void
    {
        $this->get('/privacy')
            ->assertOk()
            ->assertSee('Privacy Policy', false);
    }

    public function test_the_policy_is_in_the_html_without_javascript(): void
    {
        // The whole reason the redirect was wrong: a crawler asking /privacy
        // used to be sent to a page with no text in it.
        $response = $this->get('/privacy')->assertOk();

        $response->assertSee('Bank of Maldives', false);
        $response->assertSee('SMS', false);
        $response->assertSee('Your Rights', false);
    }

    public function test_the_cms_body_replaces_the_built_in_text(): void
    {
        // The owner can rewrite the policy from Content Hub without a deploy.
        SiteSetting::set('legal_privacy_body', "First paragraph.\n\nSecond paragraph.", 'website', 'en');

        $response = $this->get('/privacy')->assertOk();

        $response->assertSee('First paragraph.', false);
        $response->assertSee('Second paragraph.', false);
        // The built-in sections must give way rather than appear underneath.
        $response->assertDontSee('Your Rights', false);
    }

    public function test_the_cms_body_is_escaped_not_rendered_as_markup(): void
    {
        // It is a public page filled from an admin textarea. Rendering it raw
        // would be stored XSS; the view uses nl2br(e(...)) and this pins it.
        SiteSetting::set('legal_privacy_body', '<script>alert(1)</script>', 'website', 'en');

        $html = $this->get('/privacy')->assertOk()->getContent();

        $this->assertStringNotContainsString('<script>alert(1)</script>', $html);
        $this->assertStringContainsString('&lt;script&gt;', $html);
    }

    public function test_the_sitemap_advertises_it(): void
    {
        // It was deliberately absent while it was a redirect — advertising a
        // URL whose content a crawler cannot read is worse than omitting it.
        $this->get('/sitemap.xml')
            ->assertOk()
            ->assertSee('<loc>' . url('/privacy') . '</loc>', false);
    }

    public function test_the_footer_privacy_link_lands_on_the_page(): void
    {
        // layout.blade.php and terms.blade.php both link to route('privacy').
        // While that route was a redirect the link worked but arrived at the
        // SPA; now it must arrive here.
        $this->assertSame(url('/privacy'), route('privacy'));

        $this->get(route('privacy'))->assertOk();
    }
}

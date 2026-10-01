<?php

declare(strict_types=1);

namespace Tests\Feature\Website;

use App\Support\ContentSanitizer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Website audit, 2026-10-01: the TEST site and the private token pages were
 * open to search engines.
 */
class SearchVisibilityTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_live_robots_file_keeps_crawlers_off_private_pages_and_names_the_sitemap(): void
    {
        $body = (string) $this->get('https://bakeandgrill.mv/robots.txt')
            ->assertOk()
            ->assertHeader('Content-Type', 'text/plain; charset=UTF-8')
            ->getContent();

        $this->assertStringContainsString("Disallow: /receipts/\n", $body);
        $this->assertStringContainsString("Disallow: /order/track/\n", $body);
        $this->assertStringContainsString('Sitemap: https://bakeandgrill.mv/sitemap.xml', $body);
        $this->assertStringNotContainsString("Disallow: /\n", $body, 'the live site is still indexed');
    }

    public function test_the_test_site_asks_to_be_left_out_entirely(): void
    {
        $this->get('https://test.bakeandgrill.mv/robots.txt')
            ->assertOk()
            ->assertSee("Disallow: /\n", false);

        $this->get('https://test.bakeandgrill.mv/sitemap.xml')
            ->assertHeader('X-Robots-Tag', 'noindex, nofollow');
    }

    public function test_token_pages_say_noindex_and_public_pages_do_not(): void
    {
        $this->get('https://bakeandgrill.mv/receipts/not-a-real-token')
            ->assertHeader('X-Robots-Tag', 'noindex, nofollow');
        $this->get('https://bakeandgrill.mv/order/track/abc')
            ->assertHeader('X-Robots-Tag', 'noindex, nofollow');

        $this->assertFalse($this->get('https://bakeandgrill.mv/sitemap.xml')->headers->has('X-Robots-Tag'));
    }

    public function test_rich_text_keeps_its_tags_but_not_their_attributes(): void
    {
        $this->assertSame('<p>Hi <strong>there</strong></p>', ContentSanitizer::clean('<p style="position:fixed;inset:0">Hi <strong class="x">there</strong></p>'));
        $this->assertSame('<a href="/menu">Menu</a>', ContentSanitizer::clean('<a href="/menu" style="x">Menu</a>'));
    }
}

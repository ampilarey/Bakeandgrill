<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use App\Models\SiteSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

/**
 * site_name contains "&". Blade {{ }} already escapes HTML entities, so wrapping
 * with e() produced "Bake &amp;amp; Grill" in OG / JSON-LD output.
 */
class SiteNameEscapingTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
    }

    public function test_homepage_does_not_double_escape_ampersand_in_site_name(): void
    {
        SiteSetting::set('site_name', 'Bake & Grill', 'shared');
        SiteSetting::bust();

        $html = $this->get('/')->assertOk()->getContent();

        $this->assertStringNotContainsString('Bake &amp;amp; Grill', $html);
        $this->assertStringContainsString('og:site_name" content="Bake &amp; Grill"', $html);

        preg_match('/<script type="application\/ld\+json">(.*?)<\/script>/s', $html, $m);
        $this->assertNotEmpty($m[1] ?? null, 'Expected JSON-LD block');
        $json = json_decode($m[1], true);
        $this->assertIsArray($json);
        $this->assertSame('Bake & Grill', $json['name'] ?? null);
    }
}

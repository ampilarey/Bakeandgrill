<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use App\Models\SiteSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

/**
 * Owner, 2026-10-07: the header logo with moving flames. It stands in for the
 * standard logo only; a logo uploaded in Admin shows as before.
 */
class AnimatedLogoTest extends TestCase
{
    use RefreshDatabase;

    /** @return list<string> the inner HTML of each header logo link */
    private function headerLogos(string $html): array
    {
        preg_match_all('#<a href="/" class="(?:site-logo|mob-logo)">(.*?)</a>#s', $html, $m);

        return $m[1];
    }

    public function test_the_header_draws_the_standard_logo_with_moving_flames(): void
    {
        $html = $this->get('/')->assertOk()->getContent();

        $logos = $this->headerLogos($html);
        $this->assertCount(2, $logos, 'desktop and phone headers');
        foreach ($logos as $logo) {
            $this->assertStringContainsString('<svg class="bgl ', $logo);
            $this->assertStringContainsString('role="img"', $logo);
            $this->assertStringNotContainsString('<img', $logo);
        }
        // Gradients are unique per copy; the styles go out once.
        $this->assertStringContainsString('id="bgl-drop-d"', $html);
        $this->assertStringContainsString('id="bgl-drop-m"', $html);
        $this->assertSame(1, substr_count($html, '@keyframes bgl-main'));
        $this->assertStringContainsString('@media (prefers-reduced-motion:reduce){.bgl .bgl-f{animation:none}}', $html);
        $this->assertStringContainsString('[data-theme="dark"] .bgl .bgl-t{fill:#FFFDF9}', $html);
    }

    public function test_an_uploaded_logo_shows_as_before(): void
    {
        SiteSetting::set('logo', '/storage/site/our-logo.png', 'shared');
        SiteSetting::bust();
        Cache::flush();

        $html = $this->get('/')->assertOk()->getContent();

        foreach ($this->headerLogos($html) as $logo) {
            $this->assertStringContainsString('src="/storage/site/our-logo.png"', $logo);
            $this->assertStringNotContainsString('<svg', $logo);
        }
        $this->assertStringNotContainsString('@keyframes bgl-main', $html);
    }

    public function test_the_standalone_files(): void
    {
        foreach (['logo-animated.svg' => '#1C1408', 'logo-animated-dark.svg' => '#FFFDF9'] as $file => $text) {
            $svg = (string) file_get_contents(public_path('brand/' . $file));
            $this->assertLessThan(15 * 1024, strlen($svg));
            $this->assertStringContainsString('<title id="t">Bake &amp; Grill Cafe</title>', $svg);
            foreach (['flame-outer-left', 'flame-outer-right', 'flame-main', 'flame-inner', 'text-bg', 'text-amp', 'text-cafe'] as $id) {
                $this->assertStringContainsString('id="' . $id . '"', $svg);
            }
            $this->assertStringContainsString('fill="' . $text . '"', $svg);
            $this->assertNotFalse(simplexml_load_string($svg), $file . ' is well-formed');
        }
    }
}

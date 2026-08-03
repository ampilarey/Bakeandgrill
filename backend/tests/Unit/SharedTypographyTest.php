<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Http\Middleware\SecurityHeaders;
use Illuminate\Http\Request;
use ReflectionMethod;
use Tests\TestCase;

final class SharedTypographyTest extends TestCase
{
    public function test_fonts_css_uses_absolute_self_hosted_paths(): void
    {
        $css = file_get_contents(dirname(__DIR__, 3).'/packages/shared/src/styles/fonts.css');
        $this->assertIsString($css);
        $this->assertSame(
            $css,
            file_get_contents(dirname(__DIR__, 2).'/public/css/fonts.css'),
            'backend/public/css/fonts.css must match packages/shared/src/styles/fonts.css'
        );

        preg_match_all("/url\\((['\"]?)([^'\")]+)\\1\\)/", $css, $matches);
        $this->assertNotEmpty($matches[2]);
        foreach ($matches[2] as $url) {
            $this->assertStringStartsWith('/fonts/', $url);
            $this->assertStringNotContainsString('fonts.googleapis.com', $url);
            $this->assertStringNotContainsString('fonts.gstatic.com', $url);
            $path = dirname(__DIR__, 2).'/public'.$url;
            $this->assertFileExists($path, "Missing self-hosted font file for {$url}");
        }

        foreach (['--font-ui', '--font-display', '--font-dhivehi', '--font-mono'] as $var) {
            $this->assertMatchesRegularExpression('/'.preg_quote($var, '/').'\s*:\s*[^;]+;/', $css);
        }

        $this->assertStringContainsString('[lang="dv"]', $css);
        $this->assertStringContainsString('[dir="rtl"]', $css);
        $this->assertStringContainsString('var(--font-dhivehi)', $css);
    }

    public function test_csp_no_longer_allows_google_fonts_hosts(): void
    {
        $middleware = new SecurityHeaders;
        $method = new ReflectionMethod(SecurityHeaders::class, 'contentSecurityPolicy');
        $method->setAccessible(true);

        foreach (['/admin', '/order', '/pos', '/kds', '/'] as $path) {
            $request = Request::create($path, 'GET');
            /** @var string $csp */
            $csp = $method->invoke($middleware, $request);
            $this->assertStringNotContainsString('fonts.googleapis.com', $csp, $path);
            $this->assertStringNotContainsString('fonts.gstatic.com', $csp, $path);
            $this->assertStringContainsString("font-src 'self'", $csp, $path);
        }
    }
}

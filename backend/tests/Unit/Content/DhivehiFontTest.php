<?php

declare(strict_types=1);

namespace Tests\Unit\Content;

use App\Domains\Content\DhivehiFont;
use Tests\TestCase;

class DhivehiFontTest extends TestCase
{
    public function test_detects_ttf_and_woff2_magic(): void
    {
        $ttf = (string) file_get_contents(public_path('fonts/a_faruma.ttf'));
        $this->assertSame('ttf', DhivehiFont::detectKind($ttf));

        $woff2 = (string) file_get_contents(public_path('fonts/a_faruma.woff2'));
        $this->assertSame('woff2', DhivehiFont::detectKind($woff2));

        $this->assertNull(DhivehiFont::detectKind("\xFF\xD8\xFF\xE0not-a-font"));
        $this->assertNull(DhivehiFont::detectKind(''));
    }

    public function test_a_faruma_ttf_contains_thaana(): void
    {
        $ttf = (string) file_get_contents(public_path('fonts/a_faruma.ttf'));
        $cps = DhivehiFont::thaanaCodepoints($ttf, 'ttf');
        $this->assertNotEmpty($cps);
        $this->assertContains(0x0780, $cps);
        $this->assertLessThanOrEqual(0x07BF, max($cps));
    }

    public function test_plus_jakarta_woff2_has_no_thaana(): void
    {
        $latin = (string) file_get_contents(public_path('fonts/plus-jakarta-sans-400.woff2'));
        $this->assertSame('woff2', DhivehiFont::detectKind($latin));
        $this->assertSame([], DhivehiFont::thaanaCodepoints($latin, 'woff2'));
    }

    public function test_safe_public_url_only_allows_hashed_storage_fonts(): void
    {
        $this->assertTrue(DhivehiFont::isSafePublicUrl('/storage/fonts/abc123.woff2'));
        $this->assertTrue(DhivehiFont::isSafePublicUrl('/storage/fonts/deadbeef.ttf'));
        $this->assertFalse(DhivehiFont::isSafePublicUrl('/storage/site/logo.png'));
        $this->assertFalse(DhivehiFont::isSafePublicUrl('https://evil.example/x.woff2'));
        $this->assertFalse(DhivehiFont::isSafePublicUrl('/storage/fonts/../x.woff2'));
        $this->assertFalse(DhivehiFont::isSafePublicUrl("/storage/fonts/a.woff2');}*{"));
    }

    public function test_css_format_from_url(): void
    {
        $this->assertSame('woff2', DhivehiFont::cssFormatFromUrl('/storage/fonts/a.woff2'));
        $this->assertSame('woff', DhivehiFont::cssFormatFromUrl('/storage/fonts/a.woff'));
        $this->assertSame('opentype', DhivehiFont::cssFormatFromUrl('/storage/fonts/a.otf'));
        $this->assertSame('truetype', DhivehiFont::cssFormatFromUrl('/storage/fonts/a.ttf'));
    }
}

<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Domains\Content\ContentValidationService;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class ContentValidationServiceTest extends TestCase
{
    public function test_safe_public_url_allowlist_rejects_executable_urls(): void
    {
        $this->assertSame('/order/menu', ContentValidationService::safePublicUrl('/order/menu'));
        $this->assertSame('https://example.test/path', ContentValidationService::safePublicUrl('https://example.test/path'));
        $this->assertSame('http://example.test/path', ContentValidationService::safePublicUrl('http://example.test/path'));
        $this->assertSame('mailto:hello@example.test', ContentValidationService::safePublicUrl('mailto:hello@example.test'));
        $this->assertSame('tel:+9609120011', ContentValidationService::safePublicUrl('tel:+9609120011'));
        $this->assertSame(
            'viber://chat?number=9609120011',
            ContentValidationService::safePublicUrl('viber://chat?number=9609120011'),
        );

        $this->assertNull(ContentValidationService::safePublicUrl('//evil.example/path'));
        $this->assertNull(ContentValidationService::safePublicUrl('javascript:alert(1)'));
        $this->assertNull(ContentValidationService::safePublicUrl('data:text/html,<svg>'));
        $this->assertNull(ContentValidationService::safePublicUrl('vbscript:msgbox(1)'));
    }

    public function test_validator_normalizes_hex_colour_and_hero_urls(): void
    {
        $validator = app(ContentValidationService::class);

        // primary_color is Business Details–owned (2026-08-14) — shared only.
        $this->assertSame('#AABBCC', $validator->normalizeForWrite('primary_color', 'shared', '#abc'));
        $this->assertSame('#D4813A', $validator->normalizeForWrite('primary_color', 'shared', '#d4813a'));

        $slides = $validator->normalizeForWrite('hero_slides', 'website', [[
            'title' => 'Lunch',
            'showing' => true,
            'cta_url' => ' /order/menu ',
        ]]);

        $this->assertSame('/order/menu', json_decode($slides, true)[0]['cta_url']);
    }

    public function test_validator_rejects_bad_scope(): void
    {
        $validator = app(ContentValidationService::class);

        $this->expectException(ValidationException::class);
        $validator->normalizeForWrite('menu_page_title', 'website', 'Menu');
    }

    public function test_validator_rejects_bad_hero_json(): void
    {
        $validator = app(ContentValidationService::class);

        $this->expectException(ValidationException::class);
        $validator->normalizeForWrite('hero_slides', 'website', '{"title":"Not a list"}');
    }

    public function test_dhivehi_font_accepts_empty_or_hashed_storage_url(): void
    {
        $validator = app(ContentValidationService::class);

        $this->assertSame('', $validator->normalizeForWrite('dhivehi_font', 'website', '  '));
        $url = '/storage/fonts/' . str_repeat('ab', 32) . '.woff2';
        $this->assertSame(
            $url,
            $validator->normalizeForWrite('dhivehi_font', 'website', $url),
        );
    }

    public function test_dhivehi_font_rejects_external_or_unsafe_urls(): void
    {
        $validator = app(ContentValidationService::class);

        $this->expectException(ValidationException::class);
        $validator->normalizeForWrite('dhivehi_font', 'website', 'https://evil.example/font.woff2');
    }
}

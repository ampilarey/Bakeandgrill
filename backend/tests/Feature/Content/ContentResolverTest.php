<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use App\Domains\Content\ContentRegistry;
use App\Domains\Content\ContentResolver;
use App\Models\SiteSetting;
use Database\Seeders\ContentSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ContentResolverTest extends TestCase
{
    use RefreshDatabase;

    public function test_override_beats_shared_beats_default_per_app(): void
    {
        $this->assertTrue(ContentRegistry::has('business_phone'));

        SiteSetting::set('business_phone', '+960 SHARED', 'shared');
        SiteSetting::set('business_phone', '+960 WEB', 'website');
        SiteSetting::set('business_phone', '+960 ORDER', 'order_app');

        $this->assertSame('+960 WEB', ContentResolver::for('website')->get('business_phone'));
        $this->assertSame('+960 ORDER', ContentResolver::for('order_app')->get('business_phone'));
        $this->assertSame('+960 SHARED', SiteSetting::get('business_phone'));
    }

    public function test_shared_read_by_both_when_no_override(): void
    {
        SiteSetting::set('cta_band_headline', 'Shared headline', 'shared');

        $this->assertSame('Shared headline', ContentResolver::for('website')->get('cta_band_headline'));
        $this->assertSame('Shared headline', ContentResolver::for('order_app')->get('cta_band_headline'));
    }

    public function test_split_isolates_apps(): void
    {
        SiteSetting::set('home_delivery_tagline', 'Shared tag', 'shared');
        SiteSetting::set('home_delivery_tagline', 'Web only', 'website');

        $this->assertSame('Web only', ContentResolver::for('website')->get('home_delivery_tagline'));
        $this->assertSame('Shared tag', ContentResolver::for('order_app')->get('home_delivery_tagline'));
    }

    public function test_unknown_key_falls_back_to_caller_default(): void
    {
        $this->assertSame('fallback', ContentResolver::for('website')->get('totally_unknown_key_xyz', 'fallback'));
    }

    public function test_registry_default_when_no_row(): void
    {
        $default = ContentRegistry::default('site_name');
        $this->assertNotEmpty($default);
        $this->assertSame($default, ContentResolver::for('order_app')->get('site_name'));
    }

    public function test_all_public_only_emits_public_registry_blocks(): void
    {
        SiteSetting::set('business_phone', '+960 1', 'shared');
        $map = ContentResolver::for('order_app')->allPublic();
        $this->assertArrayHasKey('business_phone', $map);
        foreach (array_keys($map) as $key) {
            $this->assertTrue(ContentRegistry::isPublic((string) $key), "non-public key leaked: {$key}");
        }
    }
}

<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use App\Domains\Content\ContentRegistry;
use App\Domains\Content\ContentResolver;
use App\Models\SiteSetting;
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
        // Use a key that genuinely targets both apps (cta_band_* is website-only).
        SiteSetting::set('business_phone', '+960 SHARED BOTH', 'shared');

        $this->assertSame('+960 SHARED BOTH', ContentResolver::for('website')->get('business_phone'));
        $this->assertSame('+960 SHARED BOTH', ContentResolver::for('order_app')->get('business_phone'));
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

    /**
     * Pin: empty JSON arrays at app scope are deliberate "show nothing" overrides.
     * They must win over shared content for every json-type key (not only hero_slides).
     */
    public function test_empty_json_array_at_app_scope_overrides_shared(): void
    {
        $sharedHero = json_encode([[
            'title' => 'Shared slide',
            'image' => '/shared.jpg',
        ]], JSON_UNESCAPED_SLASHES);
        $sharedTrust = json_encode([[
            'icon' => '★',
            'heading' => 'Shared trust',
            'subtext' => 'Keep me',
        ]], JSON_UNESCAPED_UNICODE);

        SiteSetting::set('hero_slides', $sharedHero, 'shared');
        SiteSetting::set('hero_slides', '[]', 'website');
        // Stage 2 may have materialized seed hero_slides onto order_app — clear so shared wins.
        SiteSetting::clearScoped('hero_slides', 'order_app');
        SiteSetting::set('trust_items', $sharedTrust, 'shared');
        SiteSetting::set('trust_items', '[]', 'order_app');
        SiteSetting::clearScoped('trust_items', 'website');

        $this->assertSame('[]', ContentResolver::for('website')->get('hero_slides'));
        $this->assertSame($sharedHero, ContentResolver::for('order_app')->get('hero_slides'));

        $this->assertSame('[]', ContentResolver::for('order_app')->get('trust_items'));
        $this->assertSame($sharedTrust, ContentResolver::for('website')->get('trust_items'));

        // Decoded empty array — still "show nothing", never fall through to shared.
        $this->assertSame([], ContentResolver::for('website')->json('hero_slides', ['fallback']));
        $this->assertSame([], ContentResolver::for('order_app')->json('trust_items', ['fallback']));
    }

    public function test_null_app_scope_still_falls_through_to_shared(): void
    {
        $sharedHero = json_encode([['title' => 'Only shared', 'image' => '/a.jpg']], JSON_UNESCAPED_SLASHES);
        SiteSetting::set('hero_slides', $sharedHero, 'shared');
        // No website row at all.
        SiteSetting::query()->where('key', 'hero_slides')->where('scope', 'website')->delete();
        SiteSetting::bust();

        $this->assertSame($sharedHero, ContentResolver::for('website')->get('hero_slides'));
    }
}

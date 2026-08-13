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

    public function test_business_details_keys_resolve_from_shared_not_app_overrides(): void
    {
        $this->assertTrue(ContentRegistry::has('business_phone'));

        SiteSetting::set('business_phone', '+960 SHARED', 'shared');
        SiteSetting::set('business_phone', '+960 WEB', 'website');
        SiteSetting::set('business_phone', '+960 ORDER', 'order_app');

        // Leftover app-scoped rows must not override Business Details.
        $this->assertSame('+960 SHARED', ContentResolver::for('website')->get('business_phone'));
        $this->assertSame('+960 SHARED', ContentResolver::for('order_app')->get('business_phone'));
        $this->assertSame('+960 SHARED', SiteSetting::get('business_phone'));
    }

    public function test_apps_do_not_fall_back_to_shared_for_marketing_keys(): void
    {
        SiteSetting::query()->where('key', 'home_delivery_tagline')->delete();
        SiteSetting::bust();
        ContentResolver::bust();

        SiteSetting::set('home_delivery_tagline', '+960 SHARED ONLY', 'shared');

        $default = ContentRegistry::default('home_delivery_tagline');
        $this->assertSame($default, ContentResolver::for('website')->get('home_delivery_tagline'));
        $this->assertSame($default, ContentResolver::for('order_app')->get('home_delivery_tagline'));
        $this->assertSame('+960 SHARED ONLY', SiteSetting::getScoped('home_delivery_tagline', 'shared'));
    }

    public function test_business_details_keys_do_read_shared(): void
    {
        SiteSetting::query()->where('key', 'business_phone')->whereIn('scope', ['website', 'order_app'])->delete();
        SiteSetting::bust();
        ContentResolver::bust();

        SiteSetting::set('business_phone', '+960 SHARED ONLY', 'shared');

        $this->assertSame('+960 SHARED ONLY', ContentResolver::for('website')->get('business_phone'));
        $this->assertSame('+960 SHARED ONLY', ContentResolver::for('order_app')->get('business_phone'));
    }

    public function test_split_isolates_apps_without_shared_fallback(): void
    {
        SiteSetting::query()->where('key', 'home_delivery_tagline')->delete();
        SiteSetting::bust();
        ContentResolver::bust();

        SiteSetting::set('home_delivery_tagline', 'Shared tag', 'shared');
        SiteSetting::set('home_delivery_tagline', 'Web only', 'website');

        $this->assertSame('Web only', ContentResolver::for('website')->get('home_delivery_tagline'));
        $this->assertSame(
            ContentRegistry::default('home_delivery_tagline'),
            ContentResolver::for('order_app')->get('home_delivery_tagline'),
        );
    }

    public function test_unknown_key_falls_back_to_caller_default(): void
    {
        $this->assertSame('fallback', ContentResolver::for('website')->get('totally_unknown_key_xyz', 'fallback'));
    }

    public function test_registry_default_when_no_row(): void
    {
        $default = ContentRegistry::default('site_name');
        $this->assertNotEmpty($default);
        SiteSetting::query()->where('key', 'site_name')->delete();
        SiteSetting::bust();
        ContentResolver::bust();
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
     * With no shared step, they win over the registry default; the other app is independent.
     */
    public function test_empty_json_array_at_app_scope_shows_nothing(): void
    {
        SiteSetting::set('hero_slides', '[]', 'website');
        SiteSetting::set('trust_items', '[]', 'order_app');

        $this->assertSame('[]', ContentResolver::for('website')->get('hero_slides'));
        $this->assertSame('[]', ContentResolver::for('order_app')->get('trust_items'));

        $this->assertSame([], ContentResolver::for('website')->json('hero_slides', ['fallback']));
        $this->assertSame([], ContentResolver::for('order_app')->json('trust_items', ['fallback']));
    }

    public function test_null_app_scope_falls_through_to_registry_default_not_shared(): void
    {
        $sharedHero = json_encode([['title' => 'Only shared', 'image' => '/a.jpg']], JSON_UNESCAPED_SLASHES);
        SiteSetting::set('hero_slides', $sharedHero, 'shared');
        SiteSetting::query()->where('key', 'hero_slides')->where('scope', 'website')->delete();
        SiteSetting::bust();
        ContentResolver::bust();

        $this->assertSame(
            ContentRegistry::default('hero_slides'),
            ContentResolver::for('website')->get('hero_slides'),
        );
        $this->assertSame($sharedHero, SiteSetting::getScoped('hero_slides', 'shared'));
    }
}

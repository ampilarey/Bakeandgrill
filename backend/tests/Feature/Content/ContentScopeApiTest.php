<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use App\Domains\Content\ContentRegistry;
use App\Models\SiteSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

class ContentScopeApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
    }

    public function test_content_endpoint_returns_resolved_maps_per_app(): void
    {
        SiteSetting::set('business_phone', '+960 SHARED', 'shared');
        SiteSetting::set('business_phone', '+960 WEB', 'website');
        SiteSetting::set('business_phone', '+960 ORDER', 'order_app');
        SiteSetting::set('home_open_badge_text', 'Open now', 'shared');

        $order = $this->getJson('/api/content?app=order_app')->assertOk()->json('content');
        $web = $this->getJson('/api/content?app=website')->assertOk()->json('content');

        $this->assertSame('+960 ORDER', $order['business_phone'] ?? null);
        $this->assertSame('+960 WEB', $web['business_phone'] ?? null);
        $this->assertArrayNotHasKey('home_open_badge_text', $order);
        $this->assertSame('Open now', $web['home_open_badge_text'] ?? null);
    }

    public function test_only_public_registry_blocks_emitted(): void
    {
        $map = $this->getJson('/api/content?app=order_app')->assertOk()->json('content');
        foreach (array_keys($map) as $key) {
            $this->assertTrue(ContentRegistry::isPublic((string) $key));
            $this->assertTrue(ContentRegistry::targetsApp((string) $key, 'order_app'));
        }
    }

    public function test_site_settings_public_is_order_app_alias(): void
    {
        SiteSetting::set('menu_page_title', 'Alias Menu', 'shared');
        SiteSetting::bust();
        \App\Domains\Content\ContentResolver::bust();

        $viaContent = $this->getJson('/api/content?app=order_app')->assertOk()->json('content');
        $viaAlias = $this->getJson('/api/site-settings/public')->assertOk()->json('settings');

        $this->assertSame($viaContent['menu_page_title'] ?? null, $viaAlias['menu_page_title'] ?? null);
        $this->assertSame('Alias Menu', $viaAlias['menu_page_title'] ?? null);
    }

    public function test_invalid_app_rejected(): void
    {
        $this->getJson('/api/content?app=pos')->assertStatus(422);
    }
}

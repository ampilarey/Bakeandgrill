<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use App\Domains\Content\ContentRegistry;
use App\Domains\Content\ContentResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ContentOrderStatusBannersTest extends TestCase
{
    use RefreshDatabase;

    /** @var array<string, string> */
    private const EXPECTED_DEFAULTS = [
        'order_status_open' => 'Online ordering is open',
        'order_status_closed' => 'Online ordering is closed',
        'order_status_pickup_only' => 'Pickup only',
        'order_status_closes' => 'Closes {time}',
        'order_status_opens' => 'Opens {time}',
        'order_status_delivery_from' => 'Delivery from {time}',
        'order_hours_open' => 'Online ordering open',
        'order_hours_closed' => 'Online ordering closed',
        'order_hours_open_closes' => 'Online ordering open · Closes {time}',
        'order_hours_closed_opens' => 'Online ordering closed · Opens {time}',
    ];

    public function test_registry_includes_status_banner_keys_for_order_app(): void
    {
        foreach (array_keys(self::EXPECTED_DEFAULTS) as $key) {
            $this->assertTrue(ContentRegistry::has($key), "missing registry key {$key}");
            $this->assertTrue(ContentRegistry::isPublic($key));
            $this->assertTrue(ContentRegistry::targetsApp($key, 'order_app'));
            $this->assertFalse(ContentRegistry::targetsApp($key, 'website'));
            $block = ContentRegistry::block($key);
            $this->assertSame('Status banners', $block['group'] ?? null);
            $this->assertSame(self::EXPECTED_DEFAULTS[$key], ContentRegistry::default($key));
        }
    }

    public function test_public_content_api_emits_status_banner_defaults(): void
    {
        $content = $this->getJson('/api/content?app=order_app&locale=en')
            ->assertOk()
            ->json('content');

        foreach (self::EXPECTED_DEFAULTS as $key => $default) {
            $this->assertArrayHasKey($key, $content);
            $this->assertSame($default, $content[$key]);
        }
    }

    public function test_resolver_defaults_match_todays_strings(): void
    {
        $resolved = ContentResolver::for('order_app', 'en')->allPublic();
        foreach (self::EXPECTED_DEFAULTS as $key => $default) {
            $this->assertSame($default, $resolved[$key] ?? null);
        }
    }
}

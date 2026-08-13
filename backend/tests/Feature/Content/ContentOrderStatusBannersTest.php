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

    /** Live status-badge copy — OpeningStatusBadge uses order_hours_*, not order_status_*. */
    /** @var array<string, string> */
    private const EXPECTED_DEFAULTS = [
        'order_hours_open' => 'Online ordering open',
        'order_hours_closed' => 'Online ordering closed',
        'order_hours_open_closes' => 'Online ordering open · Closes {time}',
        'order_hours_closed_opens' => 'Online ordering closed · Opens {time}',
    ];

    /** @var list<string> */
    private const RETIRED_KEYS = [
        'order_status_open',
        'order_status_closed',
        'order_status_pickup_only',
        'order_status_closes',
        'order_status_opens',
        'order_status_delivery_from',
        'menu_page_subtitle',
        'preorder_page_title',
        'preorder_page_subtitle',
        'preorder_submit_label',
        'preorder_confirm_title',
        'preorder_confirm_message',
        'preorder_confirm_steps',
        'office_orders_min_guests',
    ];

    public function test_registry_includes_hours_banner_keys_for_order_app(): void
    {
        foreach (array_keys(self::EXPECTED_DEFAULTS) as $key) {
            $this->assertTrue(ContentRegistry::has($key), "missing registry key {$key}");
            $this->assertTrue(ContentRegistry::isPublic($key));
            $this->assertTrue(ContentRegistry::targetsApp($key, 'order_app'));
            $this->assertFalse(ContentRegistry::targetsApp($key, 'website'));
            $block = ContentRegistry::block($key);
            $this->assertSame('Home', $block['group'] ?? null);
            $this->assertSame(self::EXPECTED_DEFAULTS[$key], ContentRegistry::default($key));
        }
    }

    public function test_retired_menu_banner_keys_are_gone_from_registry(): void
    {
        foreach (self::RETIRED_KEYS as $key) {
            $this->assertFalse(ContentRegistry::has($key), "retired key still registered: {$key}");
        }
    }

    public function test_public_content_api_emits_hours_banner_defaults(): void
    {
        $content = $this->getJson('/api/content?app=order_app&locale=en')
            ->assertOk()
            ->json('content');

        foreach (self::EXPECTED_DEFAULTS as $key => $default) {
            $this->assertArrayHasKey($key, $content);
            $this->assertSame($default, $content[$key]);
        }

        foreach (self::RETIRED_KEYS as $key) {
            $this->assertArrayNotHasKey($key, $content);
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

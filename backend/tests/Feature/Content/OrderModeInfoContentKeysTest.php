<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use App\Domains\Content\ContentRegistry;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class OrderModeInfoContentKeysTest extends TestCase
{
    use RefreshDatabase;

    /** @var list<string> */
    private const KEYS = [
        'order_mode_dine_in_hint',
        'order_mode_delivery_info',
        'order_mode_pickup_info',
        'order_mode_dine_in_info',
        'order_mode_status_available',
        'order_mode_status_unavailable',
        'order_mode_status_unavailable_opens',
        'order_mode_learn_more',
    ];

    public function test_mode_info_keys_are_registered_public_and_order_app_only(): void
    {
        foreach (self::KEYS as $key) {
            $this->assertTrue(ContentRegistry::has($key), "missing {$key}");
            $this->assertTrue(ContentRegistry::isPublic($key), "not public {$key}");
            $this->assertTrue(ContentRegistry::targetsApp($key, 'order_app'), "not order_app {$key}");
            $this->assertFalse(ContentRegistry::targetsApp($key, 'website'), "leaked to website {$key}");
            $block = ContentRegistry::block($key);
            $this->assertNotEmpty($block['description'] ?? null, "missing description {$key}");
        }
    }

    public function test_content_endpoint_emits_dine_in_hint_default(): void
    {
        $map = $this->getJson('/api/content?app=order_app')->assertOk()->json('content');
        $this->assertArrayHasKey('order_mode_dine_in_hint', $map);
        $this->assertNotSame('', trim((string) ($map['order_mode_dine_in_hint'] ?? '')));
    }
}

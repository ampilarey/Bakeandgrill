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
        'order_mode_delivery_image',
        'order_mode_pickup_image',
        'order_mode_dine_in_image',
        'order_mode_delivery_info',
        'order_mode_pickup_info',
        'order_mode_dine_in_info',
        'order_mode_status_available',
        'order_mode_status_unavailable',
        'order_mode_status_unavailable_opens',
        'order_mode_learn_more',
    ];

    /**
     * order_mode_* keys target both apps so the Website "Order mode cards"
     * band (ModeEntryCardsPresenter) can be edited from the Website side too
     * — see ContentRegistry::isShareable() and ModeEntryCardsPresenter.
     */
    public function test_mode_info_keys_are_registered_public_and_shared_across_both_apps(): void
    {
        foreach (self::KEYS as $key) {
            $this->assertTrue(ContentRegistry::has($key), "missing {$key}");
            $this->assertTrue(ContentRegistry::isPublic($key), "not public {$key}");
            $this->assertTrue(ContentRegistry::targetsApp($key, 'order_app'), "not order_app {$key}");
            $this->assertTrue(ContentRegistry::targetsApp($key, 'website'), "not website {$key}");
            $this->assertTrue(ContentRegistry::isShareable($key), "not shareable {$key}");
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

    public function test_mode_card_images_are_independent_per_app(): void
    {
        \App\Models\SiteSetting::set(
            'order_mode_delivery_image',
            'https://cdn.example.test/website-delivery.jpg',
            'website',
            'en',
        );
        \App\Models\SiteSetting::set(
            'order_mode_delivery_image',
            'https://cdn.example.test/order-delivery.jpg',
            'order_app',
            'en',
        );
        \App\Domains\Content\ContentResolver::bust();

        $website = \App\Domains\Content\ModeEntryCardsPresenter::resolveImageUrl(
            'delivery',
            \App\Domains\Content\ContentResolver::for('website'),
        );
        $order = \App\Domains\Content\ModeEntryCardsPresenter::resolveImageUrl(
            'delivery',
            \App\Domains\Content\ContentResolver::for('order_app'),
        );

        $this->assertSame('https://cdn.example.test/website-delivery.jpg', $website);
        $this->assertSame('https://cdn.example.test/order-delivery.jpg', $order);
    }
}

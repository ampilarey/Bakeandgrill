<?php

declare(strict_types=1);

namespace Tests\Unit\Content;

use App\Domains\Content\ContentRegistry;
use Tests\TestCase;

class SurfaceMapKeysTest extends TestCase
{
    public function test_orphan_customer_keys_are_registered(): void
    {
        $registry = app(ContentRegistry::class);
        foreach ([
            'home_chat_label',
            'home_visit_card_title',
            'home_delivery_card_title',
            'home_directions_cta',
            'home_call_cta',
            'home_order_via_app_label',
            'legal_last_updated_date',
            'meta_keywords',
            'google_analytics_id',
            'google_tag_manager_id',
        ] as $key) {
            $this->assertTrue($registry->has($key), "Expected content key [{$key}] to be registered");
        }
    }

    public function test_brand_footer_content_keys_are_registered(): void
    {
        // Named page-block sharing is retired; brand footer still has registry keys.
        foreach (['footer_text', 'footer_thanks', 'home_chat_label'] as $key) {
            $this->assertTrue(ContentRegistry::has($key), "brand_footer key [{$key}] must be registered");
        }
        $this->assertTrue(ContentRegistry::isPublic('home_chat_label'));
    }

    public function test_home_chat_label_is_public(): void
    {
        $this->assertTrue(ContentRegistry::has('home_chat_label'));
        $this->assertTrue(ContentRegistry::isPublic('home_chat_label'));
    }
}

<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Legacy GET /api/admin/content/media was retired in favour of Media Library.
 */
class ContentMediaLibraryTest extends TestCase
{
    use RefreshDatabase;

    public function test_legacy_content_media_endpoint_is_gone(): void
    {
        $this->getJson('/api/admin/content/media')->assertNotFound();
    }
}

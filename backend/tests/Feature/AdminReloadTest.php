<?php

declare(strict_types=1);

namespace Tests\Feature;

use Tests\TestCase;

class AdminReloadTest extends TestCase
{
    public function test_admin_reload_leaves_the_service_worker_scope_and_comes_back(): void
    {
        $response = $this->get('/admin-reload');

        $response->assertRedirect();
        $location = (string) $response->headers->get('Location');
        $this->assertMatchesRegularExpression('#/admin/\?_u=[a-z0-9]+$#', $location);
        $cache = (string) $response->headers->get('Cache-Control');
        $this->assertStringContainsString('no-store', $cache);
    }
}

<?php

declare(strict_types=1);

namespace Tests\Feature;

use Tests\TestCase;

class DriverSpaRouteTest extends TestCase
{
    public function test_driver_spa_subpaths_return_index_html(): void
    {
        $indexPath = public_path('driver/index.html');
        if (!file_exists($indexPath)) {
            $this->markTestSkipped('Driver app not built in public/driver/');
        }

        foreach (['/driver/login', '/driver/history'] as $path) {
            $response = $this->get($path);
            $response->assertOk();
            $response->assertHeader('Content-Type', 'text/html; charset=utf-8');
            $this->assertSame(
                file_get_contents($indexPath),
                $response->getContent(),
                "Expected {$path} to serve driver/index.html",
            );
        }
    }
}

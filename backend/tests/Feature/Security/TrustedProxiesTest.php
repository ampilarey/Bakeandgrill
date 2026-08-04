<?php

declare(strict_types=1);

namespace Tests\Feature\Security;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

class TrustedProxiesTest extends TestCase
{
    public function test_spoofed_forwarded_for_does_not_change_client_ip_without_trusted_proxies(): void
    {
        $this->assertTrue(
            blank(config('app.trusted_proxies')),
            'Test assumes no trusted proxies are configured',
        );

        Route::get('/_test/client-ip', fn (Request $request) => response()->json([
            'ip' => $request->ip(),
        ]));

        $response = $this->call(
            'GET',
            '/_test/client-ip',
            [],
            [],
            [],
            [
                'REMOTE_ADDR' => '127.0.0.1',
                'HTTP_X_FORWARDED_FOR' => '203.0.113.50',
            ],
        );

        $response->assertOk();
        $response->assertJson(['ip' => '127.0.0.1']);
    }
}

<?php

declare(strict_types=1);

namespace Tests\Unit\Notifications;

use App\Domains\Notifications\Providers\DhiraaguSmsProvider;
use Illuminate\Support\Facades\Http;
use ReflectionMethod;
use Tests\TestCase;

class DhiraaguSmsProviderDestinationTest extends TestCase
{
    public function test_strips_plus_from_destination_for_dhiraagu_api(): void
    {
        Http::fake([
            'https://sms.test.example/send' => Http::response([
                'transactionId' => 'tx-1',
                'transactionStatus' => true,
            ], 200),
        ]);

        $provider = new DhiraaguSmsProvider;
        $method = new ReflectionMethod(DhiraaguSmsProvider::class, 'sendViaDhiraagu');
        $method->setAccessible(true);

        [$ok] = $method->invoke($provider, '+9607777001', 'Hello', [
            'api_url' => 'https://sms.test.example/send',
            'username' => 'user',
            'password' => 'pass',
            'timeout' => 5,
        ]);

        $this->assertTrue($ok);
        Http::assertSent(function ($request) {
            $body = $request->data();

            return ($body['destination'][0] ?? null) === '9607777001';
        });
    }
}

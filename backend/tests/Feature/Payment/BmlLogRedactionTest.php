<?php

declare(strict_types=1);

namespace Tests\Feature\Payment;

use App\Domains\Payments\Gateway\BmlConnectService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Mockery;
use Tests\TestCase;

class BmlLogRedactionTest extends TestCase
{
    use RefreshDatabase;

    public function test_bml_success_log_does_not_include_full_payment_url(): void
    {
        config([
            'bml.base_url' => 'https://bml.test/public',
            'bml.app_id' => 'app-id',
            'bml.api_key' => 'api-key',
            'bml.auth_mode' => 'raw',
            'bml.return_url' => 'https://shop.test/return',
        ]);

        Http::fake([
            '*/v2/transactions' => Http::response([
                'url' => 'https://pay.secret-host.mv/checkout/abc123token',
                'id' => 'txn-001',
            ], 200),
        ]);

        Log::spy();

        app(BmlConnectService::class)->createPayment(2500, 'order123');

        Log::shouldHaveReceived('info')
            ->with(
                'BML: Payment session created',
                Mockery::on(function (array $context): bool {
                    $encoded = json_encode($context);

                    return !str_contains((string) $encoded, 'abc123token')
                        && !str_contains((string) $encoded, 'pay.secret-host.mv/checkout')
                        && ($context['payment_url_host'] ?? null) === 'pay.secret-host.mv';
                }),
            );
    }
}

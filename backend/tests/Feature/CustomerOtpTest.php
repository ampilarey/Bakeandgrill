<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CustomerOtpTest extends TestCase
{
    use RefreshDatabase;

    public function test_customer_can_request_and_verify_otp(): void
    {
        config(['app.debug' => true]);

        $requestResponse = $this->postJson('/api/auth/customer/otp/request', [
            'phone' => '+9607001234',
        ]);

        $requestResponse->assertOk();
        $otp = $requestResponse->json('otp');
        $this->assertNotNull($otp);

        $verifyResponse = $this->postJson('/api/auth/customer/otp/verify', [
            'phone' => '+9607001234',
            'otp' => $otp,
        ]);

        $verifyResponse->assertOk()
            ->assertJsonStructure(['token', 'customer' => ['id', 'phone']]);
    }
}

<?php

declare(strict_types=1);

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CustomerOtpTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Reset OTP_DEV_RETURN after each test — `env()` is cached by Laravel,
     * but PHP's getenv reads fresh, so the explicit cleanup keeps test
     * ordering effects out of the picture.
     */
    protected function tearDown(): void
    {
        putenv('OTP_DEV_RETURN');
        parent::tearDown();
    }

    public function test_customer_can_request_and_verify_otp(): void
    {
        // OTP dev-return is gated behind an explicit env flag now, NOT
        // APP_DEBUG, to keep the code out of staging logs (BE-105).
        putenv('OTP_DEV_RETURN=true');

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
            ->assertJsonStructure(['customer' => ['id', 'phone']])
            ->assertJsonMissing(['token']);
    }

    /**
     * Regression: BE-104 — two OTP requests for the same phone in the same
     * minute used to share an idempotency key, causing SmsService::send() to
     * silently drop the second SMS even though a fresh OTP row was inserted
     * in DB. The customer would then verify against the newest row using a
     * code they never received and fail with "Invalid OTP code".
     *
     * After the fix, each request must result in a separate sms_logs row
     * (or at minimum, both OTPs are dispatchable). We assert by verifying
     * the SECOND OTP — which is the newest row in DB and the only one a
     * real customer would have on their phone after the second request.
     */
    public function test_back_to_back_otp_requests_in_same_minute_both_dispatch(): void
    {
        putenv('OTP_DEV_RETURN=true');
        $phone = '+9607001234';

        // First request
        $r1 = $this->postJson('/api/auth/customer/otp/request', ['phone' => $phone]);
        $r1->assertOk();
        $otp1 = $r1->json('otp');

        // Immediate second request — same wall-clock minute. The bug case.
        $r2 = $this->postJson('/api/auth/customer/otp/request', ['phone' => $phone]);
        $r2->assertOk();
        $otp2 = $r2->json('otp');

        $this->assertNotNull($otp1);
        $this->assertNotNull($otp2);

        // Each request must mint a fresh OTP code (random_int — overwhelmingly
        // unlikely to collide; if it ever does, the test is still valid for
        // dispatch semantics).
        $this->assertSame(6, strlen((string) $otp2));

        // Verifying with the SECOND OTP (the one the customer actually has)
        // must succeed. Before the fix, the second SMS was silently dropped
        // but the DB row existed — verifyAndConsumeOtp pulled the newest row,
        // checked the code the customer never received, and failed.
        $this->postJson('/api/auth/customer/otp/verify', [
            'phone' => $phone,
            'otp' => $otp2,
        ])->assertOk();

        // And each request must have created a distinct sms_logs row — proving
        // that the idempotency key was unique per request rather than per minute.
        $this->assertGreaterThanOrEqual(2, \DB::table('sms_logs')
            ->where('to', $phone)
            ->whereIn('type', ['otp', 'auth_customer_otp'])
            ->count());
    }
}

<?php

declare(strict_types=1);

namespace Tests\Feature\Auth;

use App\Models\Customer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * 2026-08 payment/auth audit finding #1 — email OTP account takeover.
 *
 * An OTP must be delivered only to a verified address for the account, and a
 * reset-purpose OTP must never authenticate a login (or vice versa).
 */
class OtpPurposeSecurityTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Config::set('system.otp_dev_return', true);
        Mail::fake();
    }

    protected function tearDown(): void
    {
        Config::set('system.otp_dev_return', false);
        parent::tearDown();
    }

    public function test_email_otp_rejected_for_unverified_address(): void
    {
        Customer::create([
            'phone' => '+9607005000',
            'name' => 'Victim',
            'email' => 'victim@real.com',
            
            'loyalty_points' => 0,
            'tier' => 'bronze',
        ]);

        // Attacker asks for the reset code at their OWN inbox.
        $this->postJson('/api/auth/customer/otp/request', [
            'phone' => '+9607005000',
            'purpose' => 'reset_password',
            'channel' => 'email',
            'email' => 'attacker@evil.com',
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['email']);

        Mail::assertNothingSent();
    }

    public function test_email_otp_allowed_only_to_matching_account_email(): void
    {
        Customer::create([
            'phone' => '+9607005001',
            'name' => 'Owner',
            'email' => 'owner@real.com',
            
            'loyalty_points' => 0,
            'tier' => 'bronze',
        ]);

        $this->postJson('/api/auth/customer/otp/request', [
            'phone' => '+9607005001',
            'purpose' => 'reset_password',
            'channel' => 'email',
            'email' => 'owner@real.com',
        ])->assertOk();
    }

    public function test_reset_otp_cannot_authenticate_login(): void
    {
        Customer::create([
            'phone' => '+9607005002',
            'name' => 'Owner',
            
            'loyalty_points' => 0,
            'tier' => 'bronze',
        ]);

        // Get a reset-purpose OTP over SMS (legitimate for the owner).
        $reset = $this->postJson('/api/auth/customer/forgot-password', [
            'phone' => '+9607005002',
        ])->assertOk();
        $otp = $reset->json('otp');
        $this->assertNotNull($otp);

        // It must NOT be usable at the login/verify endpoint.
        $this->postJson('/api/auth/customer/otp/verify', [
            'phone' => '+9607005002',
            'otp' => $otp,
        ])->assertStatus(422);

        $this->assertFalse(Auth::guard('customer')->check());
    }

    public function test_login_otp_cannot_reset_password(): void
    {
        Customer::create([
            'phone' => '+9607005003',
            'name' => 'Owner',
            
            'loyalty_points' => 0,
            'tier' => 'bronze',
        ]);

        // Login-purpose OTP (default purpose = register/login over SMS).
        $login = $this->postJson('/api/auth/customer/otp/request', [
            'phone' => '+9607005003',
        ])->assertOk();
        $otp = $login->json('otp');

        $this->postJson('/api/auth/customer/reset-password', [
            'phone' => '+9607005003',
            'otp' => $otp,
            'password' => 'newpass123',
            'password_confirmation' => 'newpass123',
        ])->assertStatus(422);
    }
}

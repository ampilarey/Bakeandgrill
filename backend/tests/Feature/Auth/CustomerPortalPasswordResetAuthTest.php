<?php

declare(strict_types=1);

namespace Tests\Feature\Auth;

use App\Models\Customer;
use App\Models\OtpVerification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class CustomerPortalPasswordResetAuthTest extends TestCase
{
    use RefreshDatabase;

    private function customerWithPassword(string $phone, string $password = 'old-secret'): Customer
    {
        $customer = Customer::factory()->create([
            'phone' => $phone,
            'is_active' => true,
            'is_profile_complete' => true,
        ]);
        $customer->password = $password;
        $customer->save();

        return $customer;
    }

    private function seedOtp(string $phone, string $code = '123456', int $attempts = 0): OtpVerification
    {
        return OtpVerification::create([
            'phone' => $phone,
            'code_hash' => Hash::make($code),
            'expires_at' => now()->addMinutes(10),
            'attempts' => $attempts,
        ]);
    }

    #[Test]
    public function reset_password_without_otp_verification_is_rejected(): void
    {
        $phone = '+9607711111';
        $customer = $this->customerWithPassword($phone, 'old-secret');

        $this->from(route('customer.forgot-password'))
            ->post(route('customer.reset-password'), [
                'phone' => $phone,
                'password' => 'hijacked-password',
                'password_confirmation' => 'hijacked-password',
            ])
            ->assertSessionHasErrors('password');

        $this->assertGuest('customer');
        $this->assertTrue(Hash::check('old-secret', $customer->fresh()->password));
    }

    #[Test]
    public function reset_grant_is_single_use(): void
    {
        $phone = '+9607722222';
        $customer = $this->customerWithPassword($phone, 'old-secret');
        $this->seedOtp($phone, '123456');

        $this->from(route('customer.forgot-password'))
            ->post(route('customer.verify-reset-otp'), [
                'phone' => $phone,
                'otp' => '123456',
            ])
            ->assertSessionHas('password_reset_grant');

        $grantToken = session('password_reset_grant');
        $this->assertIsString($grantToken);

        $this->from(route('customer.forgot-password'))
            ->post(route('customer.reset-password'), [
                'phone' => $phone,
                'password' => 'new-secret-1',
                'password_confirmation' => 'new-secret-1',
            ])
            ->assertRedirect('/order/menu');

        $this->assertTrue(Hash::check('new-secret-1', $customer->fresh()->password));

        // Replay the consumed grant token — must not change the password again.
        $this->withSession([
            'password_reset_grant' => $grantToken,
            'password_reset_phone' => $phone,
        ])->from(route('customer.forgot-password'))
            ->post(route('customer.reset-password'), [
                'phone' => $phone,
                'password' => 'new-secret-2',
                'password_confirmation' => 'new-secret-2',
            ])
            ->assertSessionHasErrors('password');

        $this->assertTrue(Hash::check('new-secret-1', $customer->fresh()->password));
    }

    #[Test]
    public function grant_for_phone_a_cannot_reset_phone_b(): void
    {
        $phoneA = '+9607733333';
        $phoneB = '+9607744444';
        $customerA = $this->customerWithPassword($phoneA, 'secret-a');
        $customerB = $this->customerWithPassword($phoneB, 'secret-b');
        $this->seedOtp($phoneA, '123456');

        $this->from(route('customer.forgot-password'))
            ->post(route('customer.verify-reset-otp'), [
                'phone' => $phoneA,
                'otp' => '123456',
            ])
            ->assertSessionHas('password_reset_grant');

        $this->from(route('customer.forgot-password'))
            ->post(route('customer.reset-password'), [
                'phone' => $phoneB,
                'password' => 'taken-over',
                'password_confirmation' => 'taken-over',
            ])
            ->assertSessionHasErrors('password');

        $this->assertGuest('customer');
        $this->assertTrue(Hash::check('secret-a', $customerA->fresh()->password));
        $this->assertTrue(Hash::check('secret-b', $customerB->fresh()->password));
    }

    #[Test]
    public function expired_grant_is_rejected(): void
    {
        $phone = '+9607755555';
        $customer = $this->customerWithPassword($phone, 'old-secret');
        $this->seedOtp($phone, '123456');

        $this->from(route('customer.forgot-password'))
            ->post(route('customer.verify-reset-otp'), [
                'phone' => $phone,
                'otp' => '123456',
            ])
            ->assertSessionHas('password_reset_grant');

        $this->travel(11)->minutes();

        $this->from(route('customer.forgot-password'))
            ->post(route('customer.reset-password'), [
                'phone' => $phone,
                'password' => 'too-late-password',
                'password_confirmation' => 'too-late-password',
            ])
            ->assertSessionHasErrors('password');

        $this->assertGuest('customer');
        $this->assertTrue(Hash::check('old-secret', $customer->fresh()->password));
    }

    #[Test]
    public function verify_reset_otp_rejects_sixth_wrong_code_and_increments_attempts(): void
    {
        $phone = '+9607766666';
        $this->customerWithPassword($phone);
        $otp = $this->seedOtp($phone, '654321');

        for ($i = 1; $i <= 5; $i++) {
            $this->from(route('customer.forgot-password'))
                ->post(route('customer.verify-reset-otp'), [
                    'phone' => $phone,
                    'otp' => '000000',
                ])
                ->assertSessionHasErrors('otp');

            $this->assertSame($i, (int) $otp->fresh()->attempts);
        }

        $this->from(route('customer.forgot-password'))
            ->post(route('customer.verify-reset-otp'), [
                'phone' => $phone,
                'otp' => '000000',
            ])
            ->assertSessionHasErrors('otp');

        $this->assertSame(5, (int) $otp->fresh()->attempts);
        $this->assertNull($otp->fresh()->used_at);

        // Correct code still rejected once the attempt cap is hit.
        $this->from(route('customer.forgot-password'))
            ->post(route('customer.verify-reset-otp'), [
                'phone' => $phone,
                'otp' => '654321',
            ])
            ->assertSessionHasErrors('otp');

        $this->assertNull(session('password_reset_grant'));
    }

    #[Test]
    public function forgot_password_otp_issuance_is_throttled(): void
    {
        $phone = '+9607777777';
        $this->customerWithPassword($phone);
        RateLimiter::clear('otp-request:web-reset:' . $phone);

        $issued = 0;
        $blocked = 0;

        for ($i = 0; $i < 12; $i++) {
            $response = $this->from(route('customer.forgot-password'))
                ->post(route('customer.forgot-password.post'), [
                    'phone' => $phone,
                ]);

            if ($response->status() === 429) {
                $blocked++;
                continue;
            }

            if ($response->status() === 302 && !session('errors')) {
                $issued++;
            }
        }

        $this->assertLessThanOrEqual(5, OtpVerification::where('phone', $phone)->count());
        $this->assertTrue(
            $blocked > 0 || OtpVerification::where('phone', $phone)->count() <= 5,
            'Expected route throttle and/or controller rate limit to stop OTP spam',
        );
        $this->assertLessThanOrEqual(5, $issued);
    }

    #[Test]
    public function happy_path_request_verify_reset_logs_in(): void
    {
        $phone = '+9607788888';
        $customer = $this->customerWithPassword($phone, 'old-secret');

        $this->from(route('customer.forgot-password'))
            ->post(route('customer.forgot-password.post'), [
                'phone' => $phone,
            ])
            ->assertSessionHas('reset_otp_requested');

        $otpRow = OtpVerification::where('phone', $phone)->orderByDesc('id')->first();
        $this->assertNotNull($otpRow);

        // Replace with a known code so we can complete the flow without SMS.
        $otpRow->update(['code_hash' => Hash::make('112233')]);

        $this->from(route('customer.forgot-password'))
            ->post(route('customer.verify-reset-otp'), [
                'phone' => $phone,
                'otp' => '112233',
            ])
            ->assertSessionHas('password_reset_grant')
            ->assertSessionHas('reset_verified');

        $this->from(route('customer.forgot-password'))
            ->post(route('customer.reset-password'), [
                'phone' => $phone,
                'password' => 'brand-new-pass',
                'password_confirmation' => 'brand-new-pass',
            ])
            ->assertRedirect('/order/menu');

        $this->assertAuthenticatedAs($customer->fresh(), 'customer');
        $this->assertTrue(Hash::check('brand-new-pass', $customer->fresh()->password));
        $this->assertNull(session('password_reset_grant'));
    }
}

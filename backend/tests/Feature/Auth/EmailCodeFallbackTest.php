<?php

declare(strict_types=1);

namespace Tests\Feature\Auth;

use App\Mail\CustomerOtpMail;
use App\Models\Customer;
use App\Models\OtpVerification;
use App\Support\EmailMask;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * Owner, 2026-10-06: "Why there is no email option in login?" → option 1:
 * the code screen offers "Email me the code instead", which sends the code
 * to the address already on the account. The screen only ever sees that
 * address masked, and cannot send a code anywhere else.
 */
class EmailCodeFallbackTest extends TestCase
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

    private function customer(array $attrs = []): Customer
    {
        return Customer::create(array_merge([
            'phone' => '+9607006000',
            'name' => 'Aishath',
            'email' => 'aishath@gmail.com',
            'loyalty_points' => 0,
            'tier' => 'bronze',
        ], $attrs));
    }

    public function test_masks_an_address_so_only_its_owner_recognises_it(): void
    {
        $this->assertSame('a•••@g•••.com', EmailMask::mask('aishath@gmail.com'));
        $this->assertSame('m•••@b•••.mv', EmailMask::mask(' mohamed.ali@bakeandgrill.mv '));
        $this->assertNull(EmailMask::mask('not-an-address'));
        $this->assertNull(EmailMask::mask(null));
    }

    public function test_the_texted_code_response_says_an_email_is_on_file_masked(): void
    {
        $this->customer();

        $this->postJson('/api/auth/customer/otp/request', ['phone' => '7006000'])
            ->assertOk()
            ->assertJsonPath('channel', 'sms')
            ->assertJsonPath('email_hint', 'a•••@g•••.com')
            ->assertJsonMissingPath('sent_to');
    }

    public function test_no_hint_when_the_account_has_no_email_or_does_not_exist(): void
    {
        $this->customer(['email' => null]);

        $this->postJson('/api/auth/customer/otp/request', ['phone' => '7006000'])
            ->assertOk()->assertJsonMissingPath('email_hint');
        $this->postJson('/api/auth/customer/otp/request', ['phone' => '7006001'])
            ->assertOk()->assertJsonMissingPath('email_hint');
    }

    public function test_email_me_the_code_goes_to_the_address_on_file_without_the_screen_knowing_it(): void
    {
        $this->customer();

        $res = $this->postJson('/api/auth/customer/otp/request', [
            'phone' => '7006000',
            'purpose' => 'register',
            'channel' => 'email',
        ])->assertOk()
            ->assertJsonPath('channel', 'email')
            ->assertJsonPath('sent_to', 'a•••@g•••.com');

        Mail::assertSent(CustomerOtpMail::class, fn ($m) => $m->hasTo('aishath@gmail.com') && $m->otpCode === $res->json('otp'));

        // And the emailed code signs the customer in.
        $this->postJson('/api/auth/customer/otp/verify', ['phone' => '7006000', 'otp' => $res->json('otp')])
            ->assertOk();
    }

    public function test_the_reset_code_can_be_emailed_too(): void
    {
        $c = $this->customer();
        $c->forceFill(['password' => bcrypt('secret123')])->save();

        $this->postJson('/api/auth/customer/forgot-password', ['phone' => '7006000'])
            ->assertOk()->assertJsonPath('email_hint', 'a•••@g•••.com');

        $this->postJson('/api/auth/customer/otp/request', [
            'phone' => '7006000',
            'purpose' => 'reset_password',
            'channel' => 'email',
        ])->assertOk()->assertJsonPath('sent_to', 'a•••@g•••.com');

        Mail::assertSent(CustomerOtpMail::class, fn ($m) => $m->hasTo('aishath@gmail.com'));
    }

    public function test_an_account_with_no_email_is_told_to_use_the_text(): void
    {
        $this->customer(['email' => null]);

        $this->postJson('/api/auth/customer/otp/request', ['phone' => '7006000', 'channel' => 'email'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['email']);

        Mail::assertNothingSent();
    }

    public function test_a_different_address_is_still_refused(): void
    {
        $this->customer();

        $this->postJson('/api/auth/customer/otp/request', [
            'phone' => '7006000',
            'channel' => 'email',
            'email' => 'someone-else@evil.com',
        ])->assertStatus(422)->assertJsonValidationErrors(['email']);

        Mail::assertNothingSent();
    }

    public function test_when_the_email_cannot_be_sent_the_texted_code_still_works(): void
    {
        $this->customer();

        $sms = $this->postJson('/api/auth/customer/otp/request', ['phone' => '7006000'])->assertOk();

        Mail::shouldReceive('to')->andThrow(new \RuntimeException('Connection timed out'));
        $this->postJson('/api/auth/customer/otp/request', ['phone' => '7006000', 'channel' => 'email'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['email']);

        $this->assertSame(1, OtpVerification::where('phone', '+9607006000')->count());
        $this->postJson('/api/auth/customer/otp/verify', ['phone' => '7006000', 'otp' => $sms->json('otp')])
            ->assertOk();
    }

    /*
     * Owner, 2026-10-06 (screenshot): asked for the reset code by SMS, then
     * by email too, typed the SMS one and was told "Invalid OTP code".
     */
    public function test_the_texted_reset_code_still_works_after_also_asking_for_the_email(): void
    {
        $c = $this->customer();
        $c->forceFill(['password' => bcrypt('old-pass-1')])->save();

        $sms = $this->postJson('/api/auth/customer/forgot-password', ['phone' => '7006000'])->assertOk();
        $this->postJson('/api/auth/customer/otp/request', ['phone' => '7006000', 'purpose' => 'reset_password', 'channel' => 'email'])
            ->assertOk();

        $this->postJson('/api/auth/customer/reset-password', [
            'phone' => '7006000',
            'otp' => $sms->json('otp'),
            'password' => 'new-pass-1',
            'password_confirmation' => 'new-pass-1',
        ])->assertOk();
    }

    public function test_either_sign_in_code_works_and_using_one_cancels_both(): void
    {
        $this->customer();

        $sms = $this->postJson('/api/auth/customer/otp/request', ['phone' => '7006000'])->assertOk();
        $mail = $this->postJson('/api/auth/customer/otp/request', ['phone' => '7006000', 'channel' => 'email'])->assertOk();

        $this->postJson('/api/auth/customer/otp/verify', ['phone' => '7006000', 'otp' => $sms->json('otp')])->assertOk();

        $this->assertSame(0, OtpVerification::where('phone', '+9607006000')->whereNull('used_at')->count());
        auth()->forgetGuards();
        $this->postJson('/api/auth/customer/otp/verify', ['phone' => '7006000', 'otp' => $mail->json('otp')])
            ->assertStatus(422)->assertJsonValidationErrors(['otp']);
    }

    public function test_only_the_two_newest_codes_count(): void
    {
        $this->customer();

        $first = $this->postJson('/api/auth/customer/otp/request', ['phone' => '7006000'])->assertOk();
        $this->postJson('/api/auth/customer/otp/request', ['phone' => '7006000'])->assertOk();
        $this->postJson('/api/auth/customer/otp/request', ['phone' => '7006000', 'channel' => 'email'])->assertOk();

        $this->postJson('/api/auth/customer/otp/verify', ['phone' => '7006000', 'otp' => $first->json('otp')])
            ->assertStatus(422);
    }

    public function test_a_wrong_code_counts_against_both_and_says_how_many_tries_are_left(): void
    {
        $this->customer();

        $sms = $this->postJson('/api/auth/customer/otp/request', ['phone' => '7006000'])->assertOk();
        $mail = $this->postJson('/api/auth/customer/otp/request', ['phone' => '7006000', 'channel' => 'email'])->assertOk();
        $wrong = collect(['000000', '111111', '222222'])
            ->first(fn ($c) => $c !== $sms->json('otp') && $c !== $mail->json('otp'));

        $this->postJson('/api/auth/customer/otp/verify', ['phone' => '7006000', 'otp' => $wrong])
            ->assertStatus(422)
            ->assertJsonPath('errors.otp.0', 'That code is not right. 4 tries left.');

        $this->assertSame([1, 1], OtpVerification::where('phone', '+9607006000')->orderBy('id')->pluck('attempts')->all());
    }

}

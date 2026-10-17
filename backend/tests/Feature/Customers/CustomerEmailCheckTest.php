<?php

declare(strict_types=1);

namespace Tests\Feature\Customers;

use App\Mail\CustomerOtpMail;
use App\Models\Customer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * A customer proves their email with a 6-digit code (iruali import plan,
 * feature 2). Changing the email clears it; a code sent to the old email
 * does not prove the new one.
 */
class CustomerEmailCheckTest extends TestCase
{
    use RefreshDatabase;

    private Customer $customer;

    private ?string $code = null;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
        $this->customer = Customer::create(['name' => 'Aisha', 'phone' => '+9607771111', 'email' => 'aisha@example.mv', 'is_active' => true]);
        Sanctum::actingAs($this->customer, ['customer']);
    }

    private function sentCode(): string
    {
        $code = null;
        Mail::assertSent(CustomerOtpMail::class, function (CustomerOtpMail $m) use (&$code) {
            $code = $m->otpCode;

            return $m->isVerify();
        });

        return (string) $code;
    }

    public function test_a_code_by_email_proves_it(): void
    {
        $this->postJson('/api/customer/email/send-code')->assertOk()->assertJsonPath('sent_to', 'aisha@example.mv');
        Mail::assertSent(CustomerOtpMail::class, fn (CustomerOtpMail $m) => $m->hasTo('aisha@example.mv') && $m->words()['h1'] === 'Check your email');

        $this->postJson('/api/customer/email/verify', ['code' => '000000'])->assertStatus(422);
        $this->postJson('/api/customer/email/verify', ['code' => $this->sentCode()])->assertOk()->assertJsonPath('email_verified', true);

        $this->assertTrue($this->customer->fresh()->hasVerifiedEmail());
        $this->getJson('/api/customer/me')->assertOk()->assertJsonPath('customer.email_verified', true);
    }

    public function test_changing_the_email_clears_the_check_and_an_old_code_does_not_prove_the_new_one(): void
    {
        $this->postJson('/api/customer/email/send-code')->assertOk();
        $code = $this->sentCode();
        $this->patchJson('/api/customer/profile', ['email' => 'other@example.mv'])->assertOk()->assertJsonPath('customer.email_verified', false);

        $this->postJson('/api/customer/email/verify', ['code' => $code])->assertStatus(422)->assertJsonPath('errors.otp.0', 'That code was for another email. Please ask for a new one.');

        $this->customer->forceFill(['email_verified_at' => now()])->save();
        $this->customer->update(['email' => 'third@example.mv']);
        $this->assertFalse($this->customer->fresh()->hasVerifiedEmail());
    }

    public function test_one_code_a_minute_and_a_sign_in_code_cannot_prove_an_email(): void
    {
        $this->postJson('/api/customer/email/send-code')->assertOk();
        $this->postJson('/api/customer/email/send-code')->assertStatus(422);

        $signIn = app(\App\Domains\Auth\Services\CustomerOtpService::class)->issue('+9607771111', 'login', 'email', 'aisha@example.mv');
        $this->postJson('/api/customer/email/verify', ['code' => $signIn])->assertStatus(422);
        $this->assertFalse($this->customer->fresh()->hasVerifiedEmail());
    }

    public function test_no_email_no_code(): void
    {
        $this->customer->update(['email' => null]);

        $this->postJson('/api/customer/email/send-code')->assertStatus(422)->assertJsonPath('errors.email.0', 'Add an email to your account first.');
    }
}

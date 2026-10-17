<?php

declare(strict_types=1);

namespace App\Mail;

use App\Support\EmailBrand;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Carbon;

/**
 * Sign-in / password reset code by email (owner, 2026-10-06: "Enhance the
 * email send with branding and other features").
 *
 * The code leads the subject ("718894 is your Bake & Grill code") so it can
 * be read from the notification and offered by the phone's code autofill;
 * the body names the purpose, the account (masked), when it was asked for
 * and when it stops working, and how to tell a real code email from a fake.
 */
class CustomerOtpMail extends Mailable
{
    use Queueable, SerializesModels;

    public const RESET_PURPOSES = ['reset_password', 'web-reset'];

    public const VERIFY_PURPOSE = 'verify_email';

    public string $requestedAtIso;

    public function __construct(
        public string $otpCode,
        public int $expiresMinutes = 10,
        public string $purpose = 'login',
        public ?string $phone = null,
        ?\DateTimeInterface $requestedAt = null,
        /** True when the same code also went by SMS (the automatic copy). */
        public bool $alsoTexted = false,
    ) {
        $this->requestedAtIso = Carbon::instance($requestedAt ?? now())->toIso8601String();
    }

    public function isReset(): bool
    {
        return in_array($this->purpose, self::RESET_PURPOSES, true);
    }

    /** Checking the email saved on an account (iruali import plan, feature 2). */
    public function isVerify(): bool
    {
        return $this->purpose === self::VERIFY_PURPOSE;
    }

    /**
     * The words that change with what the code is for.
     *
     * @return array{title: string, h1: string, action: string, band: string, for: string, nobody: string}
     */
    public function words(): array
    {
        if ($this->isVerify()) {
            return ['title' => 'Email check code', 'h1' => 'Check your email', 'action' => 'check this email address', 'band' => 'Email check', 'for' => 'Checking this email address', 'nobody' => 'nobody can add this address to an account without the code'];
        }
        if ($this->isReset()) {
            return ['title' => 'Password reset code', 'h1' => 'Your password reset code', 'action' => 'set a new password', 'band' => 'Password reset', 'for' => 'Setting a new password', 'nobody' => 'nobody can sign in without the code, and your password has not changed'];
        }

        return ['title' => 'Sign-in code', 'h1' => 'Your sign-in code', 'action' => 'sign in', 'band' => 'Sign in', 'for' => 'Signing in', 'nobody' => 'nobody can sign in without the code'];
    }

    public function build(): self
    {
        $name = EmailBrand::variables()['name'];
        $requested = Carbon::parse($this->requestedAtIso)->timezone(config('app.timezone'));

        return $this->subject(match (true) {
            $this->isReset() => "{$this->otpCode} is your {$name} password reset code",
            $this->isVerify() => "{$this->otpCode} is your {$name} email check code",
            default => "{$this->otpCode} is your {$name} code",
        })
            ->view('emails.customer_otp')
            ->text('emails.customer_otp_text')
            ->with([
                'brandName' => $name,
                'isReset' => $this->isReset(),
                'w' => $this->words(),
                'maskedPhone' => EmailBrand::maskPhone($this->phone),
                'requestedAt' => $requested,
                'expiresAt' => $requested->copy()->addMinutes($this->expiresMinutes),
            ]);
    }
}

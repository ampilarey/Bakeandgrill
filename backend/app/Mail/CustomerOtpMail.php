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

    public function build(): self
    {
        $name = EmailBrand::variables()['name'];
        $requested = Carbon::parse($this->requestedAtIso)->timezone(config('app.timezone'));

        return $this->subject($this->isReset()
                ? "{$this->otpCode} is your {$name} password reset code"
                : "{$this->otpCode} is your {$name} code")
            ->view('emails.customer_otp')
            ->text('emails.customer_otp_text')
            ->with([
                'brandName' => $name,
                'isReset' => $this->isReset(),
                'maskedPhone' => EmailBrand::maskPhone($this->phone),
                'requestedAt' => $requested,
                'expiresAt' => $requested->copy()->addMinutes($this->expiresMinutes),
            ]);
    }
}

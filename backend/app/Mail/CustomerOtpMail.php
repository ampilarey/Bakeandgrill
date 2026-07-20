<?php

declare(strict_types=1);

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

class CustomerOtpMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public string $otpCode,
        public int $expiresMinutes = 10,
    ) {}

    public function build(): self
    {
        return $this->subject('Your Bake & Grill verification code')
            ->view('emails.customer_otp');
    }
}

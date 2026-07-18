<?php

declare(strict_types=1);

namespace App\Mail;

use App\Models\GiftCard;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

class GiftCardMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public GiftCard $card,
        public string $plainCode,
        public string $redeemUrl,
        public ?string $personalNote = null,
    ) {}

    public function build(): self
    {
        $amount = number_format((float) $this->card->initial_balance, 2);

        return $this->subject("Your Bake & Grill gift card — MVR {$amount}")
            ->view('emails.gift_card');
    }
}

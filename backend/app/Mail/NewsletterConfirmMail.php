<?php

declare(strict_types=1);

namespace App\Mail;

use App\Models\NewsletterSubscriber;
use App\Support\EmailBrand;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;

/** "Confirm your newsletter sign-up" (double opt-in, feature 4). */
class NewsletterConfirmMail extends Mailable
{
    use Queueable;

    public function __construct(public NewsletterSubscriber $subscriber) {}

    public function build(): self
    {
        $dv = $this->subscriber->locale === 'dv';

        return $this->subject($dv ? 'ނިއުސްލެޓަރ ކަށަވަރުކުރޭ' : 'Confirm your ' . EmailBrand::variables()['name'] . ' newsletter')
            ->view('emails.newsletter_confirm')
            ->with([
                'dv' => $dv,
                'confirmUrl' => route('newsletter.confirm', ['token' => $this->subscriber->token]),
            ]);
    }
}

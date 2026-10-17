<?php

declare(strict_types=1);

namespace App\Mail;

use App\Models\NewsletterIssue;
use App\Models\NewsletterSubscriber;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Headers;

/** One newsletter, in the reader's language, with the one-click unsubscribe link and headers (feature 4). */
class NewsletterIssueMail extends Mailable
{
    use Queueable;

    /** @param array<string, mixed> $picks */
    public function __construct(public NewsletterIssue $issue, public NewsletterSubscriber $subscriber, public array $picks, public bool $test = false) {}

    public function build(): self
    {
        $dv = $this->subscriber->locale === 'dv' && filled($this->issue->subject_dv);
        $subject = $dv ? (string) $this->issue->subject_dv : (string) $this->issue->subject_en;

        return $this->subject(($this->test ? '[Test] ' : '') . $subject)
            ->view('emails.newsletter_issue')
            ->with([
                'dv' => $dv,
                'subjectLine' => $subject,
                'body' => $dv ? (string) ($this->issue->body_dv ?? '') : (string) ($this->issue->body_en ?? ''),
                'headerImage' => $this->issue->header_image_url,
                'picks' => $this->picks,
                'unsubscribeUrl' => $this->unsubscribeUrl(),
            ]);
    }

    public function headers(): Headers
    {
        $url = $this->unsubscribeUrl();

        return new Headers(text: $url === null ? [] : [
            'List-Unsubscribe' => '<' . $url . '>',
            'List-Unsubscribe-Post' => 'List-Unsubscribe=One-Click',
        ]);
    }

    private function unsubscribeUrl(): ?string
    {
        return $this->test ? null : route('newsletter.unsubscribe', ['token' => $this->subscriber->token]);
    }
}

<?php

namespace App\Mail;

use App\Models\CateringRequest;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class EventQuoteSentMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public CateringRequest $request,
        public string $quoteUrl,
        public array $taxPreview,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Your event quote '.$this->request->reference.' — Bake & Grill',
        );
    }

    public function content(): Content
    {
        return new Content(
            markdown: 'emails.event-quote-sent',
            with: [
                'request' => $this->request,
                'quoteUrl' => $this->quoteUrl,
                'taxPreview' => $this->taxPreview,
                'lines' => $this->request->lines,
            ],
        );
    }
}

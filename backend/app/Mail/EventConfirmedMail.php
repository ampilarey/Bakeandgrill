<?php

namespace App\Mail;

use App\Models\CateringRequest;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Carbon;

class EventConfirmedMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public CateringRequest $request,
        public int $paidLaar,
        public int $balanceLaar,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Event confirmed '.$this->request->reference.' — Bake & Grill',
        );
    }

    public function content(): Content
    {
        $date = $this->request->event_date?->format('D, j M Y') ?? 'TBD';
        $time = $this->request->fulfillment_time
            ? Carbon::parse($this->request->fulfillment_time)->format('g:ia')
            : null;
        $venue = $this->request->venue_name
            ?: (($this->request->fulfillment_method ?? '') === 'delivery'
                ? trim(($this->request->delivery_address ?? '').', '.($this->request->delivery_island ?? ''), ', ')
                : 'Bake & Grill (pickup)');

        return new Content(
            markdown: 'emails.event-confirmed',
            with: [
                'request' => $this->request,
                'paidMvr' => number_format($this->paidLaar / 100, 2),
                'balanceMvr' => number_format($this->balanceLaar / 100, 2),
                'hasBalance' => $this->balanceLaar > 0,
                'when' => $time ? "{$date} at {$time}" : $date,
                'venue' => $venue,
            ],
        );
    }
}

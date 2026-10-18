<?php

declare(strict_types=1);

namespace App\Mail;

use App\Models\CateringRequest;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

class EventRequestReceivedMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public CateringRequest $cateringRequest,
        public string $recipientName,
    ) {}

    public function build(): self
    {
        $ref = $this->cateringRequest->reference ?? ('#' . $this->cateringRequest->id);

        return $this->subject(__('Event request :ref received — Bake & Grill', ['ref' => $ref]))
            ->view('emails.event_request_received');
    }
}

<?php

declare(strict_types=1);

namespace App\Mail;

use App\Models\Receipt;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

class ReceiptMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public Receipt $receipt) {}

    public function build(): self
    {
        $orderNumber = $this->receipt->order?->order_number ?? 'order';

        return $this->subject("Your Bake & Grill receipt {$orderNumber}")
            ->view('emails.receipt')
            ->with([
                'receipt' => $this->receipt,
                'order' => $this->receipt->order,
            ]);
    }
}

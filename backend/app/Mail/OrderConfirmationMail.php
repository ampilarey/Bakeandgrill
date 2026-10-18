<?php

declare(strict_types=1);

namespace App\Mail;

use App\Models\Order;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

class OrderConfirmationMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public Order $order,
        public string $trackingUrl,
        public string $recipientName,
    ) {}

    public function build(): self
    {
        return $this->subject(__('Your Bake & Grill order #:number is confirmed!', ['number' => $this->order->order_number]))
            ->view('emails.order_confirmation');
    }
}

<?php

declare(strict_types=1);

namespace App\Mail;

use App\Models\PosterOrder;
use Illuminate\Mail\Mailable;

/** The ZIP and a small proof for one print shop (docs/POSTER_PLAN.md § 9). */
class PosterShopMail extends Mailable
{
    public function __construct(
        public PosterOrder $order,
        public string $zipBytes,
        public string $proofJpeg,
    ) {}

    public function build(): self
    {
        $code = $this->order->poster?->code() ?? ('order-' . $this->order->id);
        $mail = $this->subject('Bake & Grill poster ' . $code)
            ->view('emails.poster_shop', ['order' => $this->order, 'code' => $code])
            ->attachData($this->zipBytes, 'BG-' . $code . '.zip', ['mime' => 'application/zip']);
        if ($this->proofJpeg !== '') {
            $mail->attachData($this->proofJpeg, 'BG-' . $code . '-PROOF.jpg', ['mime' => 'image/jpeg']);
        }

        return $mail;
    }
}

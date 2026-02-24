<?php

declare(strict_types=1);

namespace App\Domains\Payments\Events;

use App\Models\Order;
use App\Models\Payment;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * Fired when a BML payment is confirmed via webhook.
 * Listeners should check if this makes the order fully paid,
 * then fire OrderPaid if so.
 */
class PaymentConfirmed
{
    use Dispatchable;
    use SerializesModels;

    public function __construct(
        public readonly Payment $payment,
        public readonly Order $order,
    ) {}
}

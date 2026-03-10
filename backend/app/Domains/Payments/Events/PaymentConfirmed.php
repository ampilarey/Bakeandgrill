<?php

declare(strict_types=1);

namespace App\Domains\Payments\Events;

use App\Domains\Payments\DTOs\PaymentConfirmedData;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * Fired when a BML payment is confirmed via webhook.
 */
class PaymentConfirmed
{
    use Dispatchable;
    use SerializesModels;

    public function __construct(
        public readonly PaymentConfirmedData $data,
    ) {}
}

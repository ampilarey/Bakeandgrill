<?php

declare(strict_types=1);

namespace App\Domains\Orders\Events;

use App\Domains\Orders\DTOs\OrderCompletedData;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * Fired when order reaches terminal "completed" state.
 * Listeners: EarnPointsFromOrderListener
 */
class OrderCompleted
{
    use Dispatchable;
    use SerializesModels;

    public function __construct(
        public readonly OrderCompletedData $data,
    ) {}
}

<?php

declare(strict_types=1);

namespace App\Domains\Orders\Events;

use App\Domains\Orders\DTOs\OrderCreatedData;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * Fired after an order is created and persisted.
 * Listeners: DispatchKitchenPrintListener
 */
class OrderCreated
{
    use Dispatchable;
    use SerializesModels;

    public function __construct(
        public readonly OrderCreatedData $data,
    ) {}
}

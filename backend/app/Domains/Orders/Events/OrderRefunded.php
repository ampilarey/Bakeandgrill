<?php

declare(strict_types=1);

namespace App\Domains\Orders\Events;

use App\Domains\Orders\DTOs\OrderRefundedData;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * Fired after a refund is created and persisted.
 * Listeners: DispatchWebhookOnDomainEvent (Phase 2)
 */
class OrderRefunded
{
    use Dispatchable;
    use SerializesModels;

    public function __construct(
        public readonly OrderRefundedData $data,
    ) {}
}

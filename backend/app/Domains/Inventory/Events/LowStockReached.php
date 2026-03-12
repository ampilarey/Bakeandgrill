<?php

declare(strict_types=1);

namespace App\Domains\Inventory\Events;

use App\Domains\Inventory\DTOs\LowStockReachedData;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * Fired when an item's stock drops to or below its reorder threshold.
 * Listeners: DispatchWebhookOnDomainEvent (Phase 2)
 */
class LowStockReached
{
    use Dispatchable;
    use SerializesModels;

    public function __construct(
        public readonly LowStockReachedData $data,
    ) {}
}

<?php

declare(strict_types=1);

namespace App\Domains\Inventory\Events;

use App\Domains\Inventory\DTOs\StockLevelChangedData;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * Fired whenever inventory stock changes for any reason.
 * Listeners: DispatchWebhookOnDomainEvent (Phase 2)
 */
class StockLevelChanged
{
    use Dispatchable;
    use SerializesModels;

    public function __construct(
        public readonly StockLevelChangedData $data,
    ) {}
}

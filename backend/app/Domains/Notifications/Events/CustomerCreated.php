<?php

declare(strict_types=1);

namespace App\Domains\Notifications\Events;

use App\Domains\Notifications\DTOs\CustomerCreatedData;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * Fired when a new customer registers via OTP verification.
 * Listeners: DispatchWebhookOnDomainEvent (Phase 2)
 */
class CustomerCreated
{
    use Dispatchable;
    use SerializesModels;

    public function __construct(
        public readonly CustomerCreatedData $data,
    ) {}
}

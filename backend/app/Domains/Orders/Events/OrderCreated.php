<?php

declare(strict_types=1);

namespace App\Domains\Orders\Events;

use App\Models\Order;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class OrderCreated
{
    use Dispatchable;
    use SerializesModels;

    public function __construct(
        public readonly Order $order,
        public readonly bool $printKitchen = true,
    ) {}
}

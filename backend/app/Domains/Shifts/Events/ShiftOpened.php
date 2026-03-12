<?php

declare(strict_types=1);

namespace App\Domains\Shifts\Events;

use App\Domains\Shifts\DTOs\ShiftOpenedData;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class ShiftOpened
{
    use Dispatchable;
    use SerializesModels;

    public function __construct(
        public readonly ShiftOpenedData $data,
    ) {}
}

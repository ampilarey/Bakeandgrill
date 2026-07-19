<?php

declare(strict_types=1);

namespace App\Domains\Catering\Events;

use App\Models\CateringRequest;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

final class CateringRequestSubmitted
{
    use Dispatchable;
    use SerializesModels;

    public function __construct(
        public readonly CateringRequest $request,
    ) {}
}

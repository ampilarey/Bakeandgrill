<?php

declare(strict_types=1);

namespace App\Models;

/**
 * @deprecated Use CateringRequest. Kept as a thin alias for older code/tests.
 */
class CorporateInquiry extends CateringRequest
{
    protected $table = 'catering_requests';
}

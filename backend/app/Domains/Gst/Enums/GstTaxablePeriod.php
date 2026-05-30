<?php

declare(strict_types=1);

namespace App\Domains\Gst\Enums;

enum GstTaxablePeriod: string
{
    case Monthly = 'monthly';
    case Quarterly = 'quarterly';

    /** @return list<string> */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}

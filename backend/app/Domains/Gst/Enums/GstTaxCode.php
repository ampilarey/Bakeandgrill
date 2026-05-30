<?php

declare(strict_types=1);

namespace App\Domains\Gst\Enums;

enum GstTaxCode: string
{
    case Standard8 = 'standard_8';
    case ZeroRated = 'zero_rated';
    case Exempt = 'exempt';
    case OutOfScope = 'out_of_scope';

    public function chargesGst(): bool
    {
        return $this === self::Standard8;
    }

    /** @return list<string> */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}

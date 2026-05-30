<?php

declare(strict_types=1);

namespace App\Domains\Gst\Enums;

enum RevenueOrCapital: string
{
    case Revenue = 'revenue';
    case Capital = 'capital';

    /** @return list<string> */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}

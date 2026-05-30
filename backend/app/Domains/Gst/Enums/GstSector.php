<?php

declare(strict_types=1);

namespace App\Domains\Gst\Enums;

enum GstSector: string
{
    case General = 'general';
    case Tourism = 'tourism';

    /** @return list<string> */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}

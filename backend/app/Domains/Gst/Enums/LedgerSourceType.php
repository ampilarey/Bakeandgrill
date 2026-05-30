<?php

declare(strict_types=1);

namespace App\Domains\Gst\Enums;

enum LedgerSourceType: string
{
    case Order = 'order';
    case Invoice = 'invoice';
    case Refund = 'refund';
    case CreditNote = 'credit_note';
    case Purchase = 'purchase';
    case Expense = 'expense';
    case ManualAdjustment = 'manual_adjustment';

    /** @return list<string> */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}

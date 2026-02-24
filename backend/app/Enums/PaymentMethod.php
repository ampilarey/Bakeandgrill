<?php

declare(strict_types=1);

namespace App\Enums;

enum PaymentMethod: string
{
    case Cash = 'cash';
    case Card = 'card';
    case GiftCard = 'gift_card';
    case Wallet = 'wallet';
}

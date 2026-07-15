<?php

declare(strict_types=1);

namespace App\Enums;

enum PaymentMethod: string
{
    case Cash = 'cash';
    case Card = 'card';
    case Qr = 'qr';
    case BankTransfer = 'bank_transfer';
    case GiftCard = 'gift_card';
    case Wallet = 'wallet';
}

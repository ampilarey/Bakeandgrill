<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Human labels for payment method slugs — keep in sync with POS tenders
 * (Cash / Card / Transfer / QR) and admin report displays.
 */
final class PaymentMethodLabel
{
    public static function for(?string $method): string
    {
        if ($method === null || $method === '') {
            return '—';
        }

        return match (strtolower($method)) {
            'cash' => 'Cash',
            'card', 'card_pos' => 'Card',
            'qr' => 'QR',
            'bank_transfer', 'digital_wallet' => 'Transfer',
            'bml_pay', 'bml', 'bml_connect', 'online' => 'BML Pay',
            'house_account' => 'Credit',
            'wallet', 'customer_deposit' => 'Deposit',
            'gift_card' => 'Gift card',
            'loyalty' => 'Loyalty',
            'cheque' => 'Cheque',
            'other' => 'Other',
            default => str_replace('_', ' ', ucfirst(strtolower($method))),
        };
    }

    /** Methods that attract POS card processing commission. */
    public static function isPosCardLike(string $method): bool
    {
        return in_array(strtolower($method), ['card', 'card_pos', 'qr'], true);
    }
}

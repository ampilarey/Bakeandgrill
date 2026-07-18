<?php

declare(strict_types=1);

namespace App\Domains\Payments\Services;

use App\Models\GiftCard;
use App\Models\GiftCardTransaction;

/**
 * Shared create path for admin-issued and customer-purchased gift cards.
 *
 * @return array{card: GiftCard, plain: string}
 */
final class GiftCardIssueService
{
    public function __construct(
        private readonly GiftCardCodeService $codes,
    ) {}

    /**
     * @param  array{
     *   amount: float|int|string,
     *   issued_to_customer_id?: int|null,
     *   purchased_by_customer_id?: int|null,
     *   expires_at?: string|\DateTimeInterface|null,
     * }  $data
     * @return array{card: GiftCard, plain: string}
     */
    public function issue(array $data): array
    {
        $generated = $this->codes->generate();

        $card = GiftCard::create([
            'code_hash' => $generated['hash'],
            'code_last4' => $generated['last4'],
            'initial_balance' => $data['amount'],
            'current_balance' => $data['amount'],
            'issued_to_customer_id' => $data['issued_to_customer_id'] ?? null,
            'purchased_by_customer_id' => $data['purchased_by_customer_id'] ?? null,
            'status' => 'active',
            'expires_at' => $data['expires_at'] ?? null,
        ]);

        GiftCardTransaction::create([
            'gift_card_id' => $card->id,
            'amount' => $data['amount'],
            'type' => 'load',
            'balance_after' => $data['amount'],
        ]);

        return ['card' => $card, 'plain' => $generated['plain']];
    }
}

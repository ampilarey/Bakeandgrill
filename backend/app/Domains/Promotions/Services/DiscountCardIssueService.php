<?php

declare(strict_types=1);

namespace App\Domains\Promotions\Services;

use App\Models\DiscountCardBatch;
use App\Models\Promotion;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Issues unique single-card promotions under a batch template.
 * Redemption reuses PromotionEvaluator / apply-promo (online + POS).
 */
final class DiscountCardIssueService
{
    public const KIND = 'discount_card';

    public const MAX_QUANTITY = 50;

    /**
     * @param  array{
     *   name: string,
     *   type: string,
     *   discount_value: int,
     *   min_order_laar?: int,
     *   starts_at?: string|null,
     *   expires_at?: string|null,
     *   max_uses_per_card?: int,
     *   max_uses_per_customer?: int|null,
     *   quantity: int,
     *   note?: string|null,
     * }  $data
     * @return array{batch: DiscountCardBatch, cards: list<array{id: int, code: string, name: string, expires_at: string|null}>}
     */
    public function issue(User $issuer, array $data): array
    {
        $quantity = (int) $data['quantity'];
        if ($quantity < 1 || $quantity > self::MAX_QUANTITY) {
            throw new \InvalidArgumentException(
                'Quantity must be between 1 and '.self::MAX_QUANTITY.'.',
            );
        }

        $type = (string) $data['type'];
        if (! in_array($type, ['percentage', 'fixed'], true)) {
            throw new \InvalidArgumentException('Type must be percentage or fixed.');
        }

        $value = (int) $data['discount_value'];
        if ($type === 'percentage' && ($value < 1 || $value > 100)) {
            throw new \InvalidArgumentException('Percentage must be between 1 and 100.');
        }
        if ($type === 'fixed' && $value < 100) {
            throw new \InvalidArgumentException('Fixed discount must be at least MVR 1.');
        }

        $maxUses = max(1, (int) ($data['max_uses_per_card'] ?? 1));
        $minOrder = max(0, (int) ($data['min_order_laar'] ?? 0));
        $perCustomer = isset($data['max_uses_per_customer']) && $data['max_uses_per_customer'] !== null
            ? max(1, (int) $data['max_uses_per_customer'])
            : null;

        $startsAt = $data['starts_at'] ?? null;
        $expiresAt = $data['expires_at'] ?? null;
        if ($startsAt && $expiresAt && strtotime((string) $expiresAt) <= strtotime((string) $startsAt)) {
            throw new \InvalidArgumentException('Expiry must be after the start date.');
        }

        return DB::transaction(function () use ($issuer, $data, $quantity, $type, $value, $maxUses, $minOrder, $perCustomer, $startsAt, $expiresAt): array {
            $batch = DiscountCardBatch::create([
                'name' => trim((string) $data['name']),
                'type' => $type,
                'discount_value' => $value,
                'min_order_laar' => $minOrder,
                'starts_at' => $startsAt,
                'expires_at' => $expiresAt,
                'max_uses_per_card' => $maxUses,
                'max_uses_per_customer' => $perCustomer,
                'quantity' => $quantity,
                'note' => isset($data['note']) ? (trim((string) $data['note']) ?: null) : null,
                'created_by' => $issuer->id,
            ]);

            $cards = [];
            for ($i = 1; $i <= $quantity; $i++) {
                $code = $this->uniqueCode();
                $promo = Promotion::create([
                    'name' => $batch->name.($quantity > 1 ? " #{$i}" : ''),
                    'code' => $code,
                    'type' => $type,
                    'discount_value' => $value,
                    'is_active' => true,
                    'starts_at' => $batch->starts_at,
                    'expires_at' => $batch->expires_at,
                    'max_uses' => $maxUses,
                    'max_uses_per_customer' => $perCustomer,
                    'stackable' => false,
                    'min_order_laar' => $minOrder,
                    'scope' => 'order',
                    'metadata' => [
                        'kind' => self::KIND,
                        'batch_id' => $batch->id,
                        'issued_by' => $issuer->id,
                        'card_index' => $i,
                    ],
                ]);

                $cards[] = [
                    'id' => $promo->id,
                    'code' => $promo->code,
                    'name' => $promo->name,
                    'expires_at' => $promo->expires_at?->toIso8601String(),
                ];
            }

            return ['batch' => $batch->fresh(), 'cards' => $cards];
        });
    }

    public function voidCard(Promotion $promo): Promotion
    {
        $meta = is_array($promo->metadata) ? $promo->metadata : [];
        if (($meta['kind'] ?? null) !== self::KIND) {
            throw new \InvalidArgumentException('Not a discount card.');
        }

        $promo->update(['is_active' => false]);
        $promo->delete(); // soft-delete

        return $promo->fresh() ?? $promo;
    }

    private function uniqueCode(): string
    {
        for ($attempt = 0; $attempt < 20; $attempt++) {
            $code = 'DC-'.strtoupper(Str::random(4)).'-'.strtoupper(Str::random(4));
            if (! Promotion::withTrashed()->where('code', $code)->exists()) {
                return $code;
            }
        }

        throw new \RuntimeException('Could not generate a unique discount card code.');
    }
}

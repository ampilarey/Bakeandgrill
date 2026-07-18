<?php

declare(strict_types=1);

namespace App\Domains\Payments\Services;

use App\Models\GiftCardPurchase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Crypt;

/**
 * Short-lived encrypted plaintext for customer purchase resend.
 * Never stored on gift_cards — only hashed there. Window is Cache + TTL.
 */
final class GiftCardPurchaseDeliveryWindow
{
    public const MAX_RESENDS = 3;

    public const TTL_HOURS = 48;

    public static function cacheKey(int $purchaseId): string
    {
        return 'gift_card_purchase_code:' . $purchaseId;
    }

    public function store(GiftCardPurchase $purchase, string $plainCode): void
    {
        $expiresAt = now()->addHours(self::TTL_HOURS);

        Cache::put(
            self::cacheKey((int) $purchase->id),
            Crypt::encryptString($plainCode),
            $expiresAt,
        );

        $purchase->update([
            'code_delivery_expires_at' => $expiresAt,
        ]);
    }

    public function plainCode(GiftCardPurchase $purchase): ?string
    {
        $encrypted = Cache::get(self::cacheKey((int) $purchase->id));
        if (!is_string($encrypted) || $encrypted === '') {
            return null;
        }

        try {
            return Crypt::decryptString($encrypted);
        } catch (\Throwable) {
            return null;
        }
    }

    public function canResend(GiftCardPurchase $purchase): bool
    {
        if (!$purchase->gift_card_id) {
            return false;
        }

        if ((int) $purchase->resend_count >= self::MAX_RESENDS) {
            return false;
        }

        if ($purchase->code_delivery_expires_at && $purchase->code_delivery_expires_at->isPast()) {
            return false;
        }

        if (!$purchase->recipient_phone && !$purchase->recipient_email) {
            return false;
        }

        return $this->plainCode($purchase) !== null;
    }
}

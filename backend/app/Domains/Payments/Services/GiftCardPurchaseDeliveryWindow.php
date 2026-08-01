<?php

declare(strict_types=1);

namespace App\Domains\Payments\Services;

use App\Models\GiftCardPurchase;
use App\Support\ResilientCache;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Short-lived encrypted plaintext for customer purchase resend / SMS view link.
 * Stored in cache + DB (encrypted) for 48h — never returned via API JSON except
 * to the recipient via SMS/email resend or the public view token (never to the buyer).
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
        $encrypted = Crypt::encryptString($plainCode);

        try {
            ResilientCache::put(self::cacheKey((int) $purchase->id), $encrypted, $expiresAt);
        } catch (\Throwable) {
            // Redis/file cache optional — DB column is the durable copy.
        }

        $updates = [];
        if (Schema::hasColumn('gift_card_purchases', 'code_delivery_expires_at')) {
            $updates['code_delivery_expires_at'] = $expiresAt;
        }
        if (Schema::hasColumn('gift_card_purchases', 'delivery_code_encrypted')) {
            $updates['delivery_code_encrypted'] = $encrypted;
        }
        if (Schema::hasColumn('gift_card_purchases', 'view_token')
            && (!is_string($purchase->view_token) || $purchase->view_token === '')
        ) {
            $updates['view_token'] = Str::random(48);
        }
        if ($updates === []) {
            return;
        }

        try {
            $purchase->update($updates);
            $purchase->refresh();
        } catch (\Throwable $e) {
            // Missing columns / cache schema drift must not block SMS delivery.
            Log::warning('GiftCardPurchaseDeliveryWindow::store failed', [
                'purchase_id' => $purchase->id,
                'error' => $e->getMessage(),
            ]);
        }
    }

    public function plainCode(GiftCardPurchase $purchase): ?string
    {
        if ($purchase->code_delivery_expires_at && $purchase->code_delivery_expires_at->isPast()) {
            $this->forget($purchase);

            return null;
        }

        $encrypted = null;
        try {
            $fromCache = ResilientCache::get(self::cacheKey((int) $purchase->id));
            if (is_string($fromCache) && $fromCache !== '') {
                $encrypted = $fromCache;
            }
        } catch (\Throwable) {
            // fall through to DB
        }

        if ($encrypted === null
            && Schema::hasColumn('gift_card_purchases', 'delivery_code_encrypted')
            && is_string($purchase->delivery_code_encrypted)
            && $purchase->delivery_code_encrypted !== ''
        ) {
            $encrypted = $purchase->delivery_code_encrypted;
        }

        if ($encrypted === null) {
            return null;
        }

        try {
            return Crypt::decryptString($encrypted);
        } catch (\Throwable) {
            return null;
        }
    }

    public function forget(GiftCardPurchase $purchase): void
    {
        try {
            ResilientCache::forget(self::cacheKey((int) $purchase->id));
        } catch (\Throwable) {
            // ignore
        }

        $updates = [];
        if (Schema::hasColumn('gift_card_purchases', 'delivery_code_encrypted')) {
            $updates['delivery_code_encrypted'] = null;
        }
        if ($updates !== []) {
            $purchase->update($updates);
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

    /** Public SPA URL to view this purchase (requires view_token). */
    public function viewUrl(GiftCardPurchase $purchase): ?string
    {
        $token = is_string($purchase->view_token) ? $purchase->view_token : '';
        if ($token === '') {
            return null;
        }

        $base = rtrim((string) config('app.url'), '/');

        return $base . '/order/gift-cards/v/' . $token;
    }
}

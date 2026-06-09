<?php

declare(strict_types=1);

namespace App\Domains\Payments\Services;

use App\Models\GiftCard;
use Illuminate\Support\Str;

final class GiftCardCodeService
{
    public function normalize(string $code): string
    {
        return strtoupper(preg_replace('/\s+/', '', $code) ?? '');
    }

    public function hash(string $code): string
    {
        $key = (string) config('app.key');

        return hash_hmac('sha256', $this->normalize($code), $key);
    }

    public function last4(string $code): string
    {
        $normalized = $this->normalize($code);

        return substr($normalized, -4);
    }

    /**
     * @return array{plain: string, hash: string, last4: string}
     */
    public function generate(): array
    {
        for ($attempt = 0; $attempt < 10; $attempt++) {
            $plain = strtoupper(
                Str::random(4) . '-' . Str::random(4) . '-' . Str::random(4) . '-' . Str::random(4),
            );
            $hash = $this->hash($plain);

            if (!GiftCard::where('code_hash', $hash)->exists()) {
                return [
                    'plain' => $plain,
                    'hash' => $hash,
                    'last4' => $this->last4($plain),
                ];
            }
        }

        throw new \RuntimeException('Could not generate a unique gift card code.');
    }

    public function findByCode(string $code): ?GiftCard
    {
        return GiftCard::where('code_hash', $this->hash($code))->first();
    }

    public function findActiveByCodeForUpdate(string $code): ?GiftCard
    {
        return GiftCard::where('code_hash', $this->hash($code))
            ->where('status', 'active')
            ->lockForUpdate()
            ->first();
    }
}

<?php

declare(strict_types=1);

namespace App\Domains\Payments\Services;

use App\Models\GiftCard;

final class GiftCardCodeService
{
    /**
     * Human-friendly alphabet for generated codes — omits 0/O, 1/I/L to avoid
     * transcription errors when read from SMS or printed receipts. Hashing
     * itself is untouched; only new codes are drawn from this set.
     */
    public const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

    /**
     * Canonical form for hashing: uppercase, no spaces or hyphens.
     * Lets customers enter ABCD-EFGH-IJKL-MNOP or ABCDEFGHIJKLMNOP.
     */
    public function normalize(string $code): string
    {
        return strtoupper(preg_replace('/[\s\-]+/', '', $code) ?? '');
    }

    /** Legacy normalize kept hyphens — used only for looking up pre-migration hashes. */
    public function normalizeLegacy(string $code): string
    {
        return strtoupper(preg_replace('/\s+/', '', $code) ?? '');
    }

    public function hash(string $code): string
    {
        return $this->hmac($this->normalize($code));
    }

    public function hashLegacy(string $code): string
    {
        return $this->hmac($this->normalizeLegacy($code));
    }

    private function hmac(string $normalized): string
    {
        $key = (string) config('app.key');

        return hash_hmac('sha256', $normalized, $key);
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
            $plain = self::randomGroup(4) . '-' . self::randomGroup(4)
                . '-' . self::randomGroup(4) . '-' . self::randomGroup(4);
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

    private static function randomGroup(int $length): string
    {
        $alphabet = self::CODE_ALPHABET;
        $max = strlen($alphabet) - 1;
        $out = '';
        for ($i = 0; $i < $length; $i++) {
            $out .= $alphabet[random_int(0, $max)];
        }

        return $out;
    }

    public function findByCode(string $code): ?GiftCard
    {
        $hashes = array_values(array_unique([
            $this->hash($code),
            $this->hashLegacy($code),
        ]));

        return GiftCard::whereIn('code_hash', $hashes)->first();
    }

    public function findActiveByCodeForUpdate(string $code): ?GiftCard
    {
        $hashes = array_values(array_unique([
            $this->hash($code),
            $this->hashLegacy($code),
        ]));

        return GiftCard::whereIn('code_hash', $hashes)
            ->where('status', 'active')
            ->lockForUpdate()
            ->first();
    }
}

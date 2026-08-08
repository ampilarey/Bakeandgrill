<?php

declare(strict_types=1);

namespace App\Domains\Auth\Services;

use App\Domains\Orders\Support\DiscountSettings;
use Illuminate\Support\Facades\Hash;

/**
 * Shared one-time approval code helpers used by discount approval and refund OTP.
 * Same generate / hash / TTL / attempt rules — not a second OTP system.
 */
final class ApprovalOtpCoder
{
    /** @return array{plain: string, hash: string, expires_at: \Illuminate\Support\Carbon, ttl_minutes: int} */
    public function issue(): array
    {
        $ttl = DiscountSettings::codeTtlMinutes();
        $plain = str_pad((string) random_int(0, 9999), 4, '0', STR_PAD_LEFT);

        return [
            'plain' => $plain,
            'hash' => Hash::make($plain),
            'expires_at' => now()->addMinutes($ttl),
            'ttl_minutes' => $ttl,
        ];
    }

    public function maxAttempts(): int
    {
        return DiscountSettings::maxAttempts();
    }

    /**
     * @param  callable(array{attempts?: int, expired?: bool, failed?: bool}): void  $persist
     *         Called to persist attempt / expiry / failure state on the host record.
     * @param  'approval'|'verification'  $label  Wording for expiry / missing-code messages.
     */
    public function assertValid(
        ?string $codeHash,
        ?\DateTimeInterface $expiresAt,
        int $attempts,
        string $plainCode,
        callable $persist,
        string $label = 'verification',
    ): void {
        $noun = $label === 'approval' ? 'Approval code' : 'Verification code';

        if ($codeHash === null || $codeHash === '') {
            abort(422, "No {$label} code has been issued.");
        }

        if ($expiresAt === null || now()->greaterThan($expiresAt)) {
            $persist(['expired' => true]);
            abort(422, $label === 'approval' ? 'Approval code expired.' : 'Verification code expired. Request a new code.');
        }

        $max = $this->maxAttempts();
        if ($attempts >= $max) {
            $persist(['failed' => true]);
            abort(422, 'Too many attempts. Request a new code.');
        }

        $code = trim($plainCode);
        if ($code === '' || ! Hash::check($code, $codeHash)) {
            $next = $attempts + 1;
            $failed = $next >= $max;
            $persist(['attempts' => $next, 'failed' => $failed]);
            if ($failed) {
                abort(422, 'Too many attempts. Request a new code.');
            }
            abort(422, 'Invalid code.');
        }

        unset($noun);
    }
}

<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\Cache;

/**
 * Everything the second factor does to a staff account: enrolling, proving,
 * turning off, and the recovery codes for when the phone is gone.
 *
 * The shape of this is driven by one failure mode. A restaurant's admin panel
 * has one owner, and if 2FA locks that account there is no help desk to call —
 * so there are three ways back in, deliberately: a recovery code the owner
 * kept, another owner clearing it from Admin -> Staff, and `staff:2fa-disable`
 * over SSH. The last of those needs no login at all, which is the point.
 */
final class TwoFactorService
{
    public const RECOVERY_CODE_COUNT = 8;

    /**
     * No 0/O/1/I/L: these are read off a phone screen and written on paper,
     * and a code nobody can transcribe is not a recovery code.
     */
    private const RECOVERY_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

    private const RECOVERY_CODE_LENGTH = 10;

    public function __construct(private readonly AuditLogService $audit) {}

    /**
     * Start enrolment: a secret is stored, but nothing is enforced yet.
     *
     * Confirmation is a separate step on purpose. Writing the secret and
     * switching on the login gate in one move would lock out anyone whose
     * camera failed to scan the QR code.
     *
     * @return array{secret: string, uri: string, secret_display: string}
     */
    public function beginEnrolment(User $user): array
    {
        $secret = Totp::generateSecret();

        $user->forceFill([
            'two_factor_secret' => $secret,
            'two_factor_recovery_codes' => null,
            'two_factor_confirmed_at' => null,
        ])->save();

        return [
            'secret' => $secret,
            'secret_display' => Totp::formatSecretForDisplay($secret),
            'uri' => Totp::provisioningUri(
                $secret,
                $user->email ?: ($user->phone ?? ('staff-' . $user->id)),
                (string) config('twofactor.issuer'),
            ),
        ];
    }

    /**
     * Finish enrolment by proving a code off the phone.
     *
     * @return list<string>|null the recovery codes, shown once, or null if the
     *                           code did not verify
     */
    public function confirmEnrolment(User $user, string $code, mixed $request = null): ?array
    {
        $secret = $user->two_factor_secret;

        if (!is_string($secret) || $secret === '') {
            return null;
        }

        $counter = Totp::verify($secret, $code);
        if ($counter === null) {
            return null;
        }

        $plain = $this->freshRecoveryCodes();

        $user->forceFill([
            'two_factor_confirmed_at' => now(),
            'two_factor_recovery_codes' => $this->hashAll($plain),
        ])->save();

        $this->rememberStep($user, $counter);

        $this->audit->log(
            'auth.two_factor_enabled',
            User::class,
            $user->id,
            [],
            [],
            [],
            $request,
        );

        return $plain;
    }

    /**
     * Check a code at sign-in. Accepts a TOTP or an unused recovery code.
     *
     * Returns 'totp', 'recovery', or null. The caller needs to know which:
     * signing in with a recovery code means the phone is gone, and the person
     * should be told how many codes they have left.
     */
    public function verify(User $user, string $code, mixed $request = null): ?string
    {
        if (!$user->hasTwoFactorEnabled()) {
            return null;
        }

        $secret = $user->two_factor_secret;

        if (is_string($secret) && $secret !== '') {
            $counter = Totp::verify($secret, $code);

            // A code is good for its 30-second step, which means a code read
            // over someone's shoulder — or captured in transit — is usable
            // until it expires. Accepting each step at most once closes that.
            if ($counter !== null && !$this->stepAlreadyUsed($user, $counter)) {
                $this->rememberStep($user, $counter);

                return 'totp';
            }
        }

        if ($this->consumeRecoveryCode($user, $code)) {
            $this->audit->log(
                'auth.two_factor_recovery_used',
                User::class,
                $user->id,
                [],
                [],
                ['remaining' => count($user->two_factor_recovery_codes ?? [])],
                $request,
            );

            return 'recovery';
        }

        return null;
    }

    /** How many recovery codes are still unused. */
    public function remainingRecoveryCodes(User $user): int
    {
        return count($user->two_factor_recovery_codes ?? []);
    }

    /**
     * Turn the second factor off and forget the secret.
     *
     * $by records who did it, because "an owner cleared it for a staff member
     * who lost their phone" and "the account holder turned it off" are very
     * different events to find in the log a month later.
     */
    public function disable(User $user, ?User $by = null, mixed $request = null): void
    {
        $wasEnabled = $user->hasTwoFactorEnabled();

        $user->forceFill([
            'two_factor_secret' => null,
            'two_factor_recovery_codes' => null,
            'two_factor_confirmed_at' => null,
        ])->save();

        Cache::forget($this->stepKey($user));

        if ($wasEnabled) {
            $this->audit->log(
                'auth.two_factor_disabled',
                User::class,
                $user->id,
                [],
                [],
                ['disabled_by' => $by?->id, 'self' => $by !== null && $by->id === $user->id],
                $request,
            );
        }
    }

    /**
     * Issue a new set and discard the old — for someone who has used most of
     * theirs, or thinks the paper went missing.
     *
     * @return list<string>
     */
    public function regenerateRecoveryCodes(User $user, mixed $request = null): array
    {
        $plain = $this->freshRecoveryCodes();

        $user->forceFill(['two_factor_recovery_codes' => $this->hashAll($plain)])->save();

        $this->audit->log(
            'auth.two_factor_recovery_regenerated',
            User::class,
            $user->id,
            [],
            [],
            [],
            $request,
        );

        return $plain;
    }

    // ── Recovery codes ────────────────────────────────────────────────────

    /** @return list<string> */
    private function freshRecoveryCodes(): array
    {
        return array_map(
            fn () => $this->randomRecoveryCode(),
            range(1, self::RECOVERY_CODE_COUNT),
        );
    }

    private function randomRecoveryCode(): string
    {
        $max = strlen(self::RECOVERY_ALPHABET) - 1;
        $code = '';

        for ($i = 0; $i < self::RECOVERY_CODE_LENGTH; $i++) {
            $code .= self::RECOVERY_ALPHABET[random_int(0, $max)];
        }

        // Hyphenated in the middle so it reads as something to write down.
        return substr($code, 0, 5) . '-' . substr($code, 5);
    }

    /**
     * SHA-256, not bcrypt.
     *
     * Bcrypt exists to slow down guessing at low-entropy secrets — passwords
     * people chose. A recovery code is ten characters this server picked at
     * random from a 31-character alphabet, which is ~49 bits: guessing is not
     * the threat, and a bcrypt scan across eight codes would put most of a
     * second on every failed sign-in. This is how Sanctum stores its own API
     * tokens, for the same reason.
     *
     * @param  list<string>  $plain
     * @return list<string>
     */
    private function hashAll(array $plain): array
    {
        return array_map(
            fn (string $code) => hash('sha256', $this->normalizeRecoveryCode($code)),
            $plain,
        );
    }

    /** Single-use: a matched code is removed before the sign-in completes. */
    private function consumeRecoveryCode(User $user, string $candidate): bool
    {
        $stored = $user->two_factor_recovery_codes ?? [];

        if ($stored === []) {
            return false;
        }

        $normalized = $this->normalizeRecoveryCode($candidate);

        // A recovery code and a 6-digit TOTP are never confused, but an empty
        // or junk input must not match a stray empty entry.
        if (strlen($normalized) !== self::RECOVERY_CODE_LENGTH) {
            return false;
        }

        $hash = hash('sha256', $normalized);
        $remaining = [];
        $matched = false;

        foreach ($stored as $entry) {
            if (!$matched && is_string($entry) && hash_equals($entry, $hash)) {
                $matched = true;

                continue;
            }
            $remaining[] = $entry;
        }

        if (!$matched) {
            return false;
        }

        $user->forceFill(['two_factor_recovery_codes' => array_values($remaining)])->save();

        return true;
    }

    /** Codes are written on paper and typed back with or without the hyphen. */
    private function normalizeRecoveryCode(string $code): string
    {
        return strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $code) ?? '');
    }

    // ── Replay guard ──────────────────────────────────────────────────────

    private function stepAlreadyUsed(User $user, int $counter): bool
    {
        return $counter <= (int) Cache::get($this->stepKey($user), 0);
    }

    private function rememberStep(User $user, int $counter): void
    {
        // Long enough to cover the accepted drift window several times over;
        // an expired entry only means an old code becomes reusable, and by
        // then it is outside the drift window anyway.
        Cache::put($this->stepKey($user), $counter, now()->addMinutes(5));
    }

    private function stepKey(User $user): string
    {
        return "2fa:last-step:{$user->id}";
    }
}

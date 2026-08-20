<?php

declare(strict_types=1);

namespace App\Services;

/**
 * RFC 6238 time-based one-time passwords, and the RFC 4648 base32 the
 * authenticator apps expect the shared secret in.
 *
 * Written out rather than pulled in as a package: the algorithm is eighty
 * lines, it is frozen by the RFC, and RFC 6238 Appendix B publishes test
 * vectors — so it can be proved correct rather than trusted. TotpTest checks
 * every published vector.
 *
 * SHA-1 is not a mistake here. TOTP's HMAC-SHA1 is unaffected by the collision
 * attacks that retired SHA-1 for signatures, and it is what Google
 * Authenticator, Authy, 1Password and iOS Passwords all assume when an
 * otpauth:// URI omits the algorithm. Choosing SHA-256 would mean staff whose
 * app ignores the parameter silently get codes that never work.
 */
final class Totp
{
    /** The step every authenticator app assumes. */
    public const PERIOD = 30;

    public const DIGITS = 6;

    private const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

    /** 160 bits — the HMAC-SHA1 block size, and what the RFC recommends. */
    public const SECRET_BYTES = 20;

    /** A fresh base32 secret, ready to hand to an authenticator app. */
    public static function generateSecret(): string
    {
        return self::base32Encode(random_bytes(self::SECRET_BYTES));
    }

    /**
     * The code for one moment in time.
     *
     * @param  string  $secret  base32, as stored and as shown to the user
     */
    public static function codeAt(string $secret, int $timestamp): string
    {
        return self::codeForCounter($secret, intdiv($timestamp, self::PERIOD));
    }

    /**
     * Verify a code, and say which time step matched.
     *
     * Returns the matched counter so the caller can refuse to accept that same
     * step twice — without that, a code shoulder-surfed or captured in transit
     * stays usable for the rest of its window.
     *
     * @param  int  $window  steps of clock drift tolerated either side
     * @return int|null the matched counter, or null if no step matched
     */
    public static function verify(
        string $secret,
        string $code,
        ?int $timestamp = null,
        int $window = 1,
    ): ?int {
        $code = preg_replace('/\D/', '', $code) ?? '';

        if (strlen($code) !== self::DIGITS) {
            return null;
        }

        $counter = intdiv($timestamp ?? time(), self::PERIOD);

        for ($drift = -$window; $drift <= $window; $drift++) {
            // hash_equals, not ===, so the number of matching leading digits
            // cannot be read off the response time.
            if (hash_equals(self::codeForCounter($secret, $counter + $drift), $code)) {
                return $counter + $drift;
            }
        }

        return null;
    }

    /**
     * The otpauth:// URI an authenticator app reads out of a QR code.
     *
     * The label is what the staff member will see in their app's list, so it
     * has to identify both the venue and the account — someone with a personal
     * Google account and a Bake & Grill login needs to tell them apart.
     */
    public static function provisioningUri(string $secret, string $account, string $issuer): string
    {
        $label = rawurlencode($issuer) . ':' . rawurlencode($account);

        return 'otpauth://totp/' . $label . '?' . http_build_query([
            'secret' => $secret,
            'issuer' => $issuer,
            'algorithm' => 'SHA1',
            'digits' => self::DIGITS,
            'period' => self::PERIOD,
        ], '', '&', PHP_QUERY_RFC3986);
    }

    /**
     * The secret in groups of four, for someone typing it in by hand because
     * the QR code will not scan.
     */
    public static function formatSecretForDisplay(string $secret): string
    {
        return trim(chunk_split($secret, 4, ' '));
    }

    private static function codeForCounter(string $secret, int $counter): string
    {
        $key = self::base32Decode($secret);

        // 8-byte big-endian counter, per RFC 4226 §5.1.
        $hash = hash_hmac('sha1', pack('J', $counter), $key, true);

        // Dynamic truncation, RFC 4226 §5.3.
        $offset = ord($hash[19]) & 0x0F;
        $binary = ((ord($hash[$offset]) & 0x7F) << 24)
            | ((ord($hash[$offset + 1]) & 0xFF) << 16)
            | ((ord($hash[$offset + 2]) & 0xFF) << 8)
            | (ord($hash[$offset + 3]) & 0xFF);

        return str_pad(
            (string) ($binary % (10 ** self::DIGITS)),
            self::DIGITS,
            '0',
            STR_PAD_LEFT,
        );
    }

    public static function base32Encode(string $bytes): string
    {
        if ($bytes === '') {
            return '';
        }

        $bits = '';
        foreach (str_split($bytes) as $byte) {
            $bits .= str_pad(decbin(ord($byte)), 8, '0', STR_PAD_LEFT);
        }

        $out = '';
        foreach (str_split($bits, 5) as $chunk) {
            $out .= self::BASE32_ALPHABET[bindec(str_pad($chunk, 5, '0', STR_PAD_RIGHT))];
        }

        // Padding to a 40-bit boundary, so the string round-trips through
        // tools that insist on it.
        return str_pad($out, (int) (ceil(strlen($out) / 8) * 8), '=');
    }

    public static function base32Decode(string $base32): string
    {
        // Users retype secrets with the spaces we printed, and some apps
        // lowercase them.
        $base32 = strtoupper(preg_replace('/[^A-Za-z2-7]/', '', $base32) ?? '');

        if ($base32 === '') {
            return '';
        }

        $bits = '';
        foreach (str_split($base32) as $char) {
            $index = strpos(self::BASE32_ALPHABET, $char);
            if ($index === false) {
                continue;
            }
            $bits .= str_pad(decbin($index), 5, '0', STR_PAD_LEFT);
        }

        $out = '';
        foreach (str_split($bits, 8) as $chunk) {
            // A trailing partial group is base32 padding, not data.
            if (strlen($chunk) === 8) {
                $out .= chr(bindec($chunk));
            }
        }

        return $out;
    }
}

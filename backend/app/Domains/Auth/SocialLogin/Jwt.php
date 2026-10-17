<?php

declare(strict_types=1);

namespace App\Domains\Auth\SocialLogin;

use RuntimeException;

/**
 * The little JSON Web Token work social sign-in needs, without a JWT package: reading the claims
 * of an ID token received straight from a provider's token endpoint, and signing Apple's client
 * secret with ES256.
 */
final class Jwt
{
    public static function base64UrlEncode(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    public static function base64UrlDecode(string $data): ?string
    {
        $decoded = base64_decode(strtr($data, '-_', '+/') . str_repeat('=', (4 - strlen($data) % 4) % 4), true);

        return $decoded === false ? null : $decoded;
    }

    /**
     * The claims of a token, or null when it is not a well-formed JWT. The signature is not
     * checked: only use this for a token received directly from the provider's token endpoint
     * over TLS (OpenID Connect Core 3.1.3.7), then check iss, aud, exp and nonce.
     *
     * @return array<string, mixed>|null
     */
    public static function claims(string $jwt): ?array
    {
        $parts = explode('.', $jwt);
        if (count($parts) !== 3) {
            return null;
        }

        $json = self::base64UrlDecode($parts[1]);
        $claims = $json === null ? null : json_decode($json, true);

        return is_array($claims) ? $claims : null;
    }

    /**
     * A token signed with ES256 (ECDSA P-256 with SHA-256), as Apple wants its client secret.
     *
     * @param array<string, mixed> $header
     * @param array<string, mixed> $payload
     */
    public static function signEs256(array $header, array $payload, string $privateKeyPem): string
    {
        $input = self::base64UrlEncode((string) json_encode($header + ['alg' => 'ES256', 'typ' => 'JWT'], JSON_UNESCAPED_SLASHES))
            . '.' . self::base64UrlEncode((string) json_encode($payload, JSON_UNESCAPED_SLASHES));

        $key = openssl_pkey_get_private($privateKeyPem);
        if ($key === false || !openssl_sign($input, $der, $key, OPENSSL_ALGO_SHA256)) {
            throw new RuntimeException('The Sign in with Apple key could not be used to sign: check APPLE_PRIVATE_KEY.');
        }

        return $input . '.' . self::base64UrlEncode(self::derToRaw($der));
    }

    /**
     * OpenSSL signs ECDSA as DER (SEQUENCE { INTEGER r, INTEGER s }); a JWT wants the two numbers
     * as fixed-length big-endian bytes, r then s (RFC 7518 3.4): 32 + 32 for P-256.
     */
    public static function derToRaw(string $der, int $partLength = 32): string
    {
        $offset = 0;
        $byte = function () use ($der, &$offset): int {
            if ($offset >= strlen($der)) {
                throw new RuntimeException('Invalid ECDSA signature.');
            }

            return ord($der[$offset++]);
        };
        $length = function () use ($byte): int {
            $length = $byte();
            if ($length & 0x80) {
                $count = $length & 0x7F;
                for ($length = 0; $count > 0; $count--) {
                    $length = ($length << 8) | $byte();
                }
            }

            return $length;
        };

        if ($byte() !== 0x30) {
            throw new RuntimeException('Invalid ECDSA signature.');
        }
        $length();

        $raw = '';
        foreach (['r', 's'] as $part) {
            if ($byte() !== 0x02) {
                throw new RuntimeException('Invalid ECDSA signature.');
            }
            $size = $length();
            $integer = ltrim(substr($der, $offset, $size), "\x00"); // DER pads a high first bit with 0x00
            $offset += $size;
            if (strlen($integer) > $partLength) {
                throw new RuntimeException('Invalid ECDSA signature.');
            }
            $raw .= str_pad($integer, $partLength, "\x00", STR_PAD_LEFT);
        }

        return $raw;
    }
}

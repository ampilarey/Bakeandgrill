<?php

declare(strict_types=1);

namespace App\Domains\Auth\SocialLogin;

use RuntimeException;

/**
 * Sign in with Apple (the web flow). The client secret is a short-lived ES256 JWT signed with the
 * .p8 key from the Apple developer account. Apple answers with response_mode=form_post: a POST
 * from appleid.apple.com, which the session cookie does not come with, so that route hands the
 * fields to the normal callback (SocialLoginController::applePost). Apple sends the name only the
 * first time someone signs in, in the "user" field. Apple does not document PKCE for the web
 * flow, so state and the ID token's nonce protect it.
 */
class AppleProvider extends Provider
{
    public const AUTHORIZE_URL = 'https://appleid.apple.com/auth/authorize';

    public const TOKEN_URL = 'https://appleid.apple.com/auth/token';

    public const ISSUER = 'https://appleid.apple.com';

    public function name(): string
    {
        return 'apple';
    }

    public function label(): string
    {
        return 'Apple';
    }

    public function configured(): bool
    {
        return $this->clientId() !== '' && $this->setting('team_id') !== '' && $this->setting('key_id') !== '' && $this->privateKey() !== null;
    }

    public function usesPkce(): bool
    {
        return false;
    }

    public function authorizeUrl(string $state, string $nonce, ?string $codeChallenge): string
    {
        return self::AUTHORIZE_URL . '?' . $this->query([
            'client_id' => $this->clientId(),
            'redirect_uri' => $this->redirectUri(),
            'response_type' => 'code',
            'response_mode' => 'form_post',
            'scope' => 'name email',
            'state' => $state,
            'nonce' => $nonce,
        ]);
    }

    public function profile(string $code, ?string $codeVerifier, string $nonce, array $callback): SocialProfile
    {
        try {
            $secret = $this->clientSecret();
        } catch (RuntimeException $e) {
            report($e);

            throw SocialLoginException::failed($this->label());
        }

        $response = $this->http()->asForm()->post(self::TOKEN_URL, [
            'grant_type' => 'authorization_code',
            'code' => $code,
            'redirect_uri' => $this->redirectUri(),
            'client_id' => $this->clientId(),
            'client_secret' => $secret,
        ]);
        if (!$response->successful()) {
            throw SocialLoginException::failed($this->label());
        }

        $claims = $this->idTokenClaims($response->json('id_token'), [self::ISSUER], $nonce);

        return new SocialProfile(
            'apple',
            (string) $claims['sub'],
            is_string($claims['email'] ?? null) ? $claims['email'] : null,
            self::isTrue($claims['email_verified'] ?? false),
            self::firstTimeName($callback['user'] ?? null),
        );
    }

    /**
     * The client secret: a JWT signed with the .p8 key, valid for five minutes (Apple allows six
     * months; a fresh one per sign-in means none is ever stored).
     */
    public function clientSecret(): string
    {
        $key = $this->privateKey();
        if ($key === null) {
            throw new RuntimeException('No Sign in with Apple key: set APPLE_PRIVATE_KEY or APPLE_PRIVATE_KEY_PATH.');
        }

        $now = now()->getTimestamp();

        return Jwt::signEs256(['kid' => $this->setting('key_id')], [
            'iss' => $this->setting('team_id'),
            'iat' => $now,
            'exp' => $now + 300,
            'aud' => self::ISSUER,
            'sub' => $this->clientId(),
        ], $key);
    }

    /**
     * The .p8 key as PEM: from APPLE_PRIVATE_KEY (the file's contents; "\n" may be written for line
     * breaks, and the BEGIN/END lines may be left out) or the file at APPLE_PRIVATE_KEY_PATH.
     */
    public function privateKey(): ?string
    {
        $key = $this->setting('private_key');
        if ($key === '' && ($path = $this->setting('private_key_path')) !== '') {
            $path = str_starts_with($path, '/') ? $path : base_path($path);
            $key = is_readable($path) ? trim((string) file_get_contents($path)) : '';
        }
        if ($key === '') {
            return null;
        }

        $key = str_replace(['\\n', "\r"], ["\n", ''], $key);
        if (!str_contains($key, '-----BEGIN')) {
            $key = "-----BEGIN PRIVATE KEY-----\n" . chunk_split(preg_replace('/\s+/', '', $key) ?? '', 64, "\n") . '-----END PRIVATE KEY-----';
        }

        return $key;
    }

    /**
     * The name Apple sends (once) in the form post's "user" field: {"name": {"firstName", "lastName"}}.
     */
    protected static function firstTimeName(mixed $user): ?string
    {
        $data = is_string($user) ? json_decode($user, true) : null;
        $name = is_array($data) ? ($data['name'] ?? null) : null;
        if (!is_array($name)) {
            return null;
        }

        $full = trim(implode(' ', array_filter([$name['firstName'] ?? null, $name['lastName'] ?? null], 'is_string')));

        return $full !== '' ? mb_substr($full, 0, 255) : null;
    }
}

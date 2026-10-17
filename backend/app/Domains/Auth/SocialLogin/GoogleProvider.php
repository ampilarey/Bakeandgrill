<?php

declare(strict_types=1);

namespace App\Domains\Auth\SocialLogin;

/**
 * Sign in with Google: OpenID Connect with PKCE. Google says whether the email is verified.
 */
class GoogleProvider extends Provider
{
    public const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

    public const TOKEN_URL = 'https://oauth2.googleapis.com/token';

    public const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

    public function name(): string
    {
        return 'google';
    }

    public function label(): string
    {
        return 'Google';
    }

    public function configured(): bool
    {
        return $this->clientId() !== '' && $this->setting('client_secret') !== '';
    }

    public function authorizeUrl(string $state, string $nonce, ?string $codeChallenge): string
    {
        return self::AUTHORIZE_URL . '?' . $this->query([
            'client_id' => $this->clientId(),
            'redirect_uri' => $this->redirectUri(),
            'response_type' => 'code',
            'scope' => 'openid email profile',
            'state' => $state,
            'nonce' => $nonce,
            'code_challenge' => $codeChallenge,
            'code_challenge_method' => 'S256',
            'prompt' => 'select_account',
        ]);
    }

    public function profile(string $code, ?string $codeVerifier, string $nonce, array $callback): SocialProfile
    {
        $response = $this->http()->asForm()->post(self::TOKEN_URL, [
            'grant_type' => 'authorization_code',
            'code' => $code,
            'redirect_uri' => $this->redirectUri(),
            'client_id' => $this->clientId(),
            'client_secret' => $this->setting('client_secret'),
            'code_verifier' => $codeVerifier,
        ]);
        if (!$response->successful()) {
            throw SocialLoginException::failed($this->label());
        }

        $claims = $this->idTokenClaims($response->json('id_token'), self::ISSUERS, $nonce);

        return new SocialProfile(
            'google',
            (string) $claims['sub'],
            is_string($claims['email'] ?? null) ? $claims['email'] : null,
            self::isTrue($claims['email_verified'] ?? false),
            is_string($claims['name'] ?? null) ? $claims['name'] : null,
        );
    }
}

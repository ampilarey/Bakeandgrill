<?php

declare(strict_types=1);

namespace App\Domains\Auth\SocialLogin;

/**
 * Facebook Login, built by hand (no SDK). With PKCE (the default) it uses Facebook's OpenID
 * Connect flow, which is where Facebook supports code_challenge; FACEBOOK_PKCE=false falls back
 * to the classic code flow. Either way the name and email come from the Graph API.
 *
 * Facebook does not say whether the email was verified, so a Facebook sign-in never joins an
 * account that already exists by email (SocialLoginService).
 */
class FacebookProvider extends Provider
{
    public function name(): string
    {
        return 'facebook';
    }

    public function label(): string
    {
        return 'Facebook';
    }

    public function configured(): bool
    {
        return $this->clientId() !== '' && $this->setting('client_secret') !== '';
    }

    public function usesPkce(): bool
    {
        return (bool) config('services.facebook.pkce', true);
    }

    protected function version(): string
    {
        return $this->setting('graph_version') ?: 'v25.0';
    }

    public function authorizeUrl(string $state, string $nonce, ?string $codeChallenge): string
    {
        $pkce = $this->usesPkce();

        return 'https://www.facebook.com/' . $this->version() . '/dialog/oauth?' . $this->query([
            'client_id' => $this->clientId(),
            'redirect_uri' => $this->redirectUri(),
            'response_type' => 'code',
            'scope' => $pkce ? 'openid email public_profile' : 'email,public_profile',
            'state' => $state,
            'nonce' => $pkce ? $nonce : null,
            'code_challenge' => $pkce ? $codeChallenge : null,
            'code_challenge_method' => $pkce ? 'S256' : null,
        ]);
    }

    public function profile(string $code, ?string $codeVerifier, string $nonce, array $callback): SocialProfile
    {
        $graph = 'https://graph.facebook.com/' . $this->version();
        $secret = $this->setting('client_secret');

        $token = $this->http()->get($graph . '/oauth/access_token', array_filter([
            'client_id' => $this->clientId(),
            'client_secret' => $secret,
            'redirect_uri' => $this->redirectUri(),
            'code' => $code,
            'code_verifier' => $this->usesPkce() ? $codeVerifier : null,
        ]));
        $accessToken = $token->json('access_token');
        if (!$token->successful() || !is_string($accessToken) || $accessToken === '') {
            throw SocialLoginException::failed($this->label());
        }

        // The OpenID Connect flow also returns an ID token: it must be for this app and attempt
        $claims = $this->usesPkce() ? $this->idTokenClaims($token->json('id_token'), null, $nonce) : null;

        $me = $this->http()->get($graph . '/me', [
            'fields' => 'id,name,email',
            'access_token' => $accessToken,
            'appsecret_proof' => hash_hmac('sha256', $accessToken, $secret),
        ]);
        $id = $me->json('id');
        if (!$me->successful() || !is_string($id) || $id === '' || ($claims && $claims['sub'] !== $id)) {
            throw SocialLoginException::failed($this->label());
        }

        $email = $me->json('email');
        $name = $me->json('name');

        return new SocialProfile('facebook', $id, is_string($email) ? $email : null, false, is_string($name) ? $name : null);
    }
}

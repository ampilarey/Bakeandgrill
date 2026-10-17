<?php

declare(strict_types=1);

namespace App\Domains\Auth\SocialLogin;

use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Http;

/**
 * One sign-in provider: the OAuth 2 / OpenID Connect authorization-code flow with `state`, a
 * `nonce` in the ID token and PKCE where the provider supports it, over Laravel's Http client.
 * Keys come from config/services.php (docs/SOCIAL_LOGIN.md).
 */
abstract class Provider
{
    /** google, facebook or apple (the route parameter and social_accounts.provider). */
    abstract public function name(): string;

    /** The name on the button. */
    abstract public function label(): string;

    /** Are its keys set? Only then does its button show. */
    abstract public function configured(): bool;

    /**
     * The provider's sign-in page for this attempt.
     */
    abstract public function authorizeUrl(string $state, string $nonce, ?string $codeChallenge): string;

    /**
     * Exchange the code from the callback and read who signed in.
     *
     * @param array<string, mixed> $callback everything the provider sent back (Apple's first sign-in sends the name)
     *
     * @throws SocialLoginException
     */
    abstract public function profile(string $code, ?string $codeVerifier, string $nonce, array $callback): SocialProfile;

    /** Does the flow use PKCE (code_challenge / code_verifier)? */
    public function usesPkce(): bool
    {
        return true;
    }

    /** Where the provider sends the customer back (registered with the provider, see the docs). */
    public function redirectUri(): string
    {
        return route('customer.social.callback', ['provider' => $this->name()]);
    }

    protected function setting(string $key): string
    {
        return trim((string) config('services.' . $this->name() . '.' . $key));
    }

    protected function clientId(): string
    {
        return $this->setting('client_id');
    }

    protected function http(): PendingRequest
    {
        return Http::acceptJson()->timeout(15)->connectTimeout(10);
    }

    protected function query(array $parameters): string
    {
        return http_build_query(array_filter($parameters, fn ($value) => $value !== null && $value !== ''), '', '&', PHP_QUERY_RFC3986);
    }

    /**
     * The claims of an ID token from the token endpoint, checked: issued by the provider (when
     * $issuers is given), for this app, not expired, and carrying this attempt's nonce.
     *
     * @param list<string>|null $issuers
     * @return array<string, mixed>
     *
     * @throws SocialLoginException
     */
    protected function idTokenClaims(mixed $idToken, ?array $issuers, string $nonce): array
    {
        $claims = is_string($idToken) ? Jwt::claims($idToken) : null;
        $audience = (array) ($claims['aud'] ?? []);

        $valid = is_array($claims)
            && ($issuers === null || in_array($claims['iss'] ?? null, $issuers, true))
            && in_array($this->clientId(), $audience, true)
            && (int) ($claims['exp'] ?? 0) > now()->getTimestamp() - 60
            && is_string($claims['sub'] ?? null) && $claims['sub'] !== ''
            && is_string($claims['nonce'] ?? null) && hash_equals($nonce, $claims['nonce']);

        if (!$valid) {
            throw SocialLoginException::failed($this->label());
        }

        return $claims;
    }

    /** Providers send email_verified as true or as the string "true". */
    protected static function isTrue(mixed $value): bool
    {
        return $value === true || $value === 'true' || $value === 1 || $value === '1';
    }
}

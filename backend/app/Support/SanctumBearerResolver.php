<?php

declare(strict_types=1);

namespace App\Support;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * Resolve a Sanctum personal access token from the Authorization header,
 * mirroring {@see \Laravel\Sanctum\Guard::isValidAccessToken()} validation.
 */
final class SanctumBearerResolver
{
    /**
     * @template T of Model
     *
     * @param class-string<T> $modelClass
     * @return T|null
     */
    public static function resolveTokenable(Request $request, string $modelClass): ?Model
    {
        $bearer = $request->bearerToken();
        if ($bearer === null || $bearer === '') {
            return null;
        }

        $accessToken = PersonalAccessToken::findToken($bearer);
        if ($accessToken === null || !self::isValidAccessToken($accessToken)) {
            return null;
        }

        $tokenable = $accessToken->tokenable;
        if (!($tokenable instanceof $modelClass)) {
            return null;
        }

        return $tokenable->withAccessToken($accessToken);
    }

    public static function bearerTokenIsInvalid(Request $request): bool
    {
        $bearer = $request->bearerToken();
        if ($bearer === null || $bearer === '') {
            return false;
        }

        $accessToken = PersonalAccessToken::findToken($bearer);

        return $accessToken === null || !self::isValidAccessToken($accessToken);
    }

    public static function isValidAccessToken(?PersonalAccessToken $accessToken): bool
    {
        if ($accessToken === null) {
            return false;
        }

        $expiration = config('sanctum.expiration');

        return (!$expiration || $accessToken->created_at->gt(now()->subMinutes((int) $expiration)))
            && (!$accessToken->expires_at || !$accessToken->expires_at->isPast());
    }
}

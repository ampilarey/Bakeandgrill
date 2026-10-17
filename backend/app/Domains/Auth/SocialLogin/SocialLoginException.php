<?php

declare(strict_types=1);

namespace App\Domains\Auth\SocialLogin;

use RuntimeException;

/** A social sign-in that did not work, with words for the customer. */
final class SocialLoginException extends RuntimeException
{
    public static function failed(string $provider): self
    {
        return new self("We could not sign you in with {$provider}. Please try again, or use your phone number.");
    }

    public static function expired(): self
    {
        return new self('That sign-in took too long or was started in another window. Please try again.');
    }

    public static function cancelled(string $provider): self
    {
        return new self("Sign-in with {$provider} was cancelled.");
    }

    public static function staff(): self
    {
        return new self('Staff sign in with their phone and PIN, not with Google, Facebook or Apple.');
    }

    public static function inactive(): self
    {
        return new self('This account has been switched off. Please contact us.');
    }
}

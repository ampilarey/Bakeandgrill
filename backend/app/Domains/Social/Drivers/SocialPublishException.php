<?php

declare(strict_types=1);

namespace App\Domains\Social\Drivers;

use App\Models\SocialPostDelivery;
use RuntimeException;

/**
 * A classified publish failure. `errorClass` steers retry policy:
 * transient/rate_limit retry, auth/validation fail hard, unknown goes to
 * reconcile-before-retry. Messages must never contain credentials — callers
 * pass provider error text, not request payloads.
 */
class SocialPublishException extends RuntimeException
{
    public function __construct(
        public readonly string $errorClass,
        string $message,
    ) {
        parent::__construct($message);
    }

    public static function auth(string $message): self
    {
        return new self(SocialPostDelivery::ERROR_AUTH, $message);
    }

    public static function validation(string $message): self
    {
        return new self(SocialPostDelivery::ERROR_VALIDATION, $message);
    }

    public static function rateLimit(string $message): self
    {
        return new self(SocialPostDelivery::ERROR_RATE_LIMIT, $message);
    }

    public static function transient(string $message): self
    {
        return new self(SocialPostDelivery::ERROR_TRANSIENT, $message);
    }

    /** The provider may or may not have accepted the post (e.g. timeout). */
    public static function unknown(string $message): self
    {
        return new self(SocialPostDelivery::ERROR_UNKNOWN, $message);
    }

    public function isRetryable(): bool
    {
        return in_array($this->errorClass, [
            SocialPostDelivery::ERROR_TRANSIENT,
            SocialPostDelivery::ERROR_RATE_LIMIT,
        ], true);
    }
}

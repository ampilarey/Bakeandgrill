<?php

declare(strict_types=1);

namespace App\Domains\Social\Drivers;

use Carbon\CarbonInterface;

/**
 * What a platform said when asked "does this channel still work?".
 * `ok` means the credentials reach the account; `warning` means they do
 * but will stop soon (token expiry); `error` means a post would fail now.
 */
final readonly class ChannelHealth
{
    public const OK = 'ok';

    public const WARNING = 'warning';

    public const ERROR = 'error';

    public function __construct(
        public string $status,
        public string $message,
        public ?CarbonInterface $tokenExpiresAt = null,
        public ?string $accountLabel = null,
    ) {}

    public static function ok(string $message, ?CarbonInterface $expires = null, ?string $label = null): self
    {
        return new self(self::OK, $message, $expires, $label);
    }

    public static function error(string $message): self
    {
        return new self(self::ERROR, $message);
    }
}

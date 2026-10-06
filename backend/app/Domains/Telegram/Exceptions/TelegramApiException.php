<?php

declare(strict_types=1);

namespace App\Domains\Telegram\Exceptions;

use RuntimeException;

/** Telegram refused a call, or could not be reached. */
class TelegramApiException extends RuntimeException
{
    public function __construct(string $message, public readonly int $errorCode = 0)
    {
        parent::__construct($message);
    }

    /** The person blocked the bot or deleted the chat: stop writing to them. */
    public function isBlocked(): bool
    {
        return $this->errorCode === 403;
    }
}

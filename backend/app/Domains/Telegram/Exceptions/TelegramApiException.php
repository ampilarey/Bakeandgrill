<?php

declare(strict_types=1);

namespace App\Domains\Telegram\Exceptions;

use RuntimeException;

/** Telegram refused a call, or could not be reached. */
class TelegramApiException extends RuntimeException
{
    /**
     * @param bool $mayHaveArrived the request went out but no answer came in
     *                             time: Telegram may well have shown the message, so sending it
     *                             again could show it twice (owner, 2026-10-10)
     */
    public function __construct(string $message, public readonly int $errorCode = 0, public readonly bool $mayHaveArrived = false)
    {
        parent::__construct($message);
    }

    /** The person blocked the bot or deleted the chat: stop writing to them. */
    public function isBlocked(): bool
    {
        return $this->errorCode === 403;
    }
}

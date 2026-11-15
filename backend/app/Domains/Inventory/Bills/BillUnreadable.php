<?php

declare(strict_types=1);

namespace App\Domains\Inventory\Bills;

use RuntimeException;

/** A bill that could not be read. The message is written for the person on the screen. */
final class BillUnreadable extends RuntimeException
{
    /** @param bool $retry whether sending the same bill again may work (busy, timed out) */
    public function __construct(string $message, public readonly bool $retry = false)
    {
        parent::__construct($message);
    }
}

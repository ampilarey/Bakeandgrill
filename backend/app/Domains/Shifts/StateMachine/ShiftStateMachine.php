<?php

declare(strict_types=1);

namespace App\Domains\Shifts\StateMachine;

use App\Domains\Shared\Support\StateMachine;

/**
 * Shift state machine.
 */
class ShiftStateMachine extends StateMachine
{
    protected function statusField(): string
    {
        return 'status';
    }

    protected function transitions(): array
    {
        return [
            'open' => ['closed'],
            'closed' => [],
        ];
    }
}

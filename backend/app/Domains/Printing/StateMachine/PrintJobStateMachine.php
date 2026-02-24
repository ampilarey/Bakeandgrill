<?php

declare(strict_types=1);

namespace App\Domains\Printing\StateMachine;

use App\Domains\Shared\Support\StateMachine;

/**
 * PrintJob status state machine.
 */
class PrintJobStateMachine extends StateMachine
{
    protected function statusField(): string
    {
        return 'status';
    }

    protected function transitions(): array
    {
        return [
            'queued' => ['printing', 'printed', 'failed'],
            'printing' => ['printed', 'failed'],
            'printed' => [],
            'failed' => ['queued'],
        ];
    }
}

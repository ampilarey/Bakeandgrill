<?php

declare(strict_types=1);

namespace App\Domains\KitchenDisplay\StateMachine;

use App\Domains\Shared\Support\StateMachine;

/**
 * Kitchen ticket (order in KDS context) state machine.
 */
class KitchenTicketStateMachine extends StateMachine
{
    protected function statusField(): string
    {
        return 'status';
    }

    protected function transitions(): array
    {
        return [
            'pending' => ['in_progress', 'cancelled'],
            'in_progress' => ['completed', 'pending'],
            'completed' => ['pending'],
            'cancelled' => [],
        ];
    }
}

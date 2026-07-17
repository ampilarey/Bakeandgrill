<?php

declare(strict_types=1);

namespace App\Domains\Orders\StateMachine;

use App\Domains\Shared\Support\StateMachine;

/**
 * @deprecated Not wired in production. Use App\Services\OrderStatusMachine
 *             and OrderStatusTransitionService. Kept for reference / future parity only.
 */
class OrderStateMachine extends StateMachine
{
    protected function statusField(): string
    {
        return 'status';
    }

    protected function transitions(): array
    {
        return [
            'payment_pending' => ['pending', 'paid', 'cancelled'],
            'pending' => ['in_progress', 'held', 'partial', 'paid', 'cancelled'],
            'in_progress' => ['held', 'partial', 'paid', 'completed', 'cancelled'],
            'held' => ['pending', 'cancelled'],
            'partial' => ['paid', 'cancelled'],
            'paid' => ['completed', 'refunded'],
            'completed' => ['refunded'],
            'cancelled' => [],
            'refunded' => [],
        ];
    }
}

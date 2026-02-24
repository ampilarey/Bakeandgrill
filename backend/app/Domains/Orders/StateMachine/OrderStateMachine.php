<?php

declare(strict_types=1);

namespace App\Domains\Orders\StateMachine;

use App\Domains\Shared\Support\StateMachine;

/**
 * Order status state machine.
 *
 * Statuses:
 *   pending      — created, not yet in kitchen
 *   in_progress  — kitchen is working on it
 *   held         — temporarily held (POS)
 *   partial      — partially paid
 *   paid         — fully paid (triggers promo/loyalty consumption, inventory deduction)
 *   completed    — fully paid AND kitchen bumped (or online fulfilled)
 *   cancelled    — cancelled before payment
 *   refunded     — refund issued after completion
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

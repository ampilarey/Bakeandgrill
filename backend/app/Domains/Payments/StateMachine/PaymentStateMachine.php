<?php

declare(strict_types=1);

namespace App\Domains\Payments\StateMachine;

use App\Domains\Shared\Support\StateMachine;

/**
 * Payment status state machine.
 *
 * Statuses:
 *   created    — payment record exists, gateway not yet called
 *   initiated  — redirect sent to BML gateway
 *   pending    — awaiting webhook confirmation
 *   confirmed  — webhook received, payment successful (terminal)
 *   failed     — gateway returned failure (terminal)
 *   cancelled  — user cancelled at gateway (terminal)
 *   expired    — gateway session timed out (terminal)
 *   refunded   — refund issued (terminal)
 *
 * For POS cash/card payments: created → confirmed directly.
 */
class PaymentStateMachine extends StateMachine
{
    protected function statusField(): string
    {
        return 'status';
    }

    protected function transitions(): array
    {
        return [
            'created' => ['initiated', 'confirmed', 'cancelled'],
            'initiated' => ['pending', 'cancelled', 'failed'],
            'pending' => ['confirmed', 'failed', 'cancelled', 'expired'],
            'confirmed' => ['refunded'],
            'failed' => [],
            'cancelled' => [],
            'expired' => [],
            'refunded' => [],
        ];
    }
}

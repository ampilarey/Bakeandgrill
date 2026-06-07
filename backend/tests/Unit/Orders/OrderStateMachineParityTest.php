<?php

declare(strict_types=1);

namespace Tests\Unit\Orders;

use App\Domains\Orders\StateMachine\OrderStateMachine;
use App\Models\Order;
use App\Services\OrderStatusMachine;
use Tests\TestCase;

/**
 * Production uses App\Services\OrderStatusMachine. The domain
 * OrderStateMachine is not wired yet — this test documents critical
 * production paths and fails if legacy transitions regress.
 */
class OrderStateMachineParityTest extends TestCase
{
    /** @var list<array{string, string}> */
    private const PRODUCTION_CRITICAL = [
        ['pending', 'held'],
        ['held', 'pending'],
        ['pending', 'paid'],
        ['pending', 'partial'],
        ['partial', 'paid'],
        ['payment_pending', 'pending'],
        ['payment_pending', 'paid'],
        ['in_progress', 'ready'],
        ['ready', 'completed'],
        ['paid', 'completed'],
    ];

    public function test_legacy_machine_allows_production_critical_transitions(): void
    {
        $legacy = app(OrderStatusMachine::class);

        foreach (self::PRODUCTION_CRITICAL as [$from, $to]) {
            $this->assertTrue(
                $legacy->isAllowed($from, $to),
                "Legacy OrderStatusMachine must allow {$from} → {$to}",
            );
        }
    }

    public function test_domain_machine_is_not_production_authoritative_yet(): void
    {
        $order = new Order(['status' => 'pending']);
        $domain = OrderStateMachine::for($order);
        $legacy = app(OrderStatusMachine::class);

        // Legacy KDS can skip straight to ready from pending; domain SM omits that edge.
        $this->assertTrue($legacy->isAllowed('pending', 'ready'));
        $this->assertFalse(
            $domain->can('ready'),
            'Domain OrderStateMachine must not be swapped in until parity is achieved.',
        );
    }
}

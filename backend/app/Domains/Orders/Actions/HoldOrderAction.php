<?php

declare(strict_types=1);

namespace App\Domains\Orders\Actions;

use App\Models\Order;
use App\Services\AuditLogService;
use App\Services\OrderStatusMachine;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

final class HoldOrderAction
{
    public function __construct(
        private readonly OrderStatusMachine $statusMachine,
        private readonly AuditLogService $audit,
    ) {}

    /**
     * @param array{ticket_name?: string|null, ticket_note?: string|null} $payload
     */
    public function execute(int $orderId, array $payload, Request $request): Order
    {
        return DB::transaction(function () use ($orderId, $request, $payload) {
            $order = Order::lockForUpdate()->findOrFail($orderId);
            $this->statusMachine->assertTransitionAllowed($order, 'held');
            $oldStatus = $order->status;
            $update = ['status' => 'held', 'held_at' => now()];
            if (array_key_exists('ticket_name', $payload)) {
                $update['ticket_name'] = $payload['ticket_name'] ?: null;
            }
            if (array_key_exists('ticket_note', $payload)) {
                $update['ticket_note'] = $payload['ticket_note'] ?: null;
            }
            $order->update($update);
            $this->audit->log(
                'order.held',
                'Order',
                $order->id,
                ['status' => $oldStatus],
                ['status' => 'held', 'ticket_name' => $order->ticket_name],
                [],
                $request,
            );

            return $order;
        });
    }
}

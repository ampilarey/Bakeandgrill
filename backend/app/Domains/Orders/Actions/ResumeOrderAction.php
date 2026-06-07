<?php

declare(strict_types=1);

namespace App\Domains\Orders\Actions;

use App\Models\Order;
use App\Services\AuditLogService;
use App\Services\OrderStatusMachine;
use App\Services\PrintJobService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

final class ResumeOrderAction
{
    public function __construct(
        private readonly OrderStatusMachine $statusMachine,
        private readonly AuditLogService $audit,
        private readonly PrintJobService $printJobs,
    ) {}

    public function execute(int $orderId, bool $reprintKitchen, Request $request): Order
    {
        $order = DB::transaction(function () use ($orderId, $request) {
            $order = Order::lockForUpdate()->findOrFail($orderId);
            $this->statusMachine->assertTransitionAllowed($order, 'pending');
            $oldStatus = $order->status;
            $order->update(['status' => 'pending', 'held_at' => null]);
            $this->audit->log(
                'order.resumed',
                'Order',
                $order->id,
                ['status' => $oldStatus],
                ['status' => 'pending'],
                [],
                $request,
            );

            return $order;
        });

        if ($reprintKitchen) {
            try {
                $this->printJobs->enqueueKitchen($order->fresh(), reason: 'resume_reprint');
            } catch (\Throwable $e) {
                Log::warning('Kitchen reprint on resume failed', [
                    'order_id' => $order->id,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        return $order;
    }
}

<?php

declare(strict_types=1);

namespace App\Domains\Inventory\Listeners;

use App\Domains\Orders\Events\OrderPaid;
use App\Domains\Orders\Repositories\OrderRepositoryInterface;
use App\Services\StockReservationService;
use Illuminate\Support\Facades\Log;

/**
 * Converts stock reservations into final deductions when an online order is paid.
 *
 * POS orders (dine_in, takeaway) have stock deducted immediately at order creation
 * and are skipped here. Only online_pickup and delivery orders go through reservation.
 *
 * Synchronous after commit so sellable qty updates even if the queue worker is down.
 */
class DeductPreparedStockListener
{
    public bool $afterCommit = true;

    public function __construct(
        private readonly OrderRepositoryInterface $orders,
        private readonly StockReservationService $reservationService,
    ) {}

    public function handle(OrderPaid $event): void
    {
        if (!in_array($event->data->orderType ?? '', ['online_pickup', 'delivery'], true)) {
            // POS orders already deducted stock at creation — nothing to do
            return;
        }

        $order = $this->orders->findWithRelations(
            $event->data->orderId,
            ['items.item'],
        );

        if (!$order) {
            Log::error('DeductPreparedStockListener: order not found', ['order_id' => $event->data->orderId]);

            return;
        }

        if (in_array($order->status, ['cancelled', 'refunded', 'partially_refunded'], true)) {
            Log::info('DeductPreparedStockListener: skipping terminal order', [
                'order_id' => $event->data->orderId,
                'status' => $order->status,
            ]);

            return;
        }

        // Collect-tomorrow: stock was not reserved at create; deduct when staff
        // fires the ticket to kitchen on the collection day (OrderStatusController).
        if ($order->fulfil_date !== null) {
            Log::info('DeductPreparedStockListener: deferring deduction until fire', [
                'order_id' => $event->data->orderId,
                'fulfil_date' => $order->fulfil_date?->toDateString(),
            ]);

            return;
        }

        try {
            $this->reservationService->convertToDeduction($order);
        } catch (\Throwable $e) {
            Log::error('DeductPreparedStockListener: conversion failed', [
                'order_id' => $event->data->orderId,
                'error' => $e->getMessage(),
            ]);
            throw $e;
        }
    }
}

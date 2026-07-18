<?php

declare(strict_types=1);

namespace App\Domains\Payments\Listeners;

use App\Domains\Orders\Events\OrderPaid;
use App\Http\Controllers\Api\InvoiceController;
use App\Models\Order;

/**
 * When an order is fully paid (POS, offline sync, or gateway), mirror that
 * onto the linked sale invoice so /invoices/{token} stops showing balance due.
 */
final class SyncInvoicePaymentOnOrderPaidListener
{
    public function handle(OrderPaid $event): void
    {
        $order = Order::with('payments')->find($event->data->orderId);
        if (!$order) {
            return;
        }

        app(InvoiceController::class)->syncPaymentStateFromOrder($order);
    }
}

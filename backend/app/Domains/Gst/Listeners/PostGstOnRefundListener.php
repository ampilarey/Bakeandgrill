<?php

declare(strict_types=1);

namespace App\Domains\Gst\Listeners;

use App\Domains\Gst\Services\GstLedgerPoster;
use App\Domains\Orders\Events\OrderRefunded;
use App\Models\Refund;
use Illuminate\Support\Facades\Log;

/**
 * Posts GST reversal entries when an order is refunded.
 * Synchronous after commit so GST reverses even if the queue worker is down.
 */
class PostGstOnRefundListener
{
    public bool $afterCommit = true;

    public function __construct(
        private readonly GstLedgerPoster $poster,
    ) {}

    public function handle(OrderRefunded $event): void
    {
        try {
            $refundId = $event->data->refundId ?? null;
            if (!$refundId) {
                return;
            }

            $refund = Refund::with('order')->find($refundId);
            if (!$refund) {
                return;
            }

            $this->poster->postRefund($refund);
        } catch (\Throwable $e) {
            Log::error('PostGstOnRefundListener failed', [
                'refund_id' => $event->data->refundId ?? null,
                'error' => $e->getMessage(),
            ]);
            throw $e;
        }
    }
}

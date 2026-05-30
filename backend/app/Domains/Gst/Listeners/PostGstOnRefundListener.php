<?php

declare(strict_types=1);

namespace App\Domains\Gst\Listeners;

use App\Domains\Gst\Services\GstLedgerPoster;
use App\Domains\Orders\Events\OrderRefunded;
use App\Models\Refund;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Support\Facades\Log;

class PostGstOnRefundListener implements ShouldQueue
{
    public bool $afterCommit = true;

    public string $queue = 'default';

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

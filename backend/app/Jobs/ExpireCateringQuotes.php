<?php

declare(strict_types=1);

namespace App\Jobs;

use App\Domains\Catering\Services\CateringLifecycleNotifier;
use App\Models\CateringRequest;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class ExpireCateringQuotes implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;

    public int $backoff = 30;

    public int $timeout = 120;

    public function handle(CateringLifecycleNotifier $notifier): void
    {
        $ids = CateringRequest::query()
            ->where('status', 'awaiting_customer')
            ->whereNotNull('quote_expires_at')
            ->where('quote_expires_at', '<', now())
            ->pluck('id');

        foreach ($ids as $id) {
            DB::transaction(function () use ($id, $notifier) {
                /** @var CateringRequest|null $row */
                $row = CateringRequest::query()->lockForUpdate()->find($id);
                if (!$row || $row->status !== 'awaiting_customer') {
                    return;
                }
                if (!$row->quote_expires_at || !$row->quote_expires_at->isPast()) {
                    return;
                }

                $row->update([
                    'status' => 'quoted',
                    'quote_token' => null,
                    'quote_sent_at' => null,
                    'quote_expires_at' => null,
                    // Keep payment amount/version for audit; clear live link fields only.
                ]);

                DB::afterCommit(function () use ($row, $notifier) {
                    $notifier->notifyQuoteExpired($row->fresh() ?? $row);
                });
            });
        }
    }

    public function failed(\Throwable $e): void
    {
        Log::error('ExpireCateringQuotes failed', ['error' => $e->getMessage()]);
    }
}

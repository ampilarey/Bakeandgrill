<?php

declare(strict_types=1);

namespace App\Jobs;

use App\Domains\Catering\Services\CateringLifecycleNotifier;
use App\Models\CateringRequest;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\DB;

/**
 * Ops audit, 2026-09-25: a quote awaiting the customer used to expire in
 * silence. Once, when less than a day is left, the customer and the staff
 * contact are told.
 */
class NudgeExpiringCateringQuotes implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public int $backoff = 30;

    public function handle(CateringLifecycleNotifier $notifier): void
    {
        $ids = CateringRequest::query()
            ->where('status', 'awaiting_customer')
            ->whereNotNull('quote_expires_at')
            ->whereNull('quote_nudged_at')
            ->where('quote_expires_at', '>', now())
            ->where('quote_expires_at', '<=', now()->addDay())
            ->pluck('id');

        foreach ($ids as $id) {
            DB::transaction(function () use ($id, $notifier): void {
                $row = CateringRequest::query()->lockForUpdate()->find($id);
                if (!$row || $row->status !== 'awaiting_customer' || $row->quote_nudged_at !== null) {
                    return;
                }
                $row->update(['quote_nudged_at' => now()]);
                DB::afterCommit(fn () => $notifier->notifyQuoteExpiring($row->fresh() ?? $row));
            });
        }
    }
}

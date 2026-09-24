<?php

declare(strict_types=1);

namespace App\Jobs;

use App\Domains\Catering\Services\CateringLifecycleNotifier;
use App\Models\CateringRequest;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\DB;

/**
 * Ops audit, 2026-09-25: the day after a catered event, a thank-you and
 * an ask for feedback. Once per event.
 */
class SendCateringThankYous implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public int $backoff = 30;

    public function handle(CateringLifecycleNotifier $notifier): void
    {
        $yesterday = now(config('app.timezone', 'Indian/Maldives'))->subDay()->toDateString();
        $ids = CateringRequest::query()
            ->whereIn('status', ['confirmed', 'completed'])
            ->whereDate('event_date', $yesterday)
            ->whereNull('thank_you_sent_at')
            ->pluck('id');

        foreach ($ids as $id) {
            DB::transaction(function () use ($id, $notifier): void {
                $row = CateringRequest::query()->lockForUpdate()->find($id);
                if (!$row || $row->thank_you_sent_at !== null) {
                    return;
                }
                $row->update(['thank_you_sent_at' => now()]);
                DB::afterCommit(fn () => $notifier->notifyThankYou($row->fresh() ?? $row));
            });
        }
    }
}

<?php

declare(strict_types=1);

namespace App\Domains\Sms\Services;

use App\Domains\Sms\Jobs\SendScheduledSmsJob;
use App\Models\SmsScheduledMessage;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class SmsSchedulerService
{
    /**
     * Find all due scheduled messages and dispatch their send jobs.
     * Updates next_send_at for recurring messages and marks one-time messages as completed.
     *
     * @return int Number of messages dispatched
     */
    public function dispatchDue(Carbon $now): int
    {
        // Collect IDs first without a lock so the SELECT is fast.
        $ids = SmsScheduledMessage::query()
            ->where('status', 'active')
            ->where('next_send_at', '<=', $now)
            ->pluck('id');

        $dispatched = 0;

        foreach ($ids as $id) {
            try {
                DB::transaction(function () use ($id, $now, &$dispatched): void {
                    // Re-check inside a transaction with a row-level lock to prevent
                    // duplicate dispatch when two scheduler runs overlap.
                    $scheduled = SmsScheduledMessage::lockForUpdate()->find($id);

                    if (! $scheduled || $scheduled->status !== 'active') {
                        return; // Already picked up by another process.
                    }
                    if ($scheduled->next_send_at > $now) {
                        return; // Advanced by another process for a recurring message.
                    }

                    // Advance / complete the row BEFORE dispatching so a second
                    // concurrent process cannot pick up the same ID.
                    if ($scheduled->is_recurring) {
                        $nextSendAt = $scheduled->computeNextSendAt($now);
                        $scheduled->update([
                            'last_sent_at' => $now,
                            'next_send_at' => $nextSendAt,
                        ]);
                    } else {
                        $scheduled->update([
                            'last_sent_at' => $now,
                            'next_send_at' => null,
                            'status' => 'completed',
                        ]);
                    }

                    SendScheduledSmsJob::dispatch($scheduled->id);
                    $dispatched++;
                });
            } catch (\Throwable $e) {
                Log::error('SmsSchedulerService: failed to dispatch scheduled message', [
                    'id' => $id,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        return $dispatched;
    }

    /**
     * Compute and set next_send_at when a new scheduled message is created.
     */
    public function initializeNextSendAt(SmsScheduledMessage $message): void
    {
        if ($message->is_recurring) {
            $now = Carbon::now();
            $nextSendAt = $message->computeNextSendAt($now);
            $message->update(['next_send_at' => $nextSendAt]);
        } else {
            $message->update(['next_send_at' => $message->send_at]);
        }
    }
}
